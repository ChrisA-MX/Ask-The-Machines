import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, OnDestroy, PLATFORM_ID } from '@angular/core';
import type { Group, Vector3 } from 'three';
import type { WorldId } from '../storyline/machines.data';

export type WorldQuality = 'low' | 'medium' | 'high';

export interface ProceduralWorld {
  readonly id: WorldId;
  readonly object: Group;
  readonly radius: number;
  update(dt: number): void;
  setQuality(quality: WorldQuality): void;
  readonly ready: Promise<void>;
  latLonToVector3(latitude: number, longitude: number, altitude?: number): Vector3;
  dispose(): void;
}

interface WorldModule {
  createWorld(
    three: typeof import('three'),
    id: WorldId,
    options: { quality: WorldQuality; seed: number },
  ): ProceduralWorld;
}

/** The callback is invoked only from a browser-only lifecycle path. */
export const WORLD_MODULE_LOADER = new InjectionToken<() => Promise<WorldModule>>(
  'WORLD_MODULE_LOADER',
  { factory: () => () => import('./worlds/index') },
);

/**
 * Owns the generated outer system for the app lifetime. Route changes can
 * dispose their renderer while reusing this cached world object.
 */
@Injectable({ providedIn: 'root' })
export class WorldsService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly loadModule = inject(WORLD_MODULE_LOADER);
  private readonly cache = new Map<WorldQuality, Promise<ProceduralWorld[]>>();
  private readonly allCreations = new Set<Promise<ProceduralWorld[]>>();
  private qualityNoteWritten = false;
  private destroyed = false;

  /** Latest measured readiness time for each world and tier (milliseconds). */
  readonly generationTimesMs = new Map<WorldQuality, Partial<Record<WorldId, number>>>();

  getWorlds(three: typeof import('three'), quality: WorldQuality): Promise<ProceduralWorld[]> {
    if (this.destroyed) return Promise.reject(new Error('World generation is unavailable after app teardown.'));
    if (!isPlatformBrowser(this.platformId)) {
      return Promise.reject(new Error('Procedural worlds can only be created in a browser.'));
    }
    const cached = this.cache.get(quality);
    if (cached) return cached;

    const promise = this.createWorlds(three, quality);
    this.cache.set(quality, promise);
    this.allCreations.add(promise);
    void promise.catch(() => {
      if (this.cache.get(quality) === promise) this.cache.delete(quality);
    });
    return promise;
  }

  retryWorlds(three: typeof import('three'), quality: WorldQuality): Promise<ProceduralWorld[]> {
    this.cache.delete(quality);
    return this.getWorlds(three, quality);
  }

  ngOnDestroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const creation of this.allCreations) {
      void creation.then((worlds) => worlds.forEach((world) => world.dispose()), () => undefined);
    }
    this.cache.clear();
  }

  private async createWorlds(three: typeof import('three'), quality: WorldQuality): Promise<ProceduralWorld[]> {
    const { createWorld } = await this.loadModule();
    if (this.destroyed) throw new Error('World generation was cancelled during application teardown.');

    const ids: WorldId[] = ['outer'];
    const started = new Map<WorldId, number>();
    const worlds: ProceduralWorld[] = [];
    const timings: Partial<Record<WorldId, number>> = {};
    try {
      for (const id of ids) {
        started.set(id, performance.now());
        const seed = id === 'moon' ? 1101 : id === 'mars' ? 2202 : 3303;
        worlds.push(createWorld(three, id, { quality, seed }));
      }
      await Promise.all(worlds.map(async (world) => {
        await world.ready;
        timings[world.id] = Math.round(performance.now() - (started.get(world.id) ?? performance.now()));
      }));
    } catch (error) {
      worlds.forEach((world) => world.dispose());
      throw error;
    }
    if (this.destroyed) {
      worlds.forEach((world) => world.dispose());
      throw new Error('World generation was cancelled during application teardown.');
    }

    this.generationTimesMs.set(quality, timings);
    if (!this.qualityNoteWritten) {
      console.debug(`[WorldsService] Procedural worlds use the ${quality} quality tier.`);
      this.qualityNoteWritten = true;
    }
    console.debug(`[WorldsService] First-ready generation time by world (${quality}, ms):`, timings);
    return worlds;
  }
}

/** Low tier on phones, medium on desktop to keep procedural generation responsive. */
export function qualityForDevice(viewportWidth: number, hardwareConcurrency: number): WorldQuality {
  return viewportWidth < 760 || hardwareConcurrency <= 4 ? 'low' : 'medium';
}
