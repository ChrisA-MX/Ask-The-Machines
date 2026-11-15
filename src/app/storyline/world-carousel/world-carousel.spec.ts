import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Group } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORLDS, WorldId } from '../machines.data';
import { carouselLayout, nextCarouselIndex, planetNormalizationScale, worldSlotTarget, WorldCarousel } from './world-carousel';
import { ProceduralWorld, WORLD_MODULE_LOADER, WorldsService } from '../../worlds/worlds.service';
import { MILKY_WAY_STYLE } from '../../worlds/milky-way';

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

  it('places the active world in front and keeps adjacent worlds symmetric', () => {
    const center = worldSlotTarget(1, 1, 3);
    const left = worldSlotTarget(0, 1, 3);
    const right = worldSlotTarget(2, 1, 3);
    expect(center).toMatchObject({ position: { x: 0, z: 0 }, scale: 1.43, brightness: 1 });
    expect(left.position.x).toBe(-right.position.x);
    expect(left.position.z).toBe(right.position.z);
    expect(left.scale).toBeLessThan(center.scale);
  });

  it('gives side worlds extra room on narrow screens when the galaxy is centered', () => {
    const mobileLayout = { centerScale: 1.43, sideScale: 0.89, sideSpacing: 2.5, sideDepth: 0.6 };
    expect(worldSlotTarget(1, 2, 3, mobileLayout).scale).toBeCloseTo(0.89 * 0.72);
    expect(worldSlotTarget(0, 2, 3, mobileLayout).scale).toBeCloseTo(0.89 * 0.72);
    expect(worldSlotTarget(0, 1, 3, mobileLayout).scale).toBe(0.89);
  });

  it('normalizes NASA model radii from source units into the carousel radius', () => {
    expect(planetNormalizationScale(500, 1.3)).toBeCloseTo(0.0026);
  });

  it('keeps the Milky Way centered, tilted, and rotating at the intended rates', () => {
    expect(MILKY_WAY_STYLE.centerSpinRadiansPerSecond).toBeCloseTo(0.10472, 4);
    expect(MILKY_WAY_STYLE.sideSpinRadiansPerSecond).toBeCloseTo(0.05236, 4);
    expect(MILKY_WAY_STYLE.tiltDegrees).toBe(55);
    expect(MILKY_WAY_STYLE.scale).toBe(1.38);
    expect(MILKY_WAY_STYLE.colorGain).toBe(1.65);
  });

  it('sizes the center slot consistently and adapts side spacing to canvas aspect', () => {
    const camera = { fov: 38, position: { z: 10.8 } } as never;
    const visibleHeight = 2 * 10.8 * Math.tan(38 * Math.PI / 360);
    const canvases = [[1184, 544], [944, 430], [688, 544], [335, 312]];
    const layouts = canvases.map(([width, height]) => carouselLayout(camera, width, height, 1.3));
    for (const layout of layouts) expect(2 * 1.3 * layout.centerScale / visibleHeight).toBeCloseTo(0.5);
    expect(layouts[3].sideSpacing).toBeLessThan(layouts[0].sideSpacing);
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

  it('restores the selected world when the carousel is recreated', () => {
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
    fixture.componentRef.setInput('initialIndex', 1);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.world-copy h2')?.textContent?.trim()).toBe('Mars');
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
    fixture.componentRef.setInput('initialIndex', 1);
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { isLoading: { set(value: boolean): void } }).isLoading.set(false);
    const enterWorld = vi.fn();
    fixture.componentInstance.enterWorld.subscribe(enterWorld);
    const button = fixture.nativeElement.querySelector('.explore-button') as HTMLButtonElement;
    expect(button.textContent).toContain('World locked');
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
