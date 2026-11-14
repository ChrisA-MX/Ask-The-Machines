import { isPlatformBrowser } from '@angular/common';
import { afterNextRender, Component, DestroyRef, ElementRef, EventEmitter, HostListener, inject, Input, OnInit, Output, PLATFORM_ID, signal, ViewChild } from '@angular/core';
import type * as ThreeTypes from 'three';
import { WorldId, WorldStory } from '../machines.data';
import { ProceduralWorld, qualityForDevice, WorldQuality, WorldsService } from '../../worlds/worlds.service';
import { LoadingService } from '../../services/loading.service';

// NASA Solar System Exploration models: gltf_embed/2366 (Moon) and /2372 (Mars).
const NASA_WORLD_MODELS = {
  moon: '/assets/models/Moon_1_3474.glb',
  mars: '/assets/models/Mars_1_6792.glb',
} as const;

interface CarouselWorld {
  id: WorldId;
  object: ThreeTypes.Object3D;
  radius: number;
}

@Component({
  selector: 'app-world-carousel',
  standalone: true,
  templateUrl: './world-carousel.html',
  styleUrl: './world-carousel.scss',
})
export class WorldCarousel implements OnInit {
  @Input({ required: true }) worlds: WorldStory[] = [];
  @Input() unlocked: boolean[] = [];
  @Input() progress: number[] = [];
  @Input() initialIndex = 0;
  @Output() enterWorld = new EventEmitter<number>();
  @ViewChild('host') private host?: ElementRef<HTMLElement>;
  @ViewChild('canvas') private canvas?: ElementRef<HTMLCanvasElement>;

  protected activeIndex = 0;
  protected transitioning = false;
  protected textFading = false;
  protected centerHovered = false;
  protected lockShaking = false;
  protected sceneFading = false;
  protected webglAvailable = true;
  protected readonly isLoading = signal(true);
  protected loadError = '';
  protected lockHint = false;
  protected markerVisible = false;
  protected markerTooltip = false;
  protected markerX = 0;
  protected markerY = 0;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly worldsService = inject(WorldsService);
  private readonly loading = inject(LoadingService);
  private readonly finishLoadingTasks = new Set<() => void>();
  private THREE?: typeof import('three');
  private renderer?: ThreeTypes.WebGLRenderer;
  private scene?: ThreeTypes.Scene;
  private camera?: ThreeTypes.PerspectiveCamera;
  private ring?: ThreeTypes.Group;
  private handles: ProceduralWorld[] = [];
  private carouselObjects: ThreeTypes.Object3D[] = [];
  private rotatingWorlds: ThreeTypes.Object3D[] = [];
  private nasaModels?: Promise<Partial<Record<WorldId, ThreeTypes.Object3D>>>;
  private slots: ThreeTypes.Group[] = [];
  private dimmers: ThreeTypes.Mesh<ThreeTypes.SphereGeometry, ThreeTypes.MeshBasicMaterial>[] = [];
  private markerSurface?: ThreeTypes.Mesh;
  private markerDot?: ThreeTypes.Mesh;
  private markerGeometry?: ThreeTypes.SphereGeometry;
  private markerMaterial?: ThreeTypes.MeshStandardMaterial;
  private markerGlowGeometry?: ThreeTypes.SphereGeometry;
  private markerGlowMaterial?: ThreeTypes.MeshBasicMaterial;
  private auxiliaryGeometries: ThreeTypes.BufferGeometry[] = [];
  private auxiliaryMaterials: ThreeTypes.Material[] = [];
  private satelliteOrbits: ThreeTypes.Group[] = [];
  private frame = 0;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private visible = true;
  private hidden = false;
  private animating = false;
  private reducedMotion = false;
  private transitionStart = 0;
  private fromRotation = 0;
  private toRotation = 0;
  private readonly animationDuration = 700;
  private dragStart?: { x: number; y: number; pointerId: number };
  private pointerX = 0;
  private lastTime = 0;
  private raycaster?: ThreeTypes.Raycaster;
  private pointer?: ThreeTypes.Vector2;
  private markerWorldPosition?: ThreeTypes.Vector3;
  private markerProjectedPosition?: ThreeTypes.Vector3;
  private lockTimer?: number;
  private textTimer?: number;
  private shakeTimer?: number;
  private sceneFadeTimer?: number;
  private qualityCheckTimer?: number;
  private nextIndex = 0;
  private jumpTarget?: number;
  private loadSequence = 0;
  private quality: WorldQuality = 'low';
  private markerFocused = false;
  private destroyed = false;

  ngOnInit(): void {
    this.activeIndex = Math.max(0, Math.min(this.initialIndex, Math.max(this.worlds.length - 1, 0)));
  }

  constructor() {
    if (isPlatformBrowser(this.platformId)) afterNextRender(() => void this.initialize());
    this.destroyRef.onDestroy(() => this.dispose());
  }

  protected activeWorld(): WorldStory | undefined { return this.worlds[this.activeIndex]; }
  protected isUnlocked(index: number): boolean { return this.unlocked[index] ?? index === 0; }
  protected completed(index: number): number { return this.progress[index] ?? 0; }
  protected previous(): void { this.move(-1); }
  protected next(): void { this.move(1); }

  protected jump(index: number): void {
    if (index === this.activeIndex || this.transitioning || this.isLoading() || this.loadError) return;
    this.jumpTarget = index;
    if (this.reducedMotion) {
      this.nextIndex = index;
      this.toRotation = this.rotationFor(index);
      this.sceneFading = true;
      this.textFading = true;
      if (this.ring) this.ring.rotation.y = this.toRotation;
      this.activeIndex = index;
      this.jumpTarget = undefined;
      if (this.sceneFadeTimer) window.clearTimeout(this.sceneFadeTimer);
      this.sceneFadeTimer = window.setTimeout(() => { this.sceneFading = false; this.textFading = false; this.schedule(); }, 100);
      this.schedule();
      return;
    }
    this.move(this.directionTo(index), true);
  }

  protected activateCenter(): void {
    if (this.isLoading() || this.loadError) return;
    if (!this.isUnlocked(this.activeIndex)) { this.showLockHint(); return; }
    this.enterWorld.emit(this.activeIndex);
  }

  protected retryGeneration(): void {
    if (!this.THREE || this.destroyed) return;
    void this.loadGeneratedWorlds(this.quality, true);
  }

  protected showMarkerTooltip(): void { this.markerTooltip = true; }
  protected hideMarkerTooltip(): void { if (!this.markerFocused) this.markerTooltip = false; }
  protected focusMarker(): void { this.markerFocused = true; this.markerTooltip = true; }
  protected blurMarker(): void { this.markerFocused = false; this.markerTooltip = false; }

  @HostListener('document:keydown', ['$event'])
  private onKeys(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const target = event.target;
    if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    event.preventDefault();
    if (!this.isLoading() && !this.loadError) this.move(event.key === 'ArrowRight' ? 1 : -1);
  }

  @HostListener('document:click', ['$event'])
  private closeMarkerOnOutsideClick(event: MouseEvent): void {
    const target = event.target;
    if (typeof Element !== 'undefined' && target instanceof Element && !target.closest('.apollo-marker')) {
      this.markerTooltip = false;
    }
  }

  private async initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.canvas || !this.host) return;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.reducedMotion) {
      this.webglAvailable = false;
      this.isLoading.set(false);
      return;
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => { this.resize(); this.scheduleQualityCheck(); });
      this.resizeObserver.observe(this.canvas.nativeElement.parentElement ?? this.host.nativeElement);
      this.resizeObserver.observe(this.host.nativeElement);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver((entries) => { this.visible = !!entries[0]?.isIntersecting; this.schedule(); });
      this.intersectionObserver.observe(this.host.nativeElement);
    }

    try {
      const THREE = await import('three');
      if (this.destroyed) return;
      this.THREE = THREE;
      const renderer = new THREE.WebGLRenderer({ canvas: this.canvas.nativeElement, alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer = renderer;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      this.camera.position.set(0, 1.65, 10.8);
      this.camera.lookAt(0, 0, 0);
      this.scene.add(new THREE.AmbientLight(0x8db8e8, 0.55));
      const sun = new THREE.DirectionalLight(0xffffff, 3.2);
      sun.position.set(-5, 7, 8);
      this.scene.add(sun);
      this.ring = new THREE.Group();
      this.scene.add(this.ring);
      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.markerWorldPosition = new THREE.Vector3();
      this.markerProjectedPosition = new THREE.Vector3();
      const hostWidth = this.host.nativeElement.getBoundingClientRect().width;
      this.quality = qualityForDevice(hostWidth, navigator.hardwareConcurrency || 4);
      this.resize();
    } catch {
      this.webglAvailable = false;
      this.isLoading.set(false);
      return;
    }

    await this.loadGeneratedWorlds(this.quality);
  }

  private async loadGeneratedWorlds(quality: WorldQuality, retry = false): Promise<void> {
    if (!this.THREE || this.destroyed) return;
    const sequence = ++this.loadSequence;
    const finishLoading = this.loading.begin();
    this.finishLoadingTasks.add(finishLoading);
    this.isLoading.set(true);
    this.loadError = '';
    try {
      const [worlds, nasaModels] = await Promise.all([
        retry
          ? this.worldsService.retryWorlds(this.THREE, quality)
          : this.worldsService.getWorlds(this.THREE, quality),
        this.loadNasaModels(),
      ]);
      if (this.destroyed || sequence !== this.loadSequence) return;
      this.removeWorldsFromRing();
      this.handles = worlds;
      this.mountWorlds(worlds, nasaModels);
      this.isLoading.set(false);
      this.resize();
      this.schedule();
    } catch {
      if (this.destroyed || sequence !== this.loadSequence) return;
      this.loadError = 'The worlds could not be prepared. Please try again.';
      this.isLoading.set(false);
    } finally {
      finishLoading();
      this.finishLoadingTasks.delete(finishLoading);
    }
  }

  private loadNasaModels(): Promise<Partial<Record<WorldId, ThreeTypes.Object3D>>> {
    if (!this.nasaModels) {
      this.nasaModels = (async () => {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        const [moon, mars] = await Promise.all([
          loader.loadAsync(NASA_WORLD_MODELS.moon),
          loader.loadAsync(NASA_WORLD_MODELS.mars),
        ]);
        return { moon: moon.scene, mars: mars.scene };
      })().catch((error: unknown) => {
        this.nasaModels = undefined;
        throw error;
      });
    }
    return this.nasaModels;
  }

  private mountWorlds(
    worlds: ProceduralWorld[],
    nasaModels: Partial<Record<WorldId, ThreeTypes.Object3D>>,
  ): void {
    const THREE = this.THREE;
    const ring = this.ring;
    if (!THREE || !ring) return;

    const visuals = new Map<WorldId, CarouselWorld>();
    for (const id of ['moon', 'mars'] as const) {
      const model = nasaModels[id];
      if (!model) throw new Error(`NASA's ${id} model was not loaded.`);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new Error(`NASA's ${id} model has invalid dimensions.`);
      }
      const scale = 1.82 / radius;
      const normalizedModel = new THREE.Group();
      normalizedModel.add(model);
      normalizedModel.scale.setScalar(scale);
      normalizedModel.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      visuals.set(id, { id, object: normalizedModel, radius: 1.82 });
    }
    for (const world of worlds) {
      visuals.set(world.id, { id: world.id, object: world.object, radius: world.radius });
    }

    const orderedWorlds = this.worlds.map((story) => {
      const visual = visuals.get(story.id);
      if (!visual) throw new Error(`The ${story.id} world model is unavailable.`);
      return visual;
    });

    this.carouselObjects = orderedWorlds.map((world) => world.object);
    this.rotatingWorlds = orderedWorlds
      .filter((world) => world.id !== 'outer')
      .map((world) => world.object);
    orderedWorlds.forEach((world, index) => {
      const slot = new THREE.Group();
      const angle = index * Math.PI * 2 / orderedWorlds.length;
      slot.position.set(Math.sin(angle) * 3.85, index === 0 ? 0 : 0.28, Math.cos(angle) * 3.85);
      world.object.userData['carouselIndex'] = index;
      if (world.id === 'outer') {
        // The supplied module places its procedural star shell at radius 40–50;
        // scale that child cloud and the full composition into the carousel slot.
        const outerContents = world.object.children[0];
        if (outerContents) {
          outerContents.scale.setScalar(0.5);
          const stars = outerContents.children.find((child) => (child as ThreeTypes.Points).isPoints);
          stars?.scale.setScalar(0.05);
        }
      }
      slot.add(world.object);

      // A separate transparent shell dims rear worlds without mutating module materials.
      const shellRadius = world.radius * (world.id === 'outer' ? 1.72 : 1.025);
      const shellGeometry = new THREE.SphereGeometry(shellRadius, 48, 48);
      const shellMaterial = new THREE.MeshBasicMaterial({ color: 0x020611, transparent: true, opacity: index === this.activeIndex ? 0 : 0.44, depthWrite: false });
      const dimmer = new THREE.Mesh(shellGeometry, shellMaterial);
      dimmer.renderOrder = 4;
      slot.add(dimmer);
      if (world.id === 'outer') this.addOuterSatellites(THREE, slot);
      slot.scale.setScalar(index === this.activeIndex ? 1.55 : 0.93);
      ring.add(slot);
      this.slots.push(slot);
      this.dimmers.push(dimmer);
    });
    ring.rotation.y = this.rotationFor(this.activeIndex);
    this.mountApolloMarker(visuals.get('moon'));
    this.updateSlotAppearance();
  }

  private mountApolloMarker(moon?: CarouselWorld): void {
    const THREE = this.THREE;
    if (!THREE || !moon) return;
    let surface: ThreeTypes.Mesh | undefined;
    moon.object.traverse((object) => {
      const candidate = object as ThreeTypes.Mesh;
      if (!surface && candidate.isMesh) surface = candidate;
    });
    if (!surface) return;

    this.markerSurface = surface;
    this.markerGeometry = new THREE.SphereGeometry(0.022, 16, 12);
    this.markerMaterial = new THREE.MeshStandardMaterial({ color: 0xffdb66, emissive: 0xffa824, emissiveIntensity: 2.4, roughness: 0.35 });
    this.markerGlowGeometry = new THREE.SphereGeometry(0.045, 16, 12);
    this.markerGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffc44f, transparent: true, opacity: 0.38, depthWrite: false });
    this.markerDot = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
    const phi = THREE.MathUtils.degToRad(90 - 0.67408);
    const theta = THREE.MathUtils.degToRad(23.47297 + 90);
    const markerRadius = moon.radius + 0.035;
    this.markerDot.position.set(
      -markerRadius * Math.sin(phi) * Math.cos(theta),
      markerRadius * Math.cos(phi),
      markerRadius * Math.sin(phi) * Math.sin(theta),
    );
    const glow = new THREE.Mesh(this.markerGlowGeometry, this.markerGlowMaterial);
    this.markerDot.add(glow);
    moon.object.add(this.markerDot);
  }

  private updateMarkerProjection(): void {
    const THREE = this.THREE;
    if (!THREE || !this.markerDot || !this.markerSurface || !this.markerWorldPosition || !this.markerProjectedPosition || !this.camera || !this.canvas || !this.raycaster || !this.pointer) return;
    if (this.activeIndex !== 0) { this.markerVisible = false; return; }
    this.markerDot.updateWorldMatrix(true, false);
    this.markerDot.getWorldPosition(this.markerWorldPosition);
    this.markerProjectedPosition.copy(this.markerWorldPosition).project(this.camera);
    const { x, y, z } = this.markerProjectedPosition;
    const inView = z >= -1 && z <= 1 && Math.abs(x) <= 1 && Math.abs(y) <= 1;
    if (!inView) { this.markerVisible = false; return; }

    this.pointer.set(x, y);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const nearestSurface = this.raycaster.intersectObject(this.markerSurface, false)[0];
    const markerDistance = this.markerWorldPosition.distanceTo(this.camera.position);
    const visibleOnNearSide = !nearestSurface || markerDistance - nearestSurface.distance < 0.08;
    this.markerVisible = visibleOnNearSide;
    if (visibleOnNearSide) {
      const bounds = this.canvas.nativeElement.getBoundingClientRect();
      this.markerX = (x + 1) * 0.5 * bounds.width;
      this.markerY = (1 - y) * 0.5 * bounds.height;
    } else {
      this.markerTooltip = false;
    }
  }

  private removeWorldsFromRing(): void {
    if (this.markerDot) this.markerDot.removeFromParent();
    for (const slot of this.slots) {
      const world = slot.children.find((child) => child.userData['carouselIndex'] !== undefined);
      if (world) slot.remove(world);
      this.ring?.remove(slot);
    }
    for (const dimmer of this.dimmers) {
      dimmer.geometry.dispose();
      dimmer.material.dispose();
    }
    this.slots = [];
    this.dimmers = [];
    this.markerSurface = undefined;
    this.markerDot = undefined;
    this.markerGeometry?.dispose(); this.markerMaterial?.dispose();
    this.markerGlowGeometry?.dispose(); this.markerGlowMaterial?.dispose();
    this.markerGeometry = undefined; this.markerMaterial = undefined;
    this.markerGlowGeometry = undefined; this.markerGlowMaterial = undefined;
    for (const geometry of this.auxiliaryGeometries) geometry.dispose();
    for (const material of this.auxiliaryMaterials) material.dispose();
    this.auxiliaryGeometries = [];
    this.auxiliaryMaterials = [];
    this.satelliteOrbits = [];
    this.carouselObjects = [];
    this.rotatingWorlds = [];
  }

  private addOuterSatellites(THREE: typeof import('three'), slot: ThreeTypes.Group): void {
    for (let index = 0; index < 4; index++) {
      const orbit = new THREE.Group();
      orbit.rotation.z = 0.28 + index * 0.13;
      orbit.rotation.x = index * 0.32;
      const satellite = new THREE.Group();
      satellite.position.set(0.76 + (index % 2) * 0.16, 0, 0);
      const bodyGeometry = new THREE.BoxGeometry(0.075, 0.065, 0.11);
      const panelGeometry = new THREE.PlaneGeometry(0.15, 0.085);
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xdfe8f4, emissive: 0x34445e, metalness: 0.48, roughness: 0.52 });
      const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x4f8edc, side: THREE.DoubleSide });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      const left = new THREE.Mesh(panelGeometry, panelMaterial);
      const right = new THREE.Mesh(panelGeometry, panelMaterial);
      left.position.x = -0.12;
      right.position.x = 0.12;
      satellite.add(body, left, right);
      orbit.add(satellite);
      slot.add(orbit);
      this.satelliteOrbits.push(orbit);
      this.auxiliaryGeometries.push(bodyGeometry, panelGeometry);
      this.auxiliaryMaterials.push(bodyMaterial, panelMaterial);
    }
  }

  private move(direction: number, isDotJump = false): void {
    if (this.transitioning || this.worlds.length < 2 || this.isLoading() || this.loadError) return;
    if (!isDotJump) this.jumpTarget = undefined;
    this.nextIndex = nextCarouselIndex(this.activeIndex, direction, this.worlds.length);
    this.lockHint = false;
    this.fromRotation = this.ring?.rotation.y ?? 0;
    this.toRotation = this.rotationFor(this.nextIndex);
    this.toRotation += Math.round((this.fromRotation - this.toRotation) / (Math.PI * 2)) * Math.PI * 2;
    this.transitionStart = performance.now();
    this.transitioning = true;
    this.animating = true;
    this.textFading = true;
    if (this.textTimer) window.clearTimeout(this.textTimer);
    this.textTimer = window.setTimeout(() => { this.activeIndex = this.nextIndex; this.textFading = false; }, 180);
    this.schedule();
  }

  private updateSlotAppearance(): void {
    this.slots.forEach((slot, index) => {
      slot.scale.setScalar(index === this.activeIndex ? 1.55 : 0.93);
      const dimmer = this.dimmers[index];
      if (dimmer) dimmer.material.opacity = index === this.activeIndex ? 0 : 0.44;
    });
  }

  private rotationFor(index: number): number { return -index * Math.PI * 2 / Math.max(this.worlds.length, 1); }

  private directionTo(target: number): number {
    const forward = (target - this.activeIndex + this.worlds.length) % this.worlds.length;
    const backward = (this.activeIndex - target + this.worlds.length) % this.worlds.length;
    return forward <= backward ? 1 : -1;
  }

  private resize(): void {
    if (!this.renderer || !this.camera || !this.canvas) return;
    const bounds = this.canvas.nativeElement.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    this.renderer.setSize(bounds.width, bounds.height, false);
    this.camera.aspect = bounds.width / bounds.height;
    this.camera.updateProjectionMatrix();
    this.schedule();
  }

  private scheduleQualityCheck(): void {
    if (!isPlatformBrowser(this.platformId) || !this.host || !this.THREE || this.reducedMotion) return;
    if (this.qualityCheckTimer) window.clearTimeout(this.qualityCheckTimer);
    this.qualityCheckTimer = window.setTimeout(() => {
      if (!this.host) return;
      const nextQuality = qualityForDevice(this.host.nativeElement.getBoundingClientRect().width, navigator.hardwareConcurrency || 4);
      if (nextQuality !== this.quality) {
        this.quality = nextQuality;
        void this.loadGeneratedWorlds(nextQuality);
      }
    }, 300);
  }

  private schedule(): void {
    if (!this.frame && this.renderer && this.visible && !this.hidden) this.frame = requestAnimationFrame(this.render);
  }

  private readonly render = (time: number): void => {
    this.frame = 0;
    if (!this.renderer || !this.scene || !this.camera) return;
    const dt = Math.min((time - (this.lastTime || time)) / 1000, 0.05);
    this.lastTime = time;
    this.handles.forEach((world) => world.update(dt));
    this.rotatingWorlds.forEach((world) => { world.rotation.y += dt * 0.05; });
    this.satelliteOrbits.forEach((orbit, index) => { orbit.rotation.y += dt * (0.18 + index * 0.025); });
    if (this.animating && this.ring) {
      const t = Math.min((time - this.transitionStart) / this.animationDuration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.ring.rotation.y = this.fromRotation + (this.toRotation - this.fromRotation) * eased;
      if (t >= 1) {
        this.animating = false;
        this.transitioning = false;
        this.ring.rotation.y = this.toRotation;
        this.updateSlotAppearance();
        if (this.jumpTarget !== undefined) {
          if (this.activeIndex === this.jumpTarget) this.jumpTarget = undefined;
          else this.move(this.directionTo(this.jumpTarget), true);
        }
      }
    }
    this.camera.position.x += (this.pointerX * 0.11 - this.camera.position.x) * 0.035;
    this.camera.lookAt(0, 0, 0);
    this.updateMarkerProjection();
    this.renderer.render(this.scene, this.camera);
    if (this.handles.length || this.animating) this.schedule();
  };

  protected pointerDown(event: PointerEvent): void {
    this.dragStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    try { (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
  }

  protected pointerMove(event: PointerEvent): void {
    this.pointerX = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
    if (!this.raycaster || !this.pointer || !this.camera || !this.canvas || !this.carouselObjects.length) return;
    const bounds = this.canvas.nativeElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.carouselObjects, true)[0];
    let root: ThreeTypes.Object3D | undefined = hit?.object;
    while (root && root.userData['carouselIndex'] === undefined) root = root.parent ?? undefined;
    this.centerHovered = root?.userData['carouselIndex'] === this.activeIndex;
    this.canvas.nativeElement.style.cursor = this.centerHovered ? 'pointer' : 'grab';
  }

  protected pointerUp(event: PointerEvent): void {
    if (!this.dragStart || this.dragStart.pointerId !== event.pointerId) return;
    const dx = event.clientX - this.dragStart.x;
    const dy = event.clientY - this.dragStart.y;
    this.dragStart = undefined;
    if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy)) { this.move(dx < 0 ? 1 : -1); return; }
    if (!this.raycaster || !this.pointer || !this.camera || !this.canvas || !this.carouselObjects.length) return;
    const bounds = this.canvas.nativeElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.carouselObjects, true)[0];
    let root: ThreeTypes.Object3D | undefined = hit?.object;
    while (root && root.userData['carouselIndex'] === undefined) root = root.parent ?? undefined;
    if (root?.userData['carouselIndex'] === this.activeIndex) this.activateCenter();
  }

  protected cancelPointer(): void { this.dragStart = undefined; }

  private showLockHint(): void {
    this.lockHint = true;
    this.lockShaking = true;
    if (this.lockTimer) window.clearTimeout(this.lockTimer);
    if (this.shakeTimer) window.clearTimeout(this.shakeTimer);
    this.lockTimer = window.setTimeout(() => this.lockHint = false, 2600);
    this.shakeTimer = window.setTimeout(() => this.lockShaking = false, 360);
  }

  private readonly onVisibility = (): void => {
    this.hidden = document.hidden;
    if (this.hidden && this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    else this.schedule();
  };

  private dispose(): void {
    this.destroyed = true;
    this.loadSequence++;
    this.finishLoadingTasks.forEach((finish) => finish());
    this.finishLoadingTasks.clear();
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('visibilitychange', this.onVisibility);
      if (this.frame) cancelAnimationFrame(this.frame);
      if (this.lockTimer) clearTimeout(this.lockTimer);
      if (this.textTimer) clearTimeout(this.textTimer);
      if (this.shakeTimer) clearTimeout(this.shakeTimer);
      if (this.sceneFadeTimer) clearTimeout(this.sceneFadeTimer);
      if (this.qualityCheckTimer) clearTimeout(this.qualityCheckTimer);
    }
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.removeWorldsFromRing();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.scene = undefined;
    this.ring = undefined;
    this.handles = [];
  }
}

export function nextCarouselIndex(index: number, direction: number, count: number): number {
  return count > 0 ? (index + direction + count) % count : 0;
}
