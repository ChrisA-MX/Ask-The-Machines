import { isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, inject, Input, Output, PLATFORM_ID, signal, ViewChild } from '@angular/core';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type * as ThreeTypes from 'three';

const EARTH_MODEL_URL = '/assets/models/Earth_1_12756.glb';

@Component({
  imports: [],
  selector: 'app-stage',
  styleUrl: './stage.css',
  templateUrl: './stage.html',
})
export class Stage {
  @Input() showPlanets = false;
  @Output() focusChange = new EventEmitter<boolean>();

  protected readonly earthLoadError = signal(false);

  private focused = false;
  private readonly platformId = inject(PLATFORM_ID);
  private THREE?: typeof import('three');
  private renderer?: ThreeTypes.WebGLRenderer;
  private scene?: ThreeTypes.Scene;
  private camera?: ThreeTypes.PerspectiveCamera;
  private earth?: ThreeTypes.Object3D;
  private controls?: OrbitControls;
  private resizeObserver?: ResizeObserver;
  private animationFrame = 0;
  private modelRequest = 0;
  private earthCanvasElement?: HTMLCanvasElement;

  @Input()
  set focusMode(value: boolean) {
    this.focused = value;
    if (this.controls) this.controls.enabled = value;
  }
  get focusMode(): boolean {
    return this.focused;
  }

  @ViewChild('earthCanvas')
  set earthCanvas(canvas: ElementRef<HTMLCanvasElement> | undefined) {
    if (!canvas) {
      this.earthCanvasElement = undefined;
      this.disposeRenderer();
      return;
    }

    this.earthCanvasElement = canvas.nativeElement;
    if (isPlatformBrowser(this.platformId)) {
      void this.loadEarth(canvas.nativeElement);
    }
  }

  private async loadEarth(canvas: HTMLCanvasElement): Promise<void> {
    this.disposeRenderer();
    const request = ++this.modelRequest;
    this.earthLoadError.set(false);

    try {
      const [THREE, { GLTFLoader }, { OrbitControls }] = await Promise.all([
        import('three'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/controls/OrbitControls.js'),
      ]);
      if (request !== this.modelRequest || !canvas.isConnected) return;
      this.THREE = THREE;

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer = renderer;

      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 2));
      scene.add(new THREE.HemisphereLight(0xadd7ff, 0x1b2940, 0.8));
      const sunlight = new THREE.DirectionalLight(0xffffff, 2.8);
      sunlight.position.set(-3, 2, 4);
      scene.add(sunlight);
      this.scene = scene;

      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.z = 3.7;
      this.camera = camera;

      const gltf = await new GLTFLoader().loadAsync(EARTH_MODEL_URL);
      if (request !== this.modelRequest || !canvas.isConnected) return;

      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
      const scale = 1.1 / radius;
      model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      model.scale.setScalar(scale);
      scene.add(model);
      this.earth = model;

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.minDistance = 2.8;
      controls.maxDistance = 6.5;
      controls.minPolarAngle = Math.PI / 2 - 0.35;
      controls.maxPolarAngle = Math.PI / 2 + 0.35;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.5;
      controls.enabled = this.focusMode;
      this.controls = controls;

      this.resizeRenderer(canvas);
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.resizeRenderer(canvas));
        this.resizeObserver.observe(canvas);
      } else {
        window.addEventListener('resize', this.onWindowResize);
      }
      this.animate();
    } catch {
      if (request !== this.modelRequest) return;
      this.earthLoadError.set(true);
      this.disposeRenderer();
    }
  }

  private resizeRenderer(canvas: HTMLCanvasElement): void {
    if (!this.renderer || !this.camera) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    this.renderer.setSize(bounds.width, bounds.height, false);
    this.camera.aspect = bounds.width / bounds.height;
    this.camera.updateProjectionMatrix();
  }

  protected onEarthKeydown(event: KeyboardEvent): void {
    if (!this.focusMode) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.focusChange.emit(true);
      }
      return;
    }

    if (!this.THREE || !this.camera || !this.controls) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();

    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new this.THREE.Spherical().setFromVector3(offset);
    if (event.key === 'ArrowLeft') spherical.theta += 0.12;
    if (event.key === 'ArrowRight') spherical.theta -= 0.12;
    if (event.key === 'ArrowUp') spherical.phi -= 0.08;
    if (event.key === 'ArrowDown') spherical.phi += 0.08;
    spherical.phi = this.THREE.MathUtils.clamp(
      spherical.phi,
      this.controls.minPolarAngle,
      this.controls.maxPolarAngle,
    );
    this.camera.position.setFromSpherical(spherical).add(this.controls.target);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  protected focusEarth(): void {
    if (!this.focusMode) this.focusChange.emit(true);
  }

  protected exitEarthFocus(): void {
    this.focusChange.emit(false);
  }

  protected onStageClick(event: MouseEvent): void {
    if (this.focusMode && !this.earthCanvasElement?.contains(event.target as Node)) {
      this.exitEarthFocus();
    }
  }

  @HostListener('document:keydown.escape')
  private onEscape(): void {
    if (this.focusMode) this.exitEarthFocus();
  }

  private animate = (): void => {
    if (!this.renderer || !this.scene || !this.camera || !this.earth || !this.controls) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private readonly onWindowResize = (): void => {
    const canvas = this.renderer?.domElement;
    if (canvas) this.resizeRenderer(canvas);
  };

  private disposeRenderer(): void {
    this.modelRequest++;
    if (this.animationFrame && isPlatformBrowser(this.platformId)) {
      cancelAnimationFrame(this.animationFrame);
    }
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.onWindowResize);
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.controls?.dispose();
    this.controls = undefined;
    this.scene?.clear();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.scene = undefined;
    this.camera = undefined;
    this.THREE = undefined;
    this.earth = undefined;
  }
}
