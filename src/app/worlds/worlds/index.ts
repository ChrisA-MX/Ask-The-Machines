import type * as THREE from 'three';
import { generateMoonTextures } from './moon';
import { generateMarsTextures } from './mars';
import { createOuterSystem } from './outer';

export interface WorldOptions {
  quality?: 'low' | 'medium' | 'high';
  textureBase?: string;
  seed?: number;
}

export interface World {
  id: 'moon' | 'mars' | 'outer';
  object: THREE.Group;
  radius: number;
  update(dt: number): void;
  setQuality(q: 'low' | 'medium' | 'high'): void;
  ready: Promise<void>;
  latLonToVector3(lat: number, lon: number, altitude?: number): THREE.Vector3;
  dispose(): void;
}

const textureCache = new Map<string, THREE.Texture>();

export function createWorld(threeRef: typeof import('three'), id: World['id'], opts: WorldOptions = {}): World {
  const quality = opts.quality || (typeof window !== 'undefined' && window.devicePixelRatio > 1 ? 'medium' : 'high');
  const seed = opts.seed || 12345;
  const group = new threeRef.Group();
  let updater: (dt: number) => void = () => {};
  let toDispose: { dispose: () => void }[] = [];
  
  const w = quality === 'low' ? 1024 : (quality === 'medium' ? 2048 : 4096);
  const h = w / 2;

  let resolver!: () => void;
  let rejecter!: (reason: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => { resolver = resolve; rejecter = reject; });

  const loadTexture = (url: string) => {
    return new Promise<THREE.Texture | null>(res => {
      new threeRef.TextureLoader().load(url, tex => {
        tex.colorSpace = threeRef.SRGBColorSpace;
        tex.anisotropy = 4;
        res(tex);
      }, undefined, () => res(null));
    });
  };

  if (id === 'moon' || id === 'mars') {
    const geo = new threeRef.SphereGeometry(1, 64, 64);
    const mat = new threeRef.MeshStandardMaterial({ roughness: id === 'moon' ? 1.0 : 0.8 });
    const mesh = new threeRef.Mesh(geo, mat);
    
    if (id === 'mars') {
      const atmosGeo = new threeRef.SphereGeometry(1.02, 64, 64);
      const atmosMat = new threeRef.MeshBasicMaterial({ color: 0x88bbff, transparent: true, opacity: 0.1, blending: threeRef.AdditiveBlending, side: threeRef.BackSide });
      const atmos = new threeRef.Mesh(atmosGeo, atmosMat);
      group.add(atmos);
      toDispose.push(atmosGeo, atmosMat);
    }
    
    group.add(mesh);
    toDispose.push(geo, mat);

    (async () => {
      try {
      let map = textureCache.get(`${id}_map_${w}`);
      let bump = textureCache.get(`${id}_bump_${w}`);
      
      if (!map && opts.textureBase) {
        const extMap = await loadTexture(`${opts.textureBase}/${id}.jpg`);
        const extBump = await loadTexture(`${opts.textureBase}/${id}-bump.jpg`);
        if (extMap) map = extMap;
        if (extBump) bump = extBump;
      }

      if (!map || !bump) {
        const generated = id === 'moon' 
          ? await generateMoonTextures(threeRef, w, h, seed)
          : await generateMarsTextures(threeRef, w, h, seed);
        map = generated.map;
        bump = generated.bumpMap;
        textureCache.set(`${id}_map_${w}`, map);
        textureCache.set(`${id}_bump_${w}`, bump);
      }

      mat.map = map;
      mat.bumpMap = bump;
      mat.bumpScale = 0.015;
      mat.needsUpdate = true;
      
      updater = (dt: number) => {
        mesh.rotation.y += dt * (id === 'moon' ? (Math.PI*2)/90 : (Math.PI*2)/60);
      };
      
      group.rotation.z = threeRef.MathUtils.degToRad(id === 'moon' ? 6.7 : 25);
      resolver();
      } catch (error) {
        rejecter(error);
      }
    })();
  } else if (id === 'outer') {
    const outer = createOuterSystem(threeRef, quality);
    group.add(outer.group);
    group.rotation.z = threeRef.MathUtils.degToRad(10);
    toDispose.push(...outer.geometries, ...outer.materials, ...outer.textures);
    updater = (dt) => {
      outer.update(dt);
      group.rotation.y += dt * (Math.PI*2)/75;
    };
    resolver!();
  }

  return {
    id,
    object: group,
    radius: 1,
    update: (dt: number) => updater(dt),
    setQuality: (q) => { console.warn('Quality change requires recreation'); },
    ready,
    latLonToVector3: (lat: number, lon: number, altitude = 0) => {
      const r = 1 + altitude;
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 90) * (Math.PI / 180);
      return new threeRef.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
         r * Math.cos(phi),
         r * Math.sin(phi) * Math.sin(theta)
      );
    },
    dispose: () => {
      toDispose.forEach(d => d.dispose());
      group.clear();
    }
  };
}
