import type * as THREE from 'three';
import { fbm3, cellularSphere, getSphere3DPoint, yieldMain, getDistanceOnSphere } from '../utils/noise';

export async function generateMarsTextures(THREE: typeof import('three'), width: number, height: number, seed: number) {
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = bumpCanvas.width = width;
  colorCanvas.height = bumpCanvas.height = height;
  const ctxC = colorCanvas.getContext('2d')!;
  const ctxB = bumpCanvas.getContext('2d')!;
  
  const imgC = ctxC.createImageData(width, height);
  const imgB = ctxB.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    const v = 1.0 - (y / height);
    const lat = (v - 0.5) * 180;
    
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const lon = (u - 0.5) * 360;
      const [nx, ny, nz] = getSphere3DPoint(u, v);
      
      let elevation = fbm3(nx, ny, nz, 7, seed) * 0.5 + 0.5;
      
      // Olympus Mons & Tharsis
      let olyD = getDistanceOnSphere(lat, lon, 18, -134);
      if (olyD < 0.2) elevation += Math.pow(1 - olyD/0.2, 2) * 0.4;
      
      // Hellas
      let helD = getDistanceOnSphere(lat, lon, -42, 70);
      if (helD < 0.3) elevation -= Math.pow(1 - helD/0.3, 2) * 0.3;
      
      // Valles Marineris (approx line distance)
      if (lat > -15 && lat < -4 && lon > -90 && lon < -45) {
        let vallesD = Math.abs((lat - (-9.5)) / 5);
        if (vallesD < 1) elevation -= Math.pow(1 - vallesD, 2) * 0.3 * fbm3(nx*10,ny*10,nz*10,3,seed+1);
      }

      // Weathered craters
      let craterDepth = 0;
      const cell = cellularSphere(nx, ny, nz, 8, seed);
      if (cell.dist < 0.4) {
         const bowl = Math.pow(1.0 - (cell.dist / 0.4), 2);
         craterDepth -= bowl * 0.1 * fbm3(nx*5,ny*5,nz*5,2,seed);
      }
      elevation += craterDepth;
      elevation = Math.max(0, Math.min(1, elevation));

      // Color based on lat/lon, elevation, and noise
      let r = 180, g = 90, b = 50;
      
      // Dark regions (Syrtis Major, Acidalia)
      let syrtisD = getDistanceOnSphere(lat, lon, 9, 70);
      let acidaliaD = getDistanceOnSphere(lat, lon, 47, -22);
      let darkBase = fbm3(nx*3, ny*3, nz*3, 4, seed+2) > 0 ? 1 : 0;
      if (syrtisD < 0.4 || acidaliaD < 0.5) {
        r *= 0.6; g *= 0.6; b *= 0.6;
      }
      
      // Polar Ice Caps
      if (lat > 75 || lat < -70) {
        const capEdge = fbm3(nx*10, ny*10, nz*10, 4, seed) * 5;
        if ((lat > 0 && lat > 80 + capEdge) || (lat < 0 && lat < -75 - capEdge)) {
          r = 240; g = 245; b = 255;
          elevation += 0.05;
        }
      }

      // Lighting variations
      r += (elevation - 0.5) * 50;
      g += (elevation - 0.5) * 30;

      const cIdx = (y * width + x) * 4;
      imgC.data[cIdx] = Math.max(0, Math.min(255, r));
      imgC.data[cIdx+1] = Math.max(0, Math.min(255, g));
      imgC.data[cIdx+2] = Math.max(0, Math.min(255, b));
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