import { isPlatformBrowser } from '@angular/common';
import { Overlay, OverlayContainer, OverlayModule, OverlayRef } from '@angular/cdk/overlay';
import { PortalModule, TemplatePortal } from '@angular/cdk/portal';
import { afterEveryRender, afterNextRender, Component, DestroyRef, ElementRef, HostBinding, HostListener, inject, PLATFORM_ID, signal, TemplateRef, ViewContainerRef, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CONNECT_THE_DOTS, MachineStory, WORLDS, WorldStory, WorldId } from './machines.data';
import { SpaceDoodle } from './space-doodle/space-doodle';
import { WorldCarousel } from './world-carousel/world-carousel';
import { ProgressService } from '../services/progress.service';
import { MiniGameShell } from './mini-games/mini-game-shell';
import { placePreviewCard, PreviewRect } from './preview-placement';
import { StorylineNavigationService } from './storyline-navigation.service';
import { ProfileMenu } from '../components/profile-menu/profile-menu';

interface PreviewCardContext {
  machine: MachineStory | null;
  world: WorldStory;
  machineIndex: number;
  isMiniGame: boolean;
}

export interface PathPoint { x: number; y: number }

function rectForPlacement(rect: DOMRect): PreviewRect {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
}

/** Places a requested number of stops at equal distances along the actual SVG path. */
export function pointsAlongPath(path: Pick<SVGPathElement, 'getTotalLength' | 'getPointAtLength'>, count: number): PathPoint[] {
  const length = path.getTotalLength();
  if (!Number.isFinite(length) || length <= 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const point = path.getPointAtLength(length * (index + 1) / (count + 1));
    return { x: point.x, y: point.y };
  });
}

export const WORLD_UNLOCK_REQUIRES_MINI_GAME = false;

export function isWorldUnlocked(worlds: WorldStory[], completed: ReadonlySet<string>, index: number, completedGames: ReadonlySet<string> = new Set()): boolean {
  if (index <= 0) return true;
  return worlds.slice(0, index).every((world) => world.machines.every((entry) => completed.has(entry.id)) && (!WORLD_UNLOCK_REQUIRES_MINI_GAME || completedGames.has(world.id)));
}

export function isMachineUnlocked(worlds: WorldStory[], completed: ReadonlySet<string>, worldIndex: number, machineIndex: number, completedGames: ReadonlySet<string> = new Set()): boolean {
  const world = worlds[worldIndex];
  if (!world || !isWorldUnlocked(worlds, completed, worldIndex, completedGames)) return false;
  return world.machines.slice(0, machineIndex).every((entry) => completed.has(entry.id));
}

export function isMiniGameUnlocked(worlds: WorldStory[], completed: ReadonlySet<string>, worldIndex: number, completedGames: ReadonlySet<string> = new Set()): boolean {
  const world = worlds[worldIndex];
  return !!world && isWorldUnlocked(worlds, completed, worldIndex, completedGames) && world.machines.every((entry) => completed.has(entry.id));
}

@Component({
  imports: [RouterLink, RouterLinkActive, OverlayModule, PortalModule, SpaceDoodle, WorldCarousel, MiniGameShell, ProfileMenu], selector: 'app-storyline',
  styleUrl: './storyline.css', templateUrl: './storyline.html'
})
export class Storyline {
  @HostBinding('class.has-active-preview')
  protected get hasActivePreview(): boolean { return this.activePeek() !== null; }
  protected readonly worlds = WORLDS;
  protected readonly connectTheDots = CONNECT_THE_DOTS;
  protected readonly viewBoxWidth = 1000;
  protected readonly compactTrail = signal(false);
  protected readonly nodePositions = signal<PathPoint[]>([]);
  protected readonly activeWorld = signal<WorldStory | null>(null);
  protected readonly selectedWorldIndex = signal(0);
  protected readonly zoomingWorld = signal<WorldId | null>(null);
  protected readonly activePeek = signal<string | null>(null);
  protected readonly dismissedPeek = signal<string | null>(null);
  protected readonly completedIds = signal<Set<string>>(new Set());
  protected readonly completedGameIds = signal<Set<string>>(new Set());
  protected readonly selectedMiniGameWorld = signal<WorldStory | null>(null);
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
  private readonly previewCardTemplate = viewChild<TemplateRef<PreviewCardContext>>('previewCardTemplate');
  private readonly destroyRef = inject(DestroyRef);
  private readonly progress = inject(ProgressService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly navigationState = inject(StorylineNavigationService);
  private readonly overlay = inject(Overlay);
  private readonly overlayContainer = inject(OverlayContainer);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private raf = 0;
  private scrollHandler?: () => void;
  private visibilityHandler?: () => void;
  private resizeObserver?: ResizeObserver;
  private observedRoadmap?: HTMLDivElement;
  private hidden = false;
  private reducedMotion = false;
  private zoomTimer?: number;
  private activeStopIndex = signal(0);
  private previewOverlay?: OverlayRef;
  private previewTarget?: HTMLButtonElement;
  private previewCloseTimer?: number;
  private previewPositionFrame = 0;
  private previewResizeObserver?: ResizeObserver;
  private pendingNodeFocus?: string;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        this.initializeBrowserState();
        this.restoreTrailLocation();
        this.openRequestedWorldTrail();
      });
      afterEveryRender(() => {
        this.observeScene();
        this.updateNodePositions();
        this.restoreNodeFocus();
      });
    }
    this.destroyRef.onDestroy(() => {
      if (typeof window !== 'undefined' && this.scrollHandler) window.removeEventListener('scroll', this.scrollHandler);
      if (typeof document !== 'undefined' && this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler);
      if (typeof window !== 'undefined') window.cancelAnimationFrame(this.raf);
      if (typeof window !== 'undefined' && this.zoomTimer) window.clearTimeout(this.zoomTimer);
      if (typeof window !== 'undefined' && this.previewCloseTimer) window.clearTimeout(this.previewCloseTimer);
      if (typeof window !== 'undefined') window.cancelAnimationFrame(this.previewPositionFrame);
      this.previewResizeObserver?.disconnect();
      this.previewOverlay?.dispose();
      this.resizeObserver?.disconnect();
    });
  }

  private openRequestedWorldTrail(): void {
    const worldId = this.route.snapshot.queryParamMap.get('world');
    const worldIndex = this.worlds.findIndex((world) => world.id === worldId);
    if (worldIndex < 0) return;
    this.selectedWorldIndex.set(worldIndex);
    if (this.route.snapshot.queryParamMap.get('trail') !== '1') return;
    const world = this.worlds[worldIndex];
    if (!isWorldUnlocked(this.worlds, this.completedIds(), worldIndex, this.completedGameIds())) return;
    this.activeWorld.set(world);
    this.activeStopIndex.set(this.firstAvailableMachineIndex(world));
  }

  protected openWorld(world: WorldStory, worldIndex: number): void {
    if (!isWorldUnlocked(this.worlds, this.completedIds(), worldIndex, this.completedGameIds())) return;
    if (!isPlatformBrowser(this.platformId)) return;
    this.selectedWorldIndex.set(worldIndex);
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
    this.closeActivePeek();
    this.activeWorld.set(null);
    this.activePeek.set(null);
    this.nodePositions.set([]);
  }

  protected openStory(machine: MachineStory, event?: Event, replaceUrl = false): void {
    event?.stopPropagation();
    this.closeActivePeek();
    const world = this.activeWorld();
    const targetWorld = world ?? this.worlds.find((entry) => entry.id === machine.worldId);
    if (!targetWorld) return;
    const machineIndex = targetWorld.machines.findIndex((entry) => entry.id === machine.id);
    this.navigationState.remember({ worldId: targetWorld.id, machineId: machine.id, scrollY: isPlatformBrowser(this.platformId) ? window.scrollY : 0 });
    void this.router.navigate(['/storylines', targetWorld.id, machine.routeId ?? machine.id], { replaceUrl });
    if (machineIndex >= 0) this.activeStopIndex.set(machineIndex);
  }

  protected onMachineNodeKeydown(machine: MachineStory, machineIndex: number, event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (this.machineUnlocked(this.activeWorld()!, machineIndex)) this.openStory(machine, event);
    else this.activatePeek(machine.id, machineIndex, event);
  }
  protected isMachineCompleted(id: string): boolean { return this.completedIds().has(id); }
  protected completedCount(world: WorldStory): number { return world.machines.filter((entry) => this.completedIds().has(entry.id)).length; }
  protected worldProgress(): number[] { return this.worlds.map((world) => this.completedCount(world)); }
  protected worldUnlocks(): boolean[] { return this.worlds.map((_, index) => this.worldUnlocked(index)); }
  protected worldUnlocked(index: number): boolean { return isWorldUnlocked(this.worlds, this.completedIds(), index, this.completedGameIds()); }
  protected machineUnlocked(world: WorldStory, machineIndex: number): boolean {
    return isMachineUnlocked(this.worlds, this.completedIds(), this.worlds.indexOf(world), machineIndex, this.completedGameIds());
  }
  protected gameCompletions(): boolean[] { return this.worlds.map((world) => this.completedGameIds().has(world.id)); }
  protected gameStatus(world: WorldStory): 'locked' | 'ready' | 'completed' { return this.completedGameIds().has(world.id) ? 'completed' : this.isGameUnlocked(world) ? 'ready' : 'locked'; }
  protected isGameUnlocked(world: WorldStory): boolean { return isMiniGameUnlocked(this.worlds, this.completedIds(), this.worlds.indexOf(world), this.completedGameIds()); }
  protected gameNodeId(world: WorldStory): string { return `mini-game:${world.id}`; }
  protected stopNumber(world: WorldStory): number { return Math.min(this.activeStopIndex() + 1, world.machines.length + 1); }
  protected stopCount(world: WorldStory): number { return world.machines.length + 1; }

  private restoreTrailLocation(): void {
    const context = this.navigationState.consume();
    if (!context) return;
    const worldIndex = this.worlds.findIndex((entry) => entry.id === context.worldId);
    const world = this.worlds[worldIndex];
    if (!world) return;
    this.selectedWorldIndex.set(worldIndex);
    this.activeWorld.set(world);
    const machine = world.machines.find((entry) => entry.id === context.machineId);
    this.activeStopIndex.set(machine ? world.machines.indexOf(machine) : 0);
    this.pendingNodeFocus = machine?.id;
    window.scrollTo({ top: context.scrollY, behavior: 'instant' as ScrollBehavior });
  }

  private restoreNodeFocus(): void {
    const id = this.pendingNodeFocus;
    if (!id || !isPlatformBrowser(this.platformId)) return;
    const node = document.getElementById(`story-node-${id}`);
    if (!node) return;
    this.pendingNodeFocus = undefined;
    requestAnimationFrame(() => node.focus({ preventScroll: true }));
  }

  protected trailPathFor(world: WorldStory): string {
    const stopCount = world.machines.length + 1;
    const waves = Math.max(1, stopCount - 1);
    if (this.compactTrail()) {
      const width = this.sceneViewBoxWidth();
      const height = this.sceneViewBoxHeight(world);
      const center = width / 2;
      const margin = 32;
      const step = (height - margin * 2) / waves;
      const amplitude = Math.min(110, width * 0.28);
      let d = `M ${center} ${margin}`;
      for (let index = 0; index < waves; index++) {
        const x0 = center + (index % 2 ? amplitude : 0);
        const x1 = center + (index % 2 ? 0 : amplitude);
        const y0 = margin + index * step;
        const y1 = margin + (index + 1) * step;
        d += ` C ${x0} ${y0 + step * 0.36}, ${x1} ${y1 - step * 0.36}, ${center + (index % 2 ? 0 : amplitude)} ${y1}`;
      }
      return d;
    }
    const width = this.viewBoxWidth;
    const height = world.viewBoxHeight;
    const step = (width - 70) / waves;
    const amplitude = Math.min(118, height * 0.29);
    let d = `M 35 ${height / 2}`;
    for (let index = 0; index < waves; index++) {
      const x0 = 35 + index * step;
      const x1 = 35 + (index + 1) * step;
      const y0 = index === 0 ? height / 2 : height / 2 + (index % 2 ? -amplitude : amplitude);
      const y1 = height / 2 + (index % 2 ? -amplitude : amplitude);
      d += ` C ${x0 + step * 0.34} ${y0}, ${x1 - step * 0.34} ${y1}, ${x1} ${y1}`;
    }
    return d;
  }

  protected sceneViewBoxWidth(): number { return this.compactTrail() ? 420 : this.viewBoxWidth; }
  protected sceneViewBoxHeight(world: WorldStory): number { return this.compactTrail() ? (world.machines.length + 1) * 106 : world.viewBoxHeight; }

  protected peek(id: string, machineIndex: number, event?: Event): void {
    this.cancelPreviewClose();
    if (this.dismissedPeek() === id) return;
    const target = event?.currentTarget;
    if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return;
    const world = this.activeWorld();
    const machine = world?.machines[machineIndex];
    if (!world || !machine) return;
    this.activeStopIndex.set(machineIndex);
    this.attachPreviewCard(id, machine, world, machineIndex, false, target as HTMLButtonElement);
  }

  protected peekMiniGame(event: Event): void {
    this.cancelPreviewClose();
    const world = this.activeWorld();
    const target = event.currentTarget;
    if (!world || typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return;
    const id = this.gameNodeId(world);
    if (this.dismissedPeek() === id) return;
    this.activeStopIndex.set(world.machines.length);
    this.attachPreviewCard(id, null, world, world.machines.length, true, target as HTMLButtonElement);
  }

  protected activateMiniGame(event: Event): void {
    event.stopPropagation();
    const world = this.activeWorld();
    if (!world) return;
    this.dismissedPeek.set(null);
    this.peekMiniGame(event);
    this.activePeek.set(this.gameNodeId(world));
  }

  protected openMiniGame(world: WorldStory, event: Event): void {
    event.stopPropagation();
    if (!this.isGameUnlocked(world)) return;
    this.closeActivePeek();
    this.selectedMiniGameWorld.set(world);
  }

  protected closeMiniGame(): void { this.selectedMiniGameWorld.set(null); }

  protected finishMiniGame(worldId: WorldId): void {
    const updated = new Set(this.completedGameIds());
    updated.add(worldId);
    this.completedGameIds.set(updated);
    this.progress.setCompletedMiniGameIds(updated);
  }

  protected nextWorldName(): string | null {
    const index = this.worlds.findIndex((world) => world.id === this.selectedMiniGameWorld()?.id);
    return this.worlds[index + 1]?.name ?? null;
  }

  protected goNextWorld(): void {
    const world = this.selectedMiniGameWorld();
    const index = this.worlds.findIndex((entry) => entry.id === world?.id);
    if (index >= 0 && this.worlds[index + 1]) {
      this.selectedMiniGameWorld.set(null);
      this.backToWorldMap();
      this.openWorld(this.worlds[index + 1], index + 1);
    }
  }

  protected clearPeek(id: string, event?: Event): void {
    if (typeof PointerEvent !== 'undefined' && event instanceof PointerEvent && event.pointerType === 'touch') return;
    const related = event instanceof FocusEvent ? event.relatedTarget : (typeof PointerEvent !== 'undefined' && event instanceof PointerEvent) ? event.relatedTarget : null;
    if (typeof Element !== 'undefined' && related instanceof Element && related.closest('.roadmap-node, .stop-card')) return;
    if (this.activePeek() === id) this.schedulePreviewClose(id);
    if (this.dismissedPeek() === id) this.dismissedPeek.set(null);
  }

  protected activatePeek(id: string, machineIndex: number, event: Event): void {
    event.stopPropagation();
    this.dismissedPeek.set(null);
    this.peek(id, machineIndex, event);
    this.activePeek.set(id);
  }

  protected closeActivePeek(): void {
    const active = this.activePeek();
    if (active) this.dismissedPeek.set(active);
    this.activePeek.set(null);
    this.cancelPreviewClose();
    this.previewResizeObserver?.disconnect();
    this.previewOverlay?.detach();
    this.previewTarget = undefined;
  }

  protected keepPreviewOpen(): void { this.cancelPreviewClose(); }

  protected schedulePreviewClose(id: string, event?: Event): void {
    const related = event instanceof FocusEvent ? event.relatedTarget : (event instanceof PointerEvent ? event.relatedTarget : null);
    if (typeof Element !== 'undefined' && related instanceof Element && related.closest('.roadmap-node, .stop-card')) return;
    if (this.previewCloseTimer) window.clearTimeout(this.previewCloseTimer);
    this.previewCloseTimer = window.setTimeout(() => {
      this.previewCloseTimer = undefined;
      if (this.activePeek() !== id) return;
      const activeElement = document.activeElement;
      if (activeElement instanceof Element && activeElement.closest('.stop-card')) return;
      this.closeActivePeek();
    }, 180);
  }

  protected onPreviewCardKeydown(event: KeyboardEvent, id: string): void {
    if (event.key !== 'Tab' || !this.previewTarget || this.activePeek() !== id) return;
    event.preventDefault();
    if (event.shiftKey) {
      this.previewTarget.focus();
      return;
    }
    const nodes = [...document.querySelectorAll<HTMLButtonElement>('.roadmap-node:not(:disabled)')];
    const currentIndex = nodes.indexOf(this.previewTarget);
    (nodes[currentIndex + 1] ?? document.querySelector<HTMLButtonElement>('.back-button'))?.focus();
  }

  protected tabToPreviewAction(event: KeyboardEvent, id: string): void {
    if (event.key !== 'Tab' || event.shiftKey || this.activePeek() !== id) return;
    const action = this.previewOverlay?.overlayElement.querySelector<HTMLButtonElement>('.peek-button:not(:disabled)');
    if (!action) return;
    event.preventDefault();
    requestAnimationFrame(() => action.focus());
  }

  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  private onPreviewViewportChange(): void {
    this.compactTrail.set(window.innerWidth <= 600);
    this.requestPreviewPlacement();
  }

  protected unlockAllDemo(): void {
    const completed = new Set(this.worlds.flatMap((world) => world.machines.map((entry) => entry.id)));
    this.completedIds.set(completed);
    this.progress.setCompletedStoryIds(completed);
    const games = new Set(this.worlds.map((world) => world.id));
    this.completedGameIds.set(games);
    this.progress.setCompletedMiniGameIds(games);
  }

  protected resetProgress(): void {
    this.completedIds.set(new Set());
    this.completedGameIds.set(new Set());
    this.activeStopIndex.set(0);
    this.progress.reset();
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
      isMachineUnlocked(this.worlds, this.completedIds(), this.worlds.indexOf(world), machineIndex, this.completedGameIds()) && !this.completedIds().has(entry.id));
    return index < 0 ? world.machines.length : index;
  }

  private attachPreviewCard(id: string, machine: MachineStory | null, world: WorldStory, machineIndex: number, isMiniGame: boolean, target: HTMLElement): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const template = this.previewCardTemplate();
    if (!template) return;
    this.activePeek.set(id);
    this.previewTarget = target as HTMLButtonElement;
    this.activeStopIndex.set(machineIndex);

    if (!this.previewOverlay) {
      this.previewOverlay = this.overlay.create({
        positionStrategy: this.overlay.position().global().left('0px').top('0px'),
        scrollStrategy: this.overlay.scrollStrategies.noop(),
        panelClass: 'story-preview-overlay-pane',
      });
      const container = this.overlayContainer.getContainerElement();
      container.style.position = 'fixed';
      container.style.inset = '0';
      container.style.zIndex = '1000';
      container.style.pointerEvents = 'none';
      const pane = this.previewOverlay.overlayElement;
      pane.style.position = 'absolute';
      pane.style.display = 'block';
      pane.style.transform = 'none';
      pane.style.pointerEvents = 'auto';
      pane.style.overflow = 'visible';
      pane.style.maxWidth = 'calc(100vw - 32px)';
      pane.style.maxHeight = 'calc(100dvh - 32px)';
    }

    const pane = this.previewOverlay.overlayElement;
    const existingCard = pane.querySelector<HTMLElement>('.stop-card');
    if (existingCard?.id === `peek-${id}`) {
      this.requestPreviewPlacement();
      return;
    }

    this.previewOverlay.detach();
    this.previewOverlay.attach(new TemplatePortal(template, this.viewContainerRef, { machine, world, machineIndex, isMiniGame }));
    const card = pane.querySelector<HTMLElement>('.stop-card');
    if (!card) return;
    card.style.visibility = 'hidden';
    this.previewResizeObserver?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      this.previewResizeObserver = new ResizeObserver(() => this.requestPreviewPlacement());
      this.previewResizeObserver.observe(card);
      this.previewResizeObserver.observe(target);
    }
    this.positionPreviewCard();
    requestAnimationFrame(() => this.requestPreviewPlacement());
    void document.fonts?.ready.then(() => this.requestPreviewPlacement());
  }

  private requestPreviewPlacement(): void {
    if (!this.previewOverlay?.hasAttached() || !this.previewTarget || this.previewPositionFrame) return;
    this.previewPositionFrame = requestAnimationFrame(() => {
      this.previewPositionFrame = 0;
      this.positionPreviewCard();
    });
  }

  private positionPreviewCard(): void {
    const pane = this.previewOverlay?.overlayElement;
    const target = this.previewTarget;
    const card = pane?.querySelector<HTMLElement>('.stop-card');
    if (!pane || !target?.isConnected || !card) return;
    const nodeRect = rectForPlacement(target.getBoundingClientRect());
    const cardBounds = card.getBoundingClientRect();
    if (!cardBounds.width || !cardBounds.height) return;
    const avoidRects: PreviewRect[] = [];
    const sceneHeader = document.querySelector<HTMLElement>('.scene-header');
    const headerBounds = sceneHeader?.getBoundingClientRect();
    if (headerBounds && headerBounds.width && headerBounds.height) avoidRects.push(rectForPlacement(headerBounds));
    const chatButton = document.querySelector<HTMLElement>('app-chat-widget .apollo-button');
    const chatBounds = chatButton?.getBoundingClientRect();
    if (chatBounds && chatBounds.width && chatBounds.height) avoidRects.push(rectForPlacement(chatBounds));
    const placement = placePreviewCard(
      nodeRect,
      { width: cardBounds.width, height: cardBounds.height },
      { width: window.innerWidth, height: window.innerHeight },
      avoidRects,
    );
    pane.style.setProperty('position', 'fixed', 'important');
    pane.style.setProperty('display', 'block', 'important');
    pane.style.setProperty('z-index', '1001', 'important');
    pane.style.setProperty('pointer-events', 'auto', 'important');
    pane.style.left = `${placement.left}px`;
    pane.style.top = `${placement.top}px`;
    card.dataset['placement'] = placement.side;
    card.style.setProperty('--arrow-offset', `${placement.arrowOffset}px`);
    card.style.visibility = 'visible';
  }

  private cancelPreviewClose(): void {
    if (this.previewCloseTimer) window.clearTimeout(this.previewCloseTimer);
    this.previewCloseTimer = undefined;
  }

  private initializeBrowserState(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.progress.restore();
    this.completedIds.set(new Set(this.progress.completedStoryIds()));
    this.completedGameIds.set(new Set(this.progress.completedMiniGameIds()));
    this.compactTrail.set(window.innerWidth <= 600);
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
    const positions = pointsAlongPath(path, world.machines.length + 1);
    if (positions.length !== this.nodePositions().length || positions.some((point, index) =>
      point.x !== this.nodePositions()[index]?.x || point.y !== this.nodePositions()[index]?.y)) {
      this.nodePositions.set(positions);
    }
  }

}
