import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Group } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORLDS, WorldId } from '../machines.data';
import { nextCarouselIndex, WorldCarousel } from './world-carousel';
import { ProceduralWorld, WORLD_MODULE_LOADER, WorldsService } from '../../worlds/worlds.service';

describe('world carousel', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('wraps next and previous selection around the three worlds', () => {
    expect(nextCarouselIndex(2, 1, WORLDS.length)).toBe(0);
    expect(nextCarouselIndex(0, -1, WORLDS.length)).toBe(2);
  });

  it('maps the page arrow keys to carousel navigation', () => {
    TestBed.configureTestingModule({
      imports: [WorldCarousel],
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: WorldsService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(WorldCarousel);
    fixture.componentRef.setInput('worlds', WORLDS);
    fixture.componentRef.setInput('unlocked', [true, true, true]);
    fixture.componentRef.setInput('progress', [0, 0, 0]);
    fixture.detectChanges();
    const instance = fixture.componentInstance as unknown as { isLoading: { set(value: boolean): void }; loadError: string; activeIndex: number; transitioning: boolean };
    instance.isLoading.set(false);
    instance.loadError = '';

    vi.useFakeTimers();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    vi.advanceTimersByTime(181);
    expect(instance.activeIndex).toBe(1);
    instance.transitioning = false; // Renderer is intentionally absent in the SSR-safe component test.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    vi.advanceTimersByTime(181);
    expect(instance.activeIndex).toBe(0);
    fixture.destroy();
  });

  it('does not emit entry for a locked world', () => {
    TestBed.configureTestingModule({
      imports: [WorldCarousel],
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: WorldsService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(WorldCarousel);
    fixture.componentRef.setInput('worlds', WORLDS);
    fixture.componentRef.setInput('unlocked', [true, false, false]);
    fixture.componentRef.setInput('progress', [0, 0, 0]);
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { activeIndex: number }).activeIndex = 1;
    fixture.detectChanges();
    const enterWorld = vi.fn();
    fixture.componentInstance.enterWorld.subscribe(enterWorld);
    const button = fixture.nativeElement.querySelector('.explore-button') as HTMLButtonElement;
    button.click();
    expect(enterWorld).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('creates only the procedural outer world and disposes it at service teardown', async () => {
    const disposals: ReturnType<typeof vi.fn>[] = [];
    const createWorld = vi.fn((_three: unknown, id: WorldId): ProceduralWorld => {
      const dispose = vi.fn();
      disposals.push(dispose);
      return {
        id,
        object: {} as Group,
        radius: 1,
        update: () => undefined,
        setQuality: () => undefined,
        ready: Promise.resolve(),
        latLonToVector3: () => ({}) as never,
        dispose,
      };
    });
    const loadModule = vi.fn(async () => ({ createWorld }));
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: WORLD_MODULE_LOADER, useValue: loadModule },
      ],
    });
    const service = TestBed.inject(WorldsService);
    const three = {} as typeof import('three');
    const firstLoad = await service.getWorlds(three, 'low');
    const secondLoad = await service.getWorlds(three, 'low');
    expect(firstLoad).toBe(secondLoad);
    expect(firstLoad.map((world) => world.id)).toEqual(['outer']);
    expect(createWorld).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    await Promise.resolve();
    expect(disposals).toHaveLength(1);
    expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
  });

  it('does not load Three or the worlds module on the server', async () => {
    const loadModule = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: WORLD_MODULE_LOADER, useValue: loadModule },
      ],
    });
    const service = TestBed.inject(WorldsService);
    await expect(service.getWorlds({} as typeof import('three'), 'low')).rejects.toThrow('only be created in a browser');
    expect(loadModule).not.toHaveBeenCalled();
  });
});
