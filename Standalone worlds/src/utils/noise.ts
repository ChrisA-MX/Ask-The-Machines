// 3D Simplex Noise & Sphere Mapping Utilities
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;

const grad3 = new Float32Array([
  1,1,0, -1,1,0, 1,-1,0, -1,-1,0,
  1,0,1, -1,0,1, 1,0,-1, -1,0,-1,
  0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1
]);

const p = new Uint8Array(256);
for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 256);
const perm = new Uint8Array(512);
const permMod12 = new Uint8Array(512);
for (let i = 0; i < 512; i++) {
  perm[i] = p[i & 255];
  permMod12[i] = (perm[i] % 12) * 3;
}

export function simplex3(x: number, y: number, z: number, seed: number = 0): number {
  let s = (x + y + z) * F3;
  let i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
  let t = (i + j + k) * G3;
  let X0 = i - t, Y0 = j - t, Z0 = k - t;
  let x0 = x - X0, y0 = y - Y0, z0 = z - Z0;
  
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0)      { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
    else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
    else               { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
  } else {
    if (y0 < z0)       { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
    else if (x0 < z0)  { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
    else               { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
  }

  let x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
  let x2 = x0 - i2 + 2.0*G3, y2 = y0 - j2 + 2.0*G3, z2 = z0 - k2 + 2.0*G3;
  let x3 = x0 - 1.0 + 3.0*G3, y3 = y0 - 1.0 + 3.0*G3, z3 = z0 - 1.0 + 3.0*G3;

  let ii = (i + seed) & 255, jj = j & 255, kk = k & 255;
  let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

  let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
  if (t0 > 0) {
    let gi0 = permMod12[ii + perm[jj + perm[kk]]];
    t0 *= t0;
    n0 = t0 * t0 * (grad3[gi0]*x0 + grad3[gi0+1]*y0 + grad3[gi0+2]*z0);
  }
  let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
  if (t1 > 0) {
    let gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
    t1 *= t1;
    n1 = t1 * t1 * (grad3[gi1]*x1 + grad3[gi1+1]*y1 + grad3[gi1+2]*z1);
  }
  let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
  if (t2 > 0) {
    let gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
    t2 *= t2;
    n2 = t2 * t2 * (grad3[gi2]*x2 + grad3[gi2+1]*y2 + grad3[gi2+2]*z2);
  }
  let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
  if (t3 > 0) {
    let gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];
    t3 *= t3;
    n3 = t3 * t3 * (grad3[gi3]*x3 + grad3[gi3+1]*y3 + grad3[gi3+2]*z3);
  }
  return 32.0 * (n0 + n1 + n2 + n3);
}

export function fbm3(x: number, y: number, z: number, octaves: number, seed: number = 0): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    v += amp * simplex3(x * freq, y * freq, z * freq, seed);
    freq *= 2.0;
    amp *= 0.5;
  }
  return v;
}

function hash3(x: number, y: number, z: number, seed: number): number[] {
  let n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453123;
  let fract = n - Math.floor(n);
  return [fract, (n * 1.33) - Math.floor(n * 1.33), (n * 1.77) - Math.floor(n * 1.77)];
}

export function cellularSphere(nx: number, ny: number, nz: number, freq: number, seed: number): { dist: number, pt: number[] } {
  const px = nx * freq, py = ny * freq, pz = nz * freq;
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  let minDist = 1.0;
  let closestPt = [0,0,0];

  for (let k = -1; k <= 1; k++) {
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        let h = hash3(ix + i, iy + j, iz + k, seed);
        let dx = (i + h[0]) - (px - ix);
        let dy = (j + h[1]) - (py - iy);
        let dz = (k + h[2]) - (pz - iz);
        let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < minDist) {
          minDist = dist;
          closestPt = [ix + i + h[0], iy + j + h[1], iz + k + h[2]];
        }
      }
    }
  }
  return { dist: minDist, pt: closestPt };
}

export function getSphere3DPoint(u: number, v: number): [number, number, number] {
  const lon = (u - 0.5) * Math.PI * 2;
  const lat = (v - 0.5) * Math.PI;
  return [
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.cos(lon)
  ];
}

export const yieldMain = () => new Promise(r => setTimeout(r, 0));

export function getDistanceOnSphere(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rLat1 = lat1 * Math.PI / 180;
  const rLon1 = lon1 * Math.PI / 180;
  const rLat2 = lat2 * Math.PI / 180;
  const rLon2 = lon2 * Math.PI / 180;
  const x1 = Math.cos(rLat1) * Math.sin(rLon1), y1 = Math.sin(rLat1), z1 = Math.cos(rLat1) * Math.cos(rLon1);
  const x2 = Math.cos(rLat2) * Math.sin(rLon2), y2 = Math.sin(rLat2), z2 = Math.cos(rLat2) * Math.cos(rLon2);
  const dot = Math.max(-1, Math.min(1, x1*x2 + y1*y2 + z1*z2));
  return Math.acos(dot);
}