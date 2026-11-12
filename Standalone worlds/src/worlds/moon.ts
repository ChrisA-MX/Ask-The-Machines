import type * as THREE from 'three';
import { fbm3, cellularSphere, getSphere3DPoint, yieldMain, getDistanceOnSphere } from '../utils/noise';

const MARIA = [
  { lat: 18, lon: -57, r: 0.4 }, { lat: 33, lon: -16, r: 0.35 },
  { lat: 28, lon: 18, r: 0.25 }, { lat: 8, lon: 31, r: 0.2 },
  { lat: 17, lon: 59, r: 0.2 }, { lat: -8, lon: 51, r: 0.15 },
  { lat: -21, lon: -17, r: 0.2 }, { lat: -24, lon: -39, r: 0.15 }
];

export async function generateMoonTextures(THREE: typeof import('three'), width: number, height: number, seed: number) {
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = bumpCanvas.width = width;
  colorCanvas.height = bumpCanvas.height = height;
  const ctxC = colorCanvas.getContext('2d')!;
  const ctxB = bumpCanvas.getContext('2d')!;
  
  const imgC = ctxC.createImageData(width, height);
  const imgB = ctxB.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    const v = 1.0 - (y / height); // 0 to 1
    const lat = (v - 0.5) * 180;
    
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const lon = (u - 0.5) * 360;
      const [nx, ny, nz] = getSphere3DPoint(u, v);
      
      let elevation = fbm3(nx, ny, nz, 6, seed) * 0.5 + 0.5;
      
      let mariaDepression = 0;
      for (const m of MARIA) {
        const d = getDistanceOnSphere(lat, lon, m.lat, m.lon);
        if (d < m.r) {
          const falloff = Math.pow(1 - (d / m.r), 2);
          mariaDepression = Math.max(mariaDepression, falloff);
        }
      }
      elevation = elevation * (1 - mariaDepression * 0.6);

      // Craters via multi-frequency cellular noise
      let craterDepth = 0;
      const freqs = [6, 15, 30];
      for (let i = 0; i < freqs.length; i++) {
        const cell = cellularSphere(nx, ny, nz, freqs[i], seed + i);
        const cd = cell.dist; 
        if (cd < 0.4) {
          const rim = Math.pow(cd * 2.5, 2);
          const bowl = Math.pow(1.0 - (cd / 0.4), 2);
          craterDepth += (rim * 0.2 - bowl * 0.4) * (1.0 / (i + 1));
        }
      }
      elevation += craterDepth;
      elevation = Math.max(0, Math.min(1, elevation));
      
      const isRay = getDistanceOnSphere(lat, lon, -43, -11) < 1.0 && fbm3(nx*20, ny*20, nz*20, 2, seed) > 0.2;
      const baseColor = isRay ? 0.7 : 0.45;
      const colorVal = baseColor + (elevation - 0.5) * 0.3 - (mariaDepression * 0.25);
      
      const cIdx = (y * width + x) * 4;
      const gray = Math.floor(Math.max(0, Math.min(255, colorVal * 255)));
      imgC.data[cIdx] = imgC.data[cIdx+1] = imgC.data[cIdx+2] = gray;
      imgC.data[cIdx+3] = 255;
      
      const bump = Math.floor(elevation * 255);
      imgB.data[cIdx] = imgB.data[cIdx+1] = imgB.data[cIdx+2] = bump;
      imgB.data[cIdx+3] = 255;
    }
    if (y % 16 === 0) await yieldMain();
  }
  
  ctxC.putImageData(imgC, 0, 0);
  ctxB.putImageData(imgB, 0, 0);
  
  const map = new THREE.CanvasTexture(colorCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  map.anisotropy = bumpMap.anisotropy = 4;
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, bumpMap };
}