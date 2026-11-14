import { isPlatformBrowser } from '@angular/common';
import { afterNextRender, Component, DestroyRef, ElementRef, EventEmitter, HostListener, inject, Input, OnInit, Output, PLATFORM_ID, signal, ViewChild } from '@angular/core';
import type * as ThreeTypes from 'three';
import { WorldId, WorldStory } from '../machines.data';
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
  update(dt: number): void;
  resize?(drawingBufferWidth: number, drawingBufferHeight: number): void;
  setBrightness?(brightness: number): void;
  dispose?(): void;
}

export interface CarouselLayout {
  centerScale: number;
  sideScale: number;
  sideSpacing: number;
  sideDepth: number;
}

const PLANET_RADIUS = 1.3;

interface WorldSlotTween {
  fromPosition: ThreeTypes.Vector3;
  toPosition: ThreeTypes.Vector3;
  fromScale: number;
  toScale: number;
  fromBrightness: number;
  toBrightness: number;
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
  @Input() gamesCompleted: boolean[] = [];
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
  protected galaxyFallback = false;
  protected loadError = '';
  protected lockHint = false;
  protected markerVisible = false;
  protected markerTooltip = false;
  protected markerX = 0;
  protected markerY = 0;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loading = inject(LoadingService);
  private readonly finishLoadingTasks = new Set<() => void>();
  private THREE?: typeof import('three');
  private renderer?: ThreeTypes.WebGLRenderer;
  private scene?: ThreeTypes.Scene;
  private camera?: ThreeTypes.PerspectiveCamera;
  private ring?: ThreeTypes.Group;
  private handles: CarouselWorld[] = [];
  private carouselObjects: ThreeTypes.Object3D[] = [];
  private nasaModels?: Promise<Partial<Record<WorldId, ThreeTypes.Object3D>>>;
  private slots: ThreeTypes.Group[] = [];
  private appearanceMaterials: ThreeTypes.Material[][] = [];
  private readonly originalMaterials = new Map<ThreeTypes.Object3D, ThreeTypes.Material | ThreeTypes.Material[]>();
  private slotBrightness: number[] = [];
  private slotTweens: WorldSlotTween[] = [];
  private markerSurface?: ThreeTypes.Mesh;
  private markerDot?: ThreeTypes.Mesh;
  private markerGeometry?: ThreeTypes.SphereGeometry;
  private markerMaterial?: ThreeTypes.MeshStandardMaterial;
  private markerGlowGeometry?: ThreeTypes.SphereGeometry;
  private markerGlowMaterial?: ThreeTypes.MeshBasicMaterial;
  private auxiliaryGeometries: ThreeTypes.BufferGeometry[] = [];
  private auxiliaryMaterials: ThreeTypes.Material[] = [];
  private frame = 0;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private visible = true;
  private hidden = false;
  private animating = false;
  private reducedMotion = false;
  private transitionDuration = 800;
  private transitionFrom = 0;
  private qualityMobile = false;
  private slotLayout: CarouselLayout = { centerScale: 1.43, sideScale: 0.93, sideSpacing: 3.25, sideDepth: 0.6 };
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
  private nextIndex = 0;
  private jumpTarget?: number;
  private loadSequence = 0;
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
    if (index === this.activeIndex || this.isLoading() || this.loadError) return;
    this.jumpTarget = index;
    if (this.reducedMotion) {
      this.nextIndex = index;
      this.activeIndex = index;
      this.jumpTarget = undefined;
      this.applyImmediateSlots(index);
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
    void this.loadGeneratedWorlds();
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
    window.addEventListener('orientationchange', this.onOrientationChange);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
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
      this.qualityMobile = hostWidth < 760;
      this.resize();
    } catch {
      this.webglAvailable = false;
      this.isLoading.set(false);
      return;
    }

    await this.loadGeneratedWorlds();
  }

  private async loadGeneratedWorlds(): Promise<void> {
    if (!this.THREE || this.destroyed) return;
    const sequence = ++this.loadSequence;
    const finishLoading = this.loading.begin();
    this.finishLoadingTasks.add(finishLoading);
    this.isLoading.set(true);
    this.loadError = '';
    try {
      const nasaModels = await this.loadNasaModels();
      if (this.destroyed || sequence !== this.loadSequence) return;
      this.removeWorldsFromRing();
      const moon = this.normalizePlanet(nasaModels.moon!, 'Moon');
      const mars = this.normalizePlanet(nasaModels.mars!, 'Mars');
      const visuals: CarouselWorld[] = [
        { id: 'moon', object: moon.object, radius: moon.radius, update: (dt) => { moon.object.rotation.y += dt * 0.05; } },
        { id: 'mars', object: mars.object, radius: mars.radius, update: (dt) => { mars.object.rotation.y += dt * 0.062; } },
      ];
      try {
        const galaxyModule = await import('../../worlds/milky-way');
        const galaxy = galaxyModule.createMilkyWay(this.THREE, this.qualityMobile, PLANET_RADIUS);
        visuals.push({
          id: 'outer', object: galaxy.object, radius: galaxy.radius,
          update: (dt) => galaxy.update(dt, this.activeIndex === 2),
          resize: galaxy.resize, setBrightness: galaxy.setBrightness, dispose: galaxy.dispose,
        });
      } catch (error) {
        console.error('[WorldCarousel] Milky Way generation failed; using the static CSS galaxy fallback.', error);
        this.galaxyFallback = true;
        visuals.push({ id: 'outer', object: new this.THREE!.Group(), radius: PLANET_RADIUS, update: () => undefined });
      }
      this.handles = visuals;
      this.mountWorlds(visuals);
      this.isLoading.set(false);
      this.resize();
      this.schedule();
    } catch (error) {
      if (this.destroyed || sequence !== this.loadSequence) return;
      console.error('[WorldCarousel] World generation failed:', error);
      this.loadError = 'The worlds could not be prepared. Please try again.';
      this.isLoading.set(false);
    } finally {
      finishLoading();
      this.finishLoadingTasks.delete(finishLoading);
    }
  }

  /**
   * The NASA GLBs use roughly 1,000-unit diameter spheres while the carousel
   * positions are expressed in ~unit radii. Without normalization the camera
   * sits inside their front-face-culled meshes, making Moon and Mars disappear.
   */
  private normalizePlanet(model: ThreeTypes.Object3D, label: string): { object: ThreeTypes.Group; radius: number } {
    const THREE = this.THREE!;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    let sourceRadius = 0;
    model.traverse((object) => {
      const mesh = object as ThreeTypes.Mesh;
      const positions = mesh.isMesh ? mesh.geometry?.getAttribute('position') : undefined;
      if (!positions) return;
      const vertex = new THREE.Vector3();
      for (let index = 0; index < positions.count; index++) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
        sourceRadius = Math.max(sourceRadius, vertex.distanceTo(center));
      }
    });
    if (!Number.isFinite(sourceRadius) || sourceRadius <= 0) throw new Error(`${label} model has no measurable geometry.`);
    model.position.sub(center);
    const normalized = new THREE.Group();
    normalized.name = `${label} normalized to carousel units`;
    normalized.scale.setScalar(planetNormalizationScale(sourceRadius, PLANET_RADIUS));
    normalized.add(model);
    return { object: normalized, radius: PLANET_RADIUS };
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

  private mountWorlds(orderedWorlds: CarouselWorld[]): void {
    const THREE = this.THREE;
    const ring = this.ring;
    if (!THREE || !ring) return;

    this.carouselObjects = orderedWorlds.map((world) => world.object);
    this.appearanceMaterials = [];
    orderedWorlds.forEach((world, index) => {
      const slot = new THREE.Group();
      const target = worldSlotTarget(index, this.activeIndex, orderedWorlds.length, this.slotLayout);
      slot.position.copy(target.position);
      world.object.userData['carouselIndex'] = index;
      slot.add(world.object);
      this.appearanceMaterials[index] = world.setBrightness ? [] : this.cloneAppearanceMaterials(world.object);
      slot.scale.setScalar(target.scale);
      ring.add(slot);
      this.slots.push(slot);
      this.setWorldBrightness(index, target.brightness);
      this.slotBrightness[index] = target.brightness;
      this.slotTweens.push({
        fromPosition: new THREE.Vector3(target.position.x, target.position.y, target.position.z),
        toPosition: new THREE.Vector3(target.position.x, target.position.y, target.position.z),
        fromScale: target.scale, toScale: target.scale,
        fromBrightness: target.brightness, toBrightness: target.brightness,
      });
    });
    ring.rotation.y = 0;
    this.mountApolloMarker(orderedWorlds.find((world) => world.id === 'moon'));
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
    const modelScale = moon.object.scale.x;
    this.markerGeometry = new THREE.SphereGeometry(0.022 / modelScale, 16, 12);
    this.markerMaterial = new THREE.MeshStandardMaterial({ color: 0xffdb66, emissive: 0xffa824, emissiveIntensity: 2.4, roughness: 0.35 });
    this.markerGlowGeometry = new THREE.SphereGeometry(0.045 / modelScale, 16, 12);
    this.markerGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffc44f, transparent: true, opacity: 0.38, depthWrite: false });
    this.markerDot = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
    const phi = THREE.MathUtils.degToRad(90 - 0.67408);
    const theta = THREE.MathUtils.degToRad(23.47297 + 90);
    const markerRadius = (moon.radius + 0.035) / modelScale;
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
    this.handles.forEach((world) => world.dispose?.());
    for (const [object, material] of this.originalMaterials) (object as ThreeTypes.Mesh).material = material;
    this.originalMaterials.clear();
    this.appearanceMaterials.flat().forEach((material) => material.dispose());
    for (const slot of this.slots) {
      const world = slot.children.find((child) => child.userData['carouselIndex'] !== undefined);
      if (world) slot.remove(world);
      this.ring?.remove(slot);
    }
    this.slots = [];
    this.appearanceMaterials = [];
    this.slotBrightness = [];
    this.slotTweens = [];
    this.markerSurface = undefined;
    this.markerDot = undefined;
    this.markerGeometry?.dispose(); this.markerMaterial?.dispose();
    this.markerGlowGeometry?.dispose(); this.markerGlowMaterial?.dispose();
    this.markerGeometry = undefined; this.markerMaterial = undefined;
    this.markerGlowGeometry = undefined; this.markerGlowMaterial = undefined;
    this.carouselObjects = [];
    this.handles = [];
  }

  private move(direction: number, isDotJump = false): void {
    if (this.worlds.length < 2 || this.isLoading() || this.loadError) return;
    if (!isDotJump) this.jumpTarget = undefined;
    this.nextIndex = nextCarouselIndex(this.activeIndex, direction, this.worlds.length);
    this.lockHint = false;
    this.activeIndex = this.nextIndex;
    this.textFading = true;
    if (this.textTimer) window.clearTimeout(this.textTimer);
    this.textTimer = window.setTimeout(() => { this.textFading = false; }, 100);
    if (this.reducedMotion) {
      this.applyImmediateSlots(this.activeIndex);
      this.textFading = false;
      return;
    }
    this.startSlotTween(this.activeIndex);
  }

  private cloneAppearanceMaterials(object: ThreeTypes.Object3D): ThreeTypes.Material[] {
    const cloned: ThreeTypes.Material[] = [];
    object.traverse((child) => {
      const isRenderable = (child as ThreeTypes.Mesh).isMesh || (child as ThreeTypes.Points).isPoints;
      const mesh = child as ThreeTypes.Mesh;
      if (!isRenderable || !mesh.material) return;
      if (!this.originalMaterials.has(child)) this.originalMaterials.set(child, mesh.material);
      const clone = (material: ThreeTypes.Material): ThreeTypes.Material => {
        const copy = material.clone();
        const colorMaterial = copy as ThreeTypes.Material & { color?: ThreeTypes.Color };
        if (colorMaterial.color) copy.userData['carouselBaseColor'] = colorMaterial.color.clone();
        copy.userData['carouselBaseOpacity'] = copy.opacity;
        const uniforms = (copy as ThreeTypes.ShaderMaterial).uniforms;
        const opacityUniform = uniforms?.['opacity']?.value;
        if (typeof opacityUniform === 'number') copy.userData['carouselBaseUniformOpacity'] = opacityUniform;
        const uniformColor = uniforms?.['color']?.value as ThreeTypes.Color | undefined;
        if (uniformColor?.isColor) copy.userData['carouselBaseUniformColor'] = uniformColor.clone();
        cloned.push(copy);
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
    });
    return cloned;
  }

  private setWorldBrightness(index: number, brightness: number): void {
    this.slotBrightness[index] = brightness;
    this.handles[index]?.setBrightness?.(brightness);
    for (const material of this.appearanceMaterials[index] ?? []) {
      const colorMaterial = material as ThreeTypes.Material & { color?: ThreeTypes.Color };
      const baseColor = material.userData['carouselBaseColor'] as ThreeTypes.Color | undefined;
      if (colorMaterial.color && baseColor) colorMaterial.color.copy(baseColor).multiplyScalar(brightness);
      const baseOpacity = material.userData['carouselBaseOpacity'] as number | undefined;
      if (baseOpacity !== undefined && material.transparent) material.opacity = baseOpacity * brightness;
      const uniforms = (material as ThreeTypes.ShaderMaterial).uniforms;
      const baseUniformOpacity = material.userData['carouselBaseUniformOpacity'] as number | undefined;
      if (uniforms?.['opacity'] && baseUniformOpacity !== undefined) uniforms['opacity'].value = baseUniformOpacity * brightness;
      const baseUniformColor = material.userData['carouselBaseUniformColor'] as ThreeTypes.Color | undefined;
      if (uniforms?.['color']?.value?.isColor && baseUniformColor) uniforms['color'].value.copy(baseUniformColor).multiplyScalar(brightness);
    }
  }

  private startSlotTween(activeIndex: number): void {
    this.slotTweens = this.slots.map((slot, index) => {
      const target = worldSlotTarget(index, activeIndex, this.slots.length, this.slotLayout);
      return {
        fromPosition: slot.position.clone(),
        toPosition: new this.THREE!.Vector3(target.position.x, target.position.y, target.position.z),
        fromScale: slot.scale.x,
        toScale: target.scale,
        fromBrightness: this.slotBrightness[index] ?? (index === activeIndex ? 1 : 0.62),
        toBrightness: target.brightness,
      };
    });
    this.transitionFrom = performance.now();
    this.transitioning = true;
    this.animating = true;
    this.schedule();
  }

  private applyImmediateSlots(activeIndex: number): void {
    this.slots.forEach((slot, index) => {
      const target = worldSlotTarget(index, activeIndex, this.slots.length, this.slotLayout);
      slot.position.set(target.position.x, target.position.y, target.position.z);
      slot.scale.setScalar(target.scale);
      this.setWorldBrightness(index, target.brightness);
    });
    this.transitioning = false;
    this.animating = false;
  }

  private directionTo(target: number): number {
    const forward = (target - this.activeIndex + this.worlds.length) % this.worlds.length;
    const backward = (this.activeIndex - target + this.worlds.length) % this.worlds.length;
    return forward <= backward ? 1 : -1;
  }

  private resize(): void {
    if (!this.renderer || !this.camera || !this.canvas) return;
    const bounds = this.canvas.nativeElement.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(bounds.width, bounds.height, false);
    this.camera.aspect = bounds.width / bounds.height;
    this.camera.updateProjectionMatrix();
    this.slotLayout = carouselLayout(this.camera, bounds.width, bounds.height, PLANET_RADIUS);
    const drawingBuffer = this.renderer.getDrawingBufferSize(new this.THREE!.Vector2());
    this.handles.forEach((world) => world.resize?.(drawingBuffer.x, drawingBuffer.y));
    if (this.slots.length) {
      if (this.animating) this.startSlotTween(this.activeIndex);
      else this.applyImmediateSlots(this.activeIndex);
    }
    this.schedule();
  }

  private readonly onOrientationChange = (): void => this.resize();

  private schedule(): void {
    if (!this.frame && this.renderer && this.visible && !this.hidden) this.frame = requestAnimationFrame(this.render);
  }

  private readonly render = (time: number): void => {
    this.frame = 0;
    if (!this.renderer || !this.scene || !this.camera) return;
    const dt = Math.min((time - (this.lastTime || time)) / 1000, 0.05);
    this.lastTime = time;
    this.handles.forEach((world) => world.update(dt));
    if (this.animating) {
      const t = Math.min((time - this.transitionFrom) / this.transitionDuration, 1);
      const eased = t * t * (3 - 2 * t);
      this.slots.forEach((slot, index) => {
        const tween = this.slotTweens[index];
        if (!tween) return;
        const wrapsBehind = Math.abs(tween.fromPosition.x - tween.toPosition.x) > 4.5;
        const depthArc = wrapsBehind ? Math.sin(Math.PI * eased) : 0;
        slot.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
        slot.position.z -= depthArc * 1.35;
        const scale = tween.fromScale + (tween.toScale - tween.fromScale) * eased - depthArc * 0.2;
        slot.scale.setScalar(scale);
        const brightness = tween.fromBrightness + (tween.toBrightness - tween.fromBrightness) * eased - depthArc * 0.28;
        this.setWorldBrightness(index, Math.max(0.24, brightness));
      });
      if (t >= 1) {
        this.animating = false;
        this.transitioning = false;
        this.applyImmediateSlots(this.activeIndex);
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
      window.removeEventListener('orientationchange', this.onOrientationChange);
      if (this.frame) cancelAnimationFrame(this.frame);
      if (this.lockTimer) clearTimeout(this.lockTimer);
      if (this.textTimer) clearTimeout(this.textTimer);
      if (this.shakeTimer) clearTimeout(this.shakeTimer);
      if (this.sceneFadeTimer) clearTimeout(this.sceneFadeTimer);
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

export interface WorldSlotTarget {
  position: { x: number; y: number; z: number };
  scale: number;
  brightness: number;
}

/** Stable carousel slots; the scene interpolates between these positions instead of rotating a ring. */
export function carouselLayout(camera: Pick<ThreeTypes.PerspectiveCamera, 'fov' | 'position'>, width: number, height: number, worldRadius = PLANET_RADIUS): CarouselLayout {
  const aspect = Math.max(width / Math.max(height, 1), 0.1);
  const visibleHeight = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360);
  const centerScale = visibleHeight * 0.25 / worldRadius;
  return {
    centerScale,
    sideScale: centerScale * 0.62,
    sideSpacing: Math.min(3.25, visibleHeight * aspect * 0.31),
    sideDepth: visibleHeight * 0.08,
  };
}

export function planetNormalizationScale(sourceRadius: number, targetRadius = PLANET_RADIUS): number {
  return sourceRadius > 0 && Number.isFinite(sourceRadius) ? targetRadius / sourceRadius : 1;
}

export function worldSlotTarget(index: number, activeIndex: number, count: number, layout: CarouselLayout = { centerScale: 1.43, sideScale: 0.89, sideSpacing: 3.25, sideDepth: 0.6 }): WorldSlotTarget {
  if (count <= 0) return { position: { x: 0, y: 0, z: 0 }, scale: 1, brightness: 1 };
  let relative = ((index - activeIndex) % count + count) % count;
  if (relative > count / 2) relative -= count;
  const distance = Math.abs(relative);
  // On narrow screens the hero galaxy can visually crowd its neighbors; give
  // the side worlds a little more breathing room without changing the tween.
  const narrowGalaxyFocus = activeIndex === 2 && layout.sideSpacing < 3;
  const sideScale = layout.sideScale * (narrowGalaxyFocus ? 0.72 : 1);
  return {
    position: { x: relative * layout.sideSpacing, y: 0, z: distance ? -layout.sideDepth : 0 },
    scale: distance === 0 ? layout.centerScale : sideScale,
    brightness: distance === 0 ? 1 : 0.58,
  };
}
