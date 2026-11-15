import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { afterNextRender, Component, DestroyRef, ElementRef, inject, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type * as ThreeTypes from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { buildLabStoryUrl, buildLabWorldUrl, fitCameraDistance, LAB_MODELS, LabModel, ModelDimensions } from '../data/lab-models';

interface NetworkInformationLike extends EventTarget { saveData?: boolean; effectiveType?: string; downlink?: number; }
interface ModelResource { root: ThreeTypes.Group; clips: ThreeTypes.AnimationClip[]; size: ModelDimensions; radius: number; }

export interface TabNavigationResult { index: number; preventDefault: boolean; }

export function nextLabTabIndex(key: string, current: number, count: number): TabNavigationResult {
  if (count <= 0) return { index: current, preventDefault: false };
  if (key === 'ArrowRight') return { index: (current + 1) % count, preventDefault: true };
  if (key === 'ArrowLeft') return { index: (current - 1 + count) % count, preventDefault: true };
  if (key === 'Home') return { index: 0, preventDefault: true };
  if (key === 'End') return { index: count - 1, preventDefault: true };
  return { index: current, preventDefault: false };
}

@Component({
  selector: 'app-machine-viewer',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './machine-viewer.html',
  styleUrl: './machine-viewer.scss',
})
export class MachineViewer {
  protected readonly models = LAB_MODELS;
  protected readonly selectedIndex = signal(0);
  protected readonly selected = signal<LabModel>(LAB_MODELS[0]);
  protected readonly loading = signal(false);
  protected readonly progress = signal(0);
  protected readonly loadMessage = signal('Choose a machine to begin.');
  protected readonly errorMessage = signal('');
  protected readonly failedModelIds = signal<ReadonlySet<string>>(new Set());
  protected readonly hintVisible = signal(true);
  protected readonly playing = signal(false);
  protected readonly playAvailable = signal(false);
  protected readonly autoRotateEnabled = signal(true);
  protected readonly fullscreenAvailable = signal(false);
  protected readonly fullscreenActive = signal(false);
  protected readonly webglAvailable = signal(true);
  protected readonly contextLost = signal(false);
  protected readonly swapping = signal(false);
  protected readonly reducedMotion = signal(false);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly stageRef = viewChild<ElementRef<HTMLDivElement>>('stage');
  private readonly tabsRef = viewChild<ElementRef<HTMLDivElement>>('tabs');
  private THREE?: typeof import('three');
  private renderer?: ThreeTypes.WebGLRenderer;
  private scene?: ThreeTypes.Scene;
  private camera?: ThreeTypes.PerspectiveCamera;
  private controls?: InstanceType<typeof import('three/addons/controls/OrbitControls.js').OrbitControls>;
  private activeResource?: ModelResource;
  private mixer?: ThreeTypes.AnimationMixer;
  private action?: ThreeTypes.AnimationAction;
  private clock?: ThreeTypes.Clock;
  private pmrem?: ThreeTypes.PMREMGenerator;
  private environmentTarget?: ThreeTypes.WebGLRenderTarget;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private frame = 0;
  private dampingFrames = 0;
  private idleTimer?: number;
  private disposed = false;
  private visible = true;
  private readonly resourceCache = new Map<string, Promise<ModelResource>>();
  private readonly loadingCache = new Map<string, Promise<ModelResource>>();
  private readonly failures = new Set<string>();
  private readonly baseAssetUrl = this.getBaseAssetUrl();

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => void this.initialize());
      this.destroyRef.onDestroy(() => this.dispose());
    }
  }

  protected storyUrl(model = this.selected()): string | null { return buildLabStoryUrl(model); }
  protected worldUrl(model = this.selected()): string | null { return buildLabWorldUrl(model); }
  protected worldLabel(model = this.selected()): string { return model.worldId === 'outer' ? 'Outer Solar System' : model.worldId === 'moon' ? 'Moon' : 'Mars'; }
  protected credits(): LabModel[] { return LAB_MODELS.filter((model) => !!model.credit?.title && !!model.credit.author && !!model.credit.sourceUrl && !!model.credit.license); }
  protected failed(model: LabModel): boolean { return this.failedModelIds().has(model.id); }

  protected choose(index: number, focusTab = true): void {
    if (index < 0 || index >= LAB_MODELS.length) return;
    this.selectedIndex.set(index);
    const model = LAB_MODELS[index];
    this.selected.set(model);
    if (focusTab) this.tabsRef()?.nativeElement.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
    if (this.activeResource?.root.userData['modelId'] === model.id) return;
    void this.activateModel(model);
  }

  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const result = nextLabTabIndex(event.key, index, LAB_MODELS.length);
    if (!result.preventDefault) return;
    event.preventDefault();
    this.choose(result.index);
  }

  protected preloadOnIntent(model: LabModel): void {
    if (!isPlatformBrowser(this.platformId) || model.id === this.selected().id || this.resourceCache.has(model.id) || this.loadingCache.has(model.id)) return;
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    if (connection?.saveData !== false) return;
    if (connection.effectiveType !== '4g' && (connection.downlink ?? 0) < 5) return;
    void this.loadResource(model).catch(() => this.markFailed(model));
  }

  protected retry(): void {
    const model = this.selected();
    this.resourceCache.delete(model.id);
    this.loadingCache.delete(model.id);
    this.failures.delete(model.id);
    this.failedModelIds.set(new Set(this.failures));
    void this.activateModel(model, true);
  }

  protected rotateLeft(): void { this.rotate(-18, 0); }
  protected rotateRight(): void { this.rotate(18, 0); }
  protected rotateUp(): void { this.rotate(0, -12); }
  protected rotateDown(): void { this.rotate(0, 12); }
  protected zoomIn(): void { this.zoom(0.82); }
  protected zoomOut(): void { this.zoom(1.22); }

  protected resetView(): void {
    if (!this.activeResource || !this.camera || !this.controls || !this.THREE) return;
    this.frameCamera(this.activeResource, true);
    this.controls.update();
    this.noteInteraction();
    this.scheduleFrame(24);
  }

  protected toggleAutoRotate(): void {
    this.autoRotateEnabled.update((enabled) => !enabled);
    if (!this.controls) return;
    this.controls.autoRotate = this.autoRotateEnabled() && !this.reducedMotion();
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    if (this.controls.autoRotate) this.scheduleFrame();
    else this.renderOnce();
  }

  protected togglePlayback(): void {
    if (!this.action || !this.mixer) return;
    if (this.playing()) {
      this.action.paused = true;
      this.playing.set(false);
      this.renderOnce();
      return;
    }
    this.action.paused = false;
    this.action.play();
    this.playing.set(true);
    this.scheduleFrame();
  }

  protected onCanvasKeydown(event: KeyboardEvent): void {
    const key = event.key;
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
      key === 'ArrowLeft' ? this.rotateLeft() : key === 'ArrowRight' ? this.rotateRight() : key === 'ArrowUp' ? this.rotateUp() : this.rotateDown();
    } else if (key === '+' || key === '=') { event.preventDefault(); this.zoomIn(); }
    else if (key === '-') { event.preventDefault(); this.zoomOut(); }
    else if (key === '0') { event.preventDefault(); this.resetView(); }
  }

  protected async toggleFullscreen(): Promise<void> {
    const stage = this.stageRef()?.nativeElement;
    if (!stage || !document.fullscreenEnabled) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stage.requestFullscreen();
  }

  protected retryContext(): void { window.location.reload(); }

  private async initialize(): Promise<void> {
    const canvas = this.canvasRef()?.nativeElement;
    const stage = this.stageRef()?.nativeElement;
    if (!canvas || !stage || !isPlatformBrowser(this.platformId)) return;
    this.reducedMotion.set(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.fullscreenAvailable.set(!!document.fullscreenEnabled && typeof stage.requestFullscreen === 'function');
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    try {
      const THREE = await import('three');
      if (!canvas.isConnected || this.disposed) return;
      this.THREE = THREE;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.setClearColor(0x000000, 0);
      this.renderer = renderer;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xd4eaff, 0x171c2b, 1.55));
      const key = new THREE.DirectionalLight(0xfff4df, 3.1);
      key.position.set(-4, 6, 6);
      scene.add(key);
      this.scene = scene;
      const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 5000);
      this.camera = camera;
      this.clock = new THREE.Clock();
      const [{ OrbitControls }, { RoomEnvironment }] = await Promise.all([
        import('three/addons/controls/OrbitControls.js'),
        import('three/addons/environments/RoomEnvironment.js'),
      ]);
      if (this.disposed || !canvas.isConnected) return;
      this.pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      this.environmentTarget = this.pmrem.fromScene(room, 0.04);
      scene.environment = this.environmentTarget.texture;
      room.dispose();
      this.controls = new OrbitControls(camera, canvas);
      this.controls.enableDamping = !this.reducedMotion();
      this.controls.dampingFactor = this.reducedMotion() ? 0 : 0.06;
      this.controls.enablePan = true;
      this.controls.autoRotate = !this.reducedMotion();
      this.controls.autoRotateSpeed = 0.65;
      this.controls.minPolarAngle = 0.12;
      this.controls.maxPolarAngle = Math.PI - 0.12;
      this.controls.addEventListener('start', this.onUserInteraction);
      this.controls.addEventListener('end', this.onUserInteractionEnd);
      this.controls.addEventListener('change', this.onControlsChange);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(stage);
      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.visible = entries.some((entry) => entry.isIntersecting);
        if (this.visible) this.scheduleFrame();
        else if (this.frame) { window.cancelAnimationFrame(this.frame); this.frame = 0; }
      }, { threshold: 0.05 });
      this.intersectionObserver.observe(stage);
      this.resize();
      this.renderOnce();
      void this.activateModel(this.selected());
    } catch (error) {
      this.webglAvailable.set(false);
      this.loading.set(false);
      this.errorMessage.set(error instanceof Error ? error.message : '3D viewing is not available in this browser.');
    }
  }

  private async activateModel(model: LabModel, retry = false): Promise<void> {
    if (!this.scene || !this.THREE) return;
    this.loading.set(true);
    this.progress.set(0);
    this.errorMessage.set('');
    this.loadMessage.set(`Loading ${model.label}…`);
    if (retry) this.resourceCache.delete(model.id);
    try {
      const resource = await this.loadResource(model, (loaded, total) => {
        if (this.selected().id === model.id) this.progress.set(total > 0 ? Math.min(99, loaded / total * 100) : 0);
      });
      if (this.disposed || this.selected().id !== model.id || !this.scene || !this.camera) return;
      if (this.activeResource) this.scene.remove(this.activeResource.root);
      this.stopAnimation();
      this.activeResource = resource;
      resource.root.userData['modelId'] = model.id;
      this.scene.add(resource.root);
      this.frameCamera(resource, true);
      this.setupAnimation(resource);
      this.progress.set(100);
      this.loading.set(false);
      this.loadMessage.set(`${model.label} loaded`);
      this.failures.delete(model.id);
      this.failedModelIds.set(new Set(this.failures));
      this.swapping.set(!this.reducedMotion());
      if (!this.reducedMotion()) window.setTimeout(() => this.swapping.set(false), 380);
      this.hintVisible.set(true);
      this.scheduleFrame();
    } catch (error) {
      if (this.selected().id !== model.id) return;
      this.markFailed(model);
      this.loading.set(false);
      this.errorMessage.set(isNotFoundError(error) ? 'Model not found. Check that this GLB file is in the served assets folder.' : error instanceof Error ? error.message : 'This model could not be loaded.');
      this.loadMessage.set(`${model.label} could not be loaded`);
      this.renderOnce();
    }
  }

  private loadResource(model: LabModel, onProgress?: (loaded: number, total: number) => void): Promise<ModelResource> {
    const cached = this.resourceCache.get(model.id);
    if (cached) { onProgress?.(1, 1); return cached; }
    const pending = this.loadingCache.get(model.id);
    if (pending) return pending;
    const load = (async () => {
      const THREE = this.THREE;
      if (!THREE) throw new Error('The 3D viewer has not initialized yet.');
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const dracoNeeded = model.id === 'apollo-lunar-module' || model.id === 'voyager-probe';
      let dracoLoader: InstanceType<typeof import('three/addons/loaders/DRACOLoader.js').DRACOLoader> | undefined;
      if (dracoNeeded) {
        const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
        dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(new URL('draco/gltf/', this.baseAssetUrl).toString());
        loader.setDRACOLoader(dracoLoader);
      }
      let loadedBytes = 0;
      let gltf: GLTF;
      try {
        gltf = await new Promise<GLTF>((resolve, reject) => loader.load(
          new URL(model.file, this.baseAssetUrl).toString(),
          resolve,
          (event) => { loadedBytes = event.loaded; onProgress?.(event.loaded, event.total || 0); },
          (error) => {
            const target = typeof error === 'object' && error !== null && 'target' in error ? (error as { target?: XMLHttpRequest }).target : undefined;
            const status = target?.status ?? (typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status?: unknown }).status) : 0);
            reject(status === 404 ? Object.assign(new Error('Model not found.'), { status }) : error);
          },
        ));
      } finally {
        dracoLoader?.dispose();
      }
      const extensionsUsed = (gltf.parser.json as { extensionsUsed?: string[] }).extensionsUsed ?? [];
      const root = new THREE.Group();
      const modelRoot = gltf.scene;
      const correction = model.rotationCorrection;
      if (correction) modelRoot.rotation.set(correction.x, correction.y, correction.z);
      modelRoot.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(modelRoot);
      const sizeVector = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const longest = Math.max(sizeVector.x, sizeVector.y, sizeVector.z, 0.0001);
      const scale = 3.2 / longest;
      root.scale.setScalar(scale);
      root.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      root.add(modelRoot);
      const size = { x: sizeVector.x * scale, y: sizeVector.y * scale, z: sizeVector.z * scale };
      const normalizedBounds = new THREE.Box3().setFromObject(root);
      const radius = normalizedBounds.getBoundingSphere(new THREE.Sphere()).radius;
      const clips = gltf.animations.filter((clip) => Number.isFinite(clip.duration) && clip.duration > 0);
      const nodes: string[] = [];
      modelRoot.traverse((node) => { if (node.name) nodes.push(node.name); });
      console.info('[Mission Lab model]', {
        file: model.file,
        bytes: loadedBytes,
        sourceBounds: sizeVector.toArray(),
        orientationCorrection: correction ?? { x: 0, y: 0, z: 0 },
        nodes,
        animations: gltf.animations.map((clip) => ({ name: clip.name, durationSeconds: clip.duration })),
        compressionExtensions: extensionsUsed.filter((extension) => /draco|meshopt|ktx/i.test(extension)),
      });
      return { root, clips, size, radius };
    })();
    this.loadingCache.set(model.id, load);
    load.then((resource) => {
      if (this.disposed) disposeModelResource(resource, new Set());
      else this.resourceCache.set(model.id, Promise.resolve(resource));
    }).catch(() => this.failures.add(model.id)).finally(() => this.loadingCache.delete(model.id));
    return load;
  }

  private setupAnimation(resource: ModelResource): void {
    const THREE = this.THREE;
    if (!THREE || !resource.clips.length) { this.playAvailable.set(false); return; }
    this.mixer = new THREE.AnimationMixer(resource.root);
    this.action = this.mixer.clipAction(resource.clips[0]);
    this.action.setLoop(THREE.LoopRepeat, Infinity);
    this.action.play();
    this.playAvailable.set(true);
    this.playing.set(!this.reducedMotion());
    this.action.paused = this.reducedMotion();
    if (!this.reducedMotion()) this.scheduleFrame();
  }

  private stopAnimation(): void {
    this.mixer?.stopAllAction();
    if (this.mixer && this.activeResource) this.mixer.uncacheRoot(this.activeResource.root);
    this.mixer = undefined;
    this.action = undefined;
    this.playAvailable.set(false);
    this.playing.set(false);
  }

  private frameCamera(resource: ModelResource, useHint: boolean): void {
    const THREE = this.THREE;
    const camera = this.camera;
    const controls = this.controls;
    if (!THREE || !camera || !controls) return;
    const stage = this.stageRef()?.nativeElement;
    const aspect = stage?.clientWidth && stage.clientHeight ? stage.clientWidth / stage.clientHeight : 1.5;
    const distance = fitCameraDistance(resource.size, camera.fov, aspect, 1.25);
    const hint = useHint ? this.selected().cameraHint : undefined;
    const yaw = THREE.MathUtils.degToRad(hint?.yawDeg ?? 30);
    const pitch = THREE.MathUtils.degToRad(hint?.pitchDeg ?? 62);
    const spherical = new THREE.Spherical(distance, pitch, yaw);
    camera.position.setFromSpherical(spherical);
    camera.near = Math.max(0.001, distance / 2000);
    camera.far = Math.max(100, distance * 100);
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.minDistance = Math.max(0.2, resource.radius * 0.4);
    controls.maxDistance = Math.max(10, distance * 6);
    controls.update();
  }

  private resize(): void {
    const stage = this.stageRef()?.nativeElement;
    const camera = this.camera;
    if (!stage || !camera || !this.renderer) return;
    this.renderer.setSize(Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight), false);
    camera.aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
    camera.updateProjectionMatrix();
    if (this.activeResource) this.frameCamera(this.activeResource, false);
    this.renderOnce();
  }

  private rotate(yawDegrees: number, pitchDegrees: number): void {
    const THREE = this.THREE;
    const camera = this.camera;
    const controls = this.controls;
    if (!THREE || !camera || !controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= THREE.MathUtils.degToRad(yawDegrees);
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + THREE.MathUtils.degToRad(pitchDegrees), controls.minPolarAngle, controls.maxPolarAngle);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update();
    this.noteInteraction();
    this.scheduleFrame(24);
  }

  private zoom(factor: number): void {
    if (!this.camera || !this.controls) return;
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);
    const distance = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, offset.length()));
    offset.setLength(distance);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.noteInteraction();
    this.scheduleFrame(24);
  }

  private readonly onUserInteraction = (): void => {
    this.hintVisible.set(false);
    this.controls!.autoRotate = false;
    this.noteInteraction();
  };

  private readonly onControlsChange = (): void => {
    this.hintVisible.set(false);
    if (this.controls?.enableDamping) this.dampingFrames = 24;
    this.scheduleFrame();
  };

  private readonly onUserInteractionEnd = (): void => this.noteInteraction();

  private noteInteraction(): void {
    this.hintVisible.set(false);
    if (!this.autoRotateEnabled() || this.reducedMotion() || !this.controls) return;
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (this.visible && !document.hidden && this.autoRotateEnabled() && this.controls) {
        this.controls.autoRotate = true;
        this.scheduleFrame();
      }
    }, 5000);
  }

  private scheduleFrame(dampingFrames = 0): void {
    if (dampingFrames) this.dampingFrames = Math.max(this.dampingFrames, dampingFrames);
    if (this.frame || !this.visible || document.hidden || this.disposed) return;
    this.frame = window.requestAnimationFrame(this.renderFrame);
  }

  private readonly renderFrame = (): void => {
    this.frame = 0;
    if (!this.renderer || !this.scene || !this.camera || this.disposed || !this.visible || document.hidden) return;
    const delta = Math.min(this.clock?.getDelta() ?? 0, 0.05);
    if (this.playing() && this.mixer) this.mixer.update(delta);
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
    if (this.dampingFrames > 0) this.dampingFrames--;
    if (this.playing() || this.controls?.autoRotate || this.dampingFrames > 0) this.scheduleFrame();
  };

  private renderOnce(): void { this.scheduleFrame(); }

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden && this.visible) this.scheduleFrame();
    else if (this.frame) { window.cancelAnimationFrame(this.frame); this.frame = 0; }
  };

  private readonly onFullscreenChange = (): void => this.fullscreenActive.set(!!document.fullscreenElement);
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost.set(true);
    if (this.frame) { window.cancelAnimationFrame(this.frame); this.frame = 0; }
  };
  private readonly onContextRestored = (): void => { this.contextLost.set(false); this.scheduleFrame(); };

  private markFailed(model: LabModel): void {
    this.failures.add(model.id);
    this.failedModelIds.set(new Set(this.failures));
  }

  private getBaseAssetUrl(): string {
    if (!isPlatformBrowser(this.platformId)) return '/assets/machines/';
    const base = document.querySelector('base')?.href || `${window.location.origin}/`;
    return new URL('assets/machines/', base).toString();
  }

  private dispose(): void {
    this.disposed = true;
    if (this.frame) window.cancelAnimationFrame(this.frame);
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.controls?.removeEventListener('start', this.onUserInteraction);
    this.controls?.removeEventListener('end', this.onUserInteractionEnd);
    this.controls?.removeEventListener('change', this.onControlsChange);
    this.controls?.dispose();
    this.mixer?.stopAllAction();
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    const canvas = this.canvasRef()?.nativeElement;
    canvas?.removeEventListener('webglcontextlost', this.onContextLost);
    canvas?.removeEventListener('webglcontextrestored', this.onContextRestored);
    const disposed = new Set<ThreeTypes.Object3D>();
    for (const promise of this.resourceCache.values()) void promise.then((resource) => disposeModelResource(resource, disposed));
    if (this.activeResource) disposeModelResource(this.activeResource, disposed);
    this.environmentTarget?.dispose();
    this.pmrem?.dispose();
    this.renderer?.dispose();
  }
}

function disposeModelResource(resource: ModelResource, disposed: Set<ThreeTypes.Object3D>): void {
  if (disposed.has(resource.root)) return;
  disposed.add(resource.root);
  const geometries = new Set<ThreeTypes.BufferGeometry>();
  const materials = new Set<ThreeTypes.Material>();
  const textures = new Set<ThreeTypes.Texture>();
  resource.root.traverse((object) => {
    const mesh = object as ThreeTypes.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) if (value && typeof value === 'object' && 'isTexture' in value) textures.add(value as ThreeTypes.Texture);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && (error as { status?: unknown }).status === 404;
}
