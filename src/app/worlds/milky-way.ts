import type * as THREE from 'three';

export interface MilkyWayScene {
  object: THREE.Group;
  radius: number;
  update(dt: number, isSelected: boolean): void;
  resize(drawingBufferWidth: number, drawingBufferHeight: number): void;
  setBrightness(brightness: number): void;
  dispose(): void;
}

export const MILKY_WAY_STYLE = {
  /** Center world makes a full turn in one minute; side worlds turn more slowly. */
  centerSpinRadiansPerSecond: (Math.PI * 2) / 60,
  sideSpinRadiansPerSecond: (Math.PI * 2) / 120,
  tiltDegrees: 55,
  scale: 1.38,
  colorGain: 1.65,
} as const;

const TEXTURE_SIZE = 768;

/** Makes an opaque-alpha-free, colored spiral texture; RGB carries color and alpha carries coverage. */
function createGalaxyTexture(three: typeof import('three')): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('A 2D canvas is required to create the galaxy texture.');

  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const data = image.data;
  const center = (TEXTURE_SIZE - 1) / 2;
  const radius = center * 0.94;
  const smoothstep = (edge0: number, edge1: number, value: number): number => {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };
  const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
  const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
  const blue = [72, 145, 255];
  const violet = [151, 103, 255];
  const pink = [255, 127, 194];
  const gold = [255, 219, 154];

  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const dx = (x - center) / radius;
      const dy = (y - center) / radius;
      const r = Math.hypot(dx, dy);
      if (r >= 1.02) continue;

      const theta = Math.atan2(dy, dx);
      const armPhase = theta - 4.1 * r;
      let arm = 0;
      let crispArm = 0;
      for (let armIndex = 0; armIndex < 4; armIndex++) {
        const distance = Math.abs(wrapAngle(armPhase - armIndex * Math.PI / 2)) * Math.max(r, 0.07);
        const width = 0.027 + r * 0.024;
        arm = Math.max(arm, Math.exp(-0.5 * (distance / (width * 2.8)) ** 2));
        crispArm = Math.max(crispArm, Math.exp(-0.5 * (distance / (width * 1.55)) ** 2));
      }

      const edgeFade = 1 - smoothstep(0.84, 1.02, r);
      const innerGlow = Math.exp(-r * 7.2) * 0.78;
      const armBrightness = (0.3 * arm + 0.7 * crispArm) * (0.86 + 0.14 * Math.sin(r * 57 + theta * 5) ** 2);
      const brightness = Math.max(innerGlow, armBrightness) * edgeFade;
      if (brightness < 0.012) continue;

      const outerBlend = smoothstep(0.16, 0.88, r);
      const innerBlend = smoothstep(0.08, 0.58, r);
      const colorGain = outerBlend * 0.72;
      const colorRed = lerp(lerp(gold[0], pink[0], innerBlend), lerp(violet[0], blue[0], outerBlend), colorGain);
      const colorGreen = lerp(lerp(gold[1], pink[1], innerBlend), lerp(violet[1], blue[1], outerBlend), colorGain);
      const colorBlue = lerp(lerp(gold[2], pink[2], innerBlend), lerp(violet[2], blue[2], outerBlend), colorGain);
      // Clamp texture color before the material gain; additive blending supplies the extra glow.
      const intensity = Math.min(1, 0.2 + brightness * 0.92);
      const offset = (y * TEXTURE_SIZE + x) * 4;
      data[offset] = Math.min(255, colorRed * intensity);
      data[offset + 1] = Math.min(255, colorGreen * intensity);
      data[offset + 2] = Math.min(255, colorBlue * intensity);
      data[offset + 3] = Math.min(255, brightness * 250);
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = three.LinearMipmapLinearFilter;
  texture.magFilter = three.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createRadialGlowTexture(three: typeof import('three'), colors: [string, string, string]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas is required to create the galaxy glow.');
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.28, colors[1]);
  gradient.addColorStop(1, colors[2]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

/** Creates a centered, tilted spiral with a dedicated, frame-rate-independent spin pivot. */
export function createMilkyWay(
  three: typeof import('three'),
  _mobile: boolean,
  targetRadius: number,
): MilkyWayScene {
  const outerGroup = new three.Group();
  outerGroup.name = 'Milky Way outer group';
  outerGroup.rotation.x = three.MathUtils.degToRad(MILKY_WAY_STYLE.tiltDegrees);
  outerGroup.scale.setScalar(MILKY_WAY_STYLE.scale);

  const spinPivot = new three.Group();
  spinPivot.name = 'Milky Way spin pivot';
  outerGroup.add(spinPivot);

  const galaxyTexture = createGalaxyTexture(three);
  const discMaterial = new three.MeshBasicMaterial({
    map: galaxyTexture,
    color: new three.Color().setScalar(MILKY_WAY_STYLE.colorGain),
    transparent: true,
    blending: three.AdditiveBlending,
    depthWrite: false,
    side: three.DoubleSide,
    toneMapped: false,
  });
  const disc = new three.Mesh(new three.PlaneGeometry(targetRadius * 2, targetRadius * 2), discMaterial);
  disc.name = 'Milky Way spiral disc';
  // PlaneGeometry starts in XY with normal +Z; -90 degrees around X puts its normal on +Y.
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0, 0, 0);
  disc.renderOrder = 1;
  spinPivot.add(disc);

  const haloTexture = createRadialGlowTexture(three, ['rgba(145,190,255,.25)', 'rgba(99,92,255,.12)', 'rgba(80,110,255,0)']);
  const haloMaterial = new three.SpriteMaterial({ map: haloTexture, color: 0x9c9bff, transparent: true, opacity: 0.75, blending: three.AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = new three.Sprite(haloMaterial);
  halo.name = 'Milky Way outer halo';
  halo.scale.set(targetRadius * 3.1, targetRadius * 3.1, 1);
  halo.position.set(0, -0.018, 0);
  halo.renderOrder = 0;
  spinPivot.add(halo);

  const coreTexture = createRadialGlowTexture(three, ['rgba(255,250,221,1)', 'rgba(255,205,126,.74)', 'rgba(255,157,85,0)']);
  const coreMaterial = new three.SpriteMaterial({ map: coreTexture, color: 0xffe4b5, transparent: true, opacity: 0.9, blending: three.AdditiveBlending, depthWrite: false, toneMapped: false });
  const core = new three.Sprite(coreMaterial);
  core.name = 'Milky Way warm core';
  const coreDiameter = targetRadius * 2 * 0.3;
  core.scale.set(coreDiameter, coreDiameter, 1);
  core.position.set(0, 0.025, 0);
  core.renderOrder = 2;
  spinPivot.add(core);

  const glowMaterials = [haloMaterial, coreMaterial];
  const materials = [discMaterial];
  const geometries = [disc.geometry];
  const setBrightness = (brightness: number): void => {
    discMaterial.color.setScalar(MILKY_WAY_STYLE.colorGain * brightness);
    haloMaterial.opacity = 0.75 * brightness;
    coreMaterial.opacity = 0.9 * brightness;
  };

  console.info('[WorldCarousel] Outer slot renderer: procedural RGBA canvas-texture galaxy (no galaxy.glb asset is present).', {
    object: outerGroup.name,
    children: [spinPivot.name, disc.name, halo.name, core.name],
    discSize: { width: targetRadius * 2, height: targetRadius * 2, depth: 0 },
    textureChannels: 'RGB=color; alpha=transparent coverage',
  });

  return {
    object: outerGroup,
    radius: targetRadius * MILKY_WAY_STYLE.scale,
    update: (dt, isSelected) => {
      spinPivot.rotation.y = (spinPivot.rotation.y + dt * (isSelected ? MILKY_WAY_STYLE.centerSpinRadiansPerSecond : MILKY_WAY_STYLE.sideSpinRadiansPerSecond)) % (Math.PI * 2);
    },
    resize: () => undefined,
    setBrightness,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      glowMaterials.forEach((material) => material.dispose());
      galaxyTexture.dispose();
      haloTexture.dispose();
      coreTexture.dispose();
      outerGroup.clear();
    },
  };
}
