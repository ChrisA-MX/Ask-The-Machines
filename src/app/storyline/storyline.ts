import { isPlatformBrowser } from '@angular/common';
import { afterEveryRender, afterNextRender, Component, DestroyRef, ElementRef, HostBinding, HostListener, inject, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MachineStory, WORLDS, WorldStory, WorldId } from './machines.data';
import { SpaceDoodle } from './space-doodle/space-doodle';
import { StoryModal } from './story-modal/story-modal';
import { WorldCarousel } from './world-carousel/world-carousel';
import { ProgressService, PROGRESS_STORAGE_KEY } from '../services/progress.service';

export interface PathPoint { x: number; y: number }

/** Places a requested number of stops at equal distances along the actual SVG path. */
export function pointsAlongPath(path: Pick<SVGPathElement, 'getTotalLength' | 'getPointAtLength'>, count: number): PathPoint[] {
  const length = path.getTotalLength();
  if (!Number.isFinite(length) || length <= 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const point = path.getPointAtLength(length * (index + 1) / (count + 1));
    return { x: point.x, y: point.y };
  });
}

export function isWorldUnlocked(worlds: WorldStory[], completed: ReadonlySet<string>, index: number): boolean {
  if (index <= 0) return true;
  return worlds.slice(0, index).every((world) => world.machines.every((entry) => completed.has(entry.id)));
}

export function isMachineUnlocked(worlds: WorldStory[], completed: ReadonlySet<string>, worldIndex: number, machineIndex: number): boolean {
  const world = worlds[worldIndex];
  if (!world || !isWorldUnlocked(worlds, completed, worldIndex)) return false;
  return world.machines.slice(0, machineIndex).every((entry) => completed.has(entry.id));
}

@Component({
  imports: [RouterLink, SpaceDoodle, StoryModal, WorldCarousel], selector: 'app-storyline',
  styleUrl: './storyline.css', templateUrl: './storyline.html'
})
export class Storyline {
  @HostBinding('class.has-story-modal')
  protected get hasStoryModal(): boolean { return this.selectedStory() !== null; }
  protected readonly worlds = WORLDS;
  protected readonly viewBoxWidth = 1000;
  protected readonly nodePositions = signal<PathPoint[]>([]);
  protected readonly activeWorld = signal<WorldStory | null>(null);
  protected readonly zoomingWorld = signal<WorldId | null>(null);
  protected readonly selectedStory = signal<MachineStory | null>(null);
  protected readonly activePeek = signal<string | null>(null);
  protected readonly dismissedPeek = signal<string | null>(null);
  protected readonly completedIds = signal<Set<string>>(new Set());
  protected readonly pageHidden = signal(false);
  protected readonly doodles = [
    { kind: 'planet' as const, message: 'Every world keeps a few secrets.', x: 2, y: 7 },
    { kind: 'star' as const, message: 'A tiny beacon on the trail.', x: 88, y: 19 },
    { kind: 'astronaut' as const, message: 'Hello, space explorer!', x: 2, y: 34 },
    { kind: 'rocket' as const, message: 'A new mission is taking shape.', x: 88, y: 48 },
    { kind: 'satellite' as const, message: 'Keep following the signal.', x: 2, y: 63 },
    { kind: 'comet' as const, message: 'A bright idea just passed by.', x: 88, y: 78 },
    { kind: 'rocket' as const, message: 'Ready for the next stop?', x: 2, y: 90 },
    { kind: 'astronaut' as const, message: 'See you at the next world!', x: 88, y: 93 },
  ];

  private readonly platformId = inject(PLATFORM_ID);
  private readonly roadmapElement = viewChild<ElementRef<HTMLDivElement>>('sceneRoadmap');
  private readonly trailPath = viewChild<ElementRef<SVGPathElement>>('trailPath');
  private readonly destroyRef = inject(DestroyRef);
  private readonly progress = inject(ProgressService);
  private raf = 0;
  private scrollHandler?: () => void;
  private visibilityHandler?: () => void;
  private resizeObserver?: ResizeObserver;
  private observedRoadmap?: HTMLDivElement;
  private hidden = false;
  private reducedMotion = false;
  private zoomTimer?: number;
  private activeStopIndex = signal(0);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => this.initializeBrowserState());
      afterEveryRender(() => {
        this.observeScene();
        this.updateNodePositions();
      });
    }
    this.destroyRef.onDestroy(() => {
      if (typeof window !== 'undefined' && this.scrollHandler) window.removeEventListener('scroll', this.scrollHandler);
      if (typeof document !== 'undefined' && this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler);
      if (typeof window !== 'undefined') window.cancelAnimationFrame(this.raf);
      if (typeof window !== 'undefined' && this.zoomTimer) window.clearTimeout(this.zoomTimer);
      this.resizeObserver?.disconnect();
    });
  }

  protected openWorld(world: WorldStory, worldIndex: number): void {
    if (!isWorldUnlocked(this.worlds, this.completedIds(), worldIndex)) return;
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.reducedMotion) {
      this.activeWorld.set(world);
      this.activeStopIndex.set(this.firstAvailableMachineIndex(world));
      return;
    }
    this.zoomingWorld.set(world.id);
    if (this.zoomTimer) window.clearTimeout(this.zoomTimer);
    this.zoomTimer = window.setTimeout(() => {
      this.activeWorld.set(world);
      this.activeStopIndex.set(this.firstAvailableMachineIndex(world));
      this.zoomingWorld.set(null);
    }, 360);
  }

  protected backToWorldMap(): void {
    this.selectedStory.set(null);
    this.activeWorld.set(null);
    this.activePeek.set(null);
    this.nodePositions.set([]);
  }

  protected openStory(machine: MachineStory, event?: Event): void {
    event?.stopPropagation();
    this.activePeek.set(null);
    this.selectedStory.set(machine);
    const world = this.activeWorld();
    const index = world?.machines.findIndex((entry) => entry.id === machine.id) ?? -1;
    if (index >= 0) this.activeStopIndex.set(index);
  }

  protected finishStory(machine: MachineStory): void {
    const updated = new Set(this.completedIds());
    updated.add(machine.id);
    this.completedIds.set(updated);
    this.persistProgress(updated);
    this.progress.setCompletedStoryIds(updated);
    const world = this.activeWorld();
    if (world) this.activeStopIndex.set(this.firstAvailableMachineIndex(world));
  }

  protected closeStory(): void { this.selectedStory.set(null); }
  protected isMachineCompleted(id: string): boolean { return this.completedIds().has(id); }
  protected completedCount(world: WorldStory): number { return world.machines.filter((entry) => this.completedIds().has(entry.id)).length; }
  protected worldProgress(): number[] { return this.worlds.map((world) => this.completedCount(world)); }
  protected worldUnlocks(): boolean[] { return this.worlds.map((_, index) => this.worldUnlocked(index)); }
  protected worldUnlocked(index: number): boolean { return isWorldUnlocked(this.worlds, this.completedIds(), index); }
  protected machineUnlocked(world: WorldStory, machineIndex: number): boolean {
    return isMachineUnlocked(this.worlds, this.completedIds(), this.worlds.indexOf(world), machineIndex);
  }
  protected stopNumber(world: WorldStory): number { return this.activeStopIndex() + 1; }

  protected trailPathFor(world: WorldStory): string {
    const height = world.viewBoxHeight;
    const steps = world.machines.length * 2;
    const segmentHeight = height / steps;
    let d = 'M 500 0';
    let previousX = 500;
    for (let step = 1; step <= steps; step++) {
      const nextX = step === steps ? 500 : (step % 2 ? 690 : 310);
      const y0 = (step - 1) * segmentHeight;
      const y1 = step * segmentHeight;
      const delta = nextX - previousX;
      d += ` C ${previousX + delta * 0.64} ${y0 + segmentHeight * 0.32}, ${nextX - delta * 0.64} ${y0 + segmentHeight * 0.68}, ${nextX} ${y1}`;
      previousX = nextX;
    }
    return d;
  }

  protected peek(id: string, machineIndex: number): void {
    if (this.dismissedPeek() !== id) this.activePeek.set(id);
    this.activeStopIndex.set(machineIndex);
  }

  protected clearPeek(id: string, event?: Event): void {
    if (typeof PointerEvent !== 'undefined' && event instanceof PointerEvent && event.pointerType === 'touch') return;
    const related = event instanceof FocusEvent ? event.relatedTarget : (typeof PointerEvent !== 'undefined' && event instanceof PointerEvent) ? event.relatedTarget : null;
    if (typeof Element !== 'undefined' && related instanceof Element && related.closest('.roadmap-node, .stop-card')) return;
    if (this.activePeek() === id) this.activePeek.set(null);
    if (this.dismissedPeek() === id) this.dismissedPeek.set(null);
  }

  protected activatePeek(id: string, machineIndex: number, event: Event): void {
    event.stopPropagation();
    this.dismissedPeek.set(null);
    this.activePeek.set(id);
    this.activeStopIndex.set(machineIndex);
  }

  protected closeActivePeek(): void {
    if (this.activePeek()) this.dismissedPeek.set(this.activePeek());
    this.activePeek.set(null);
  }

  protected unlockAllDemo(): void {
    const completed = new Set(this.worlds.flatMap((world) => world.machines.map((entry) => entry.id)));
    this.completedIds.set(completed);
    this.persistProgress(completed);
    this.progress.setCompletedStoryIds(completed);
  }

  protected resetProgress(): void {
    this.completedIds.set(new Set());
    this.activeStopIndex.set(0);
    if (isPlatformBrowser(this.platformId)) {
      try { localStorage.removeItem(PROGRESS_STORAGE_KEY); } catch { /* Storage may be unavailable in private browsing. */ }
    }
    this.progress.setCompletedStoryIds([]);
  }

  @HostListener('document:keydown.escape')
  private handleEscape(): void { this.closeActivePeek(); }

  @HostListener('document:click', ['$event'])
  private handleDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (typeof Element === 'undefined' || !(target instanceof Element) || !target.closest('.roadmap-node, .stop-card')) {
      this.closeActivePeek();
    }
  }

  private firstAvailableMachineIndex(world: WorldStory): number {
    const index = world.machines.findIndex((entry, machineIndex) =>
      isMachineUnlocked(this.worlds, this.completedIds(), this.worlds.indexOf(world), machineIndex) && !this.completedIds().has(entry.id));
    return index < 0 ? Math.max(0, world.machines.length - 1) : index;
  }

  private initializeBrowserState(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? '[]');
      if (Array.isArray(saved)) {
        const validIds = new Set(this.worlds.flatMap((world) => world.machines.map((entry) => entry.id)));
        const completed = new Set(saved.filter((id): id is string => typeof id === 'string' && validIds.has(id)));
        this.completedIds.set(completed);
        this.progress.setCompletedStoryIds(completed);
      }
    } catch { /* Invalid or unavailable browser storage starts a clean session. */ }
    this.hidden = document.hidden;
    this.pageHidden.set(this.hidden);
    this.visibilityHandler = () => { this.hidden = document.hidden; this.pageHidden.set(this.hidden); };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.reducedMotion) return;
    this.scrollHandler = () => {
      if (this.hidden || this.raf) return;
      this.raf = window.requestAnimationFrame(() => {
        this.raf = 0;
        const progress = Math.min(window.scrollY / Math.max(document.documentElement.scrollHeight - window.innerHeight, 1), 1);
        document.querySelectorAll<HTMLElement>('.roadmap-doodle').forEach((element, index) => {
          element.style.setProperty('--parallax', `${(progress - .5) * (index % 2 ? -10 : 10)}px`);
        });
      });
    };
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  private observeScene(): void {
    if (!isPlatformBrowser(this.platformId) || typeof ResizeObserver === 'undefined') return;
    const roadmap = this.roadmapElement()?.nativeElement;
    if (!roadmap || roadmap === this.observedRoadmap) return;
    this.resizeObserver?.disconnect();
    this.observedRoadmap = roadmap;
    this.resizeObserver = new ResizeObserver(() => this.updateNodePositions());
    this.resizeObserver.observe(roadmap);
  }

  private updateNodePositions(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const world = this.activeWorld();
    if (!world) {
      if (this.nodePositions().length) this.nodePositions.set([]);
      return;
    }
    const path = this.trailPath()?.nativeElement;
    if (!path || typeof path.getTotalLength !== 'function' || typeof path.getPointAtLength !== 'function') return;
    const positions = pointsAlongPath(path, world.machines.length);
    if (positions.length !== this.nodePositions().length || positions.some((point, index) =>
      point.x !== this.nodePositions()[index]?.x || point.y !== this.nodePositions()[index]?.y)) {
      this.nodePositions.set(positions);
    }
  }

  private persistProgress(completed: Set<string>): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify([...completed])); } catch { /* Progress remains available for this page session. */ }
  }
}
