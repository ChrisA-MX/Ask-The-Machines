import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { createWorld, World } from '../src/worlds/index';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
sunLight.position.set(5, 1, 3);
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x111122, 0.1);
scene.add(ambientLight);

let currentWorld: World | null = null;
const statusEl = document.getElementById('status')!;
const fpsEl = document.getElementById('fps')!;

const apolloMarker = new THREE.Mesh(
  new THREE.CylinderGeometry(0.01, 0.01, 0.05),
  new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
apolloMarker.geometry.translate(0, 0.025, 0);
apolloMarker.visible = false;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function switchWorld(id: 'moon' | 'mars' | 'outer') {
  if (currentWorld) {
    scene.remove(currentWorld.object);
    currentWorld.dispose();
  }
  
  const startTime = performance.now();
  statusEl.textContent = `Generating ${id}...`;
  
  currentWorld = createWorld(THREE, id, { quality: 'medium' });
  scene.add(currentWorld.object);
  
  if (id === 'moon') currentWorld.object.add(apolloMarker);
  
  await currentWorld.ready;
  const time = (performance.now() - startTime).toFixed(0);
  statusEl.textContent = `${id.toUpperCase()} Ready (Gen: ${time}ms)`;
  
  updateApollo();
}

document.getElementById('btn-moon')!.onclick = () => switchWorld('moon');
document.getElementById('btn-mars')!.onclick = () => switchWorld('mars');
document.getElementById('btn-outer')!.onclick = () => switchWorld('outer');

const chkApollo = document.getElementById('chk-apollo') as HTMLInputElement;
function updateApollo() {
  if (currentWorld && currentWorld.id === 'moon') {
    apolloMarker.visible = chkApollo.checked;
    const pos = currentWorld.latLonToVector3(0.67408, 23.47297, 0);
    apolloMarker.position.copy(pos);
    apolloMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), pos.clone().normalize());
  } else {
    apolloMarker.visible = false;
  }
}
chkApollo.onchange = updateApollo;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let lastTime = performance.now();
let frames = 0;
let lastFpsTime = lastTime;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  
  frames++;
  if (now - lastFpsTime >= 1000) {
    fpsEl.textContent = `FPS: ${frames}`;
    frames = 0;
    lastFpsTime = now;
  }
  
  if (currentWorld && !prefersReducedMotion) currentWorld.update(dt);
  controls.update();
  renderer.render(scene, camera);
}

switchWorld('moon');
animate();