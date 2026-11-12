import type * as THREE from 'three';

export function createOuterSystem(THREE: typeof import('three'), quality: string) {
  const group = new THREE.Group();
  
  // Stars
  const starCount = quality === 'low' ? 2000 : 8000;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starPhases = new Float32Array(starCount);
  
  for (let i = 0; i < starCount; i++) {
    const u = Math.random();
    const v = Math.random();
    const lon = u * Math.PI * 2;
    const lat = Math.acos(2 * v - 1) - Math.PI / 2;
    const r = 40 + Math.random() * 10;
    
    starPos[i*3] = r * Math.cos(lat) * Math.sin(lon);
    starPos[i*3+1] = r * Math.sin(lat);
    starPos[i*3+2] = r * Math.cos(lat) * Math.cos(lon);
    
    const ct = Math.random();
    if (ct > 0.8) { starColors[i*3]=1; starColors[i*3+1]=0.8; starColors[i*3+2]=0.6; } // Warm
    else if (ct > 0.6) { starColors[i*3]=0.6; starColors[i*3+1]=0.8; starColors[i*3+2]=1; } // Blue
    else { starColors[i*3]=1; starColors[i*3+1]=1; starColors[i*3+2]=1; } // White
    
    starPhases[i] = Math.random() * Math.PI * 2;
  }
  
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  starGeo.setAttribute('phase', new THREE.BufferAttribute(starPhases, 1));
  
  const starMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      attribute float phase;
      varying vec3 vColor;
      uniform float time;
      void main() {
        vColor = color * (0.5 + 0.5 * sin(time * 2.0 + phase));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 1.5;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 1.0); }
    `,
    vertexColors: true,
    transparent: true
  });
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);

  // Gas Giant Core
  const giantGeo = new THREE.SphereGeometry(1, 64, 64);
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 512; i++) {
    const v = i / 512;
    const band = Math.sin(v * 40) + Math.cos(v * 15);
    ctx.fillStyle = `rgb(${180 + band*30}, ${150 + band*20}, ${120 + band*40})`;
    ctx.fillRect(i, 0, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const giantMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  const giant = new THREE.Mesh(giantGeo, giantMat);
  group.add(giant);

  // Rings
  const ringGeo = new THREE.RingGeometry(1.4, 2.4, 128);
  const ringPos = ringGeo.attributes['position'];
  const ringUV = ringGeo.attributes['uv'];
  for (let i = 0; i < ringUV.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(ringPos, i).length();
    ringUV.setXY(i, (v - 1.4) / (2.4 - 1.4), 0.5);
  }
  
  const rCanv = document.createElement('canvas');
  rCanv.width = 256; rCanv.height = 1;
  const rCtx = rCanv.getContext('2d')!;
  for (let i = 0; i < 256; i++) {
    const p = i / 256;
    let alpha = (Math.sin(p * 50) > 0 && Math.sin(p * 20) > -0.5) ? 0.8 : 0.0;
    rCtx.fillStyle = `rgba(200, 180, 160, ${alpha})`;
    rCtx.fillRect(i, 0, 1, 1);
  }
  const rTex = new THREE.CanvasTexture(rCanv);
  const ringMat = new THREE.MeshStandardMaterial({ map: rTex, transparent: true, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.receiveShadow = true;
  ring.castShadow = true;
  group.add(ring);

  // Asteroids
  const astCount = quality === 'low' ? 150 : 400;
  const astGeo = new THREE.IcosahedronGeometry(0.02, 1);
  const astMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
  const asteroids = new THREE.InstancedMesh(astGeo, astMat, astCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < astCount; i++) {
    const dist = 2.6 + Math.random() * 0.4;
    const angle = Math.random() * Math.PI * 2;
    dummy.position.set(Math.cos(angle)*dist, (Math.random()-0.5)*0.1, Math.sin(angle)*dist);
    dummy.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
    dummy.scale.setScalar(0.5 + Math.random());
    dummy.updateMatrix();
    asteroids.setMatrixAt(i, dummy.matrix);
  }
  group.add(asteroids);

  const update = (dt: number) => {
    starMat.uniforms['time'].value += dt;
    asteroids.rotation.y -= dt * 0.1;
  };
  
  return { group, update, stars, giant, ring, asteroids, materials: [starMat, giantMat, ringMat, astMat], geometries: [starGeo, giantGeo, ringGeo, astGeo], textures: [tex, rTex] };
}
