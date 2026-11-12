# Procedural 3D Worlds Module

A framework-agnostic, standalone Three.js module to generate and render highly detailed 3D procedural worlds: the Moon, Mars, and an Outer System composition.

## Features
- **Seamless 3D Procedural Textures:** Uses 3D simplex noise mapped smoothly across the sphere. Zero seams at the 180° meridian, zero pinching at the poles.
- **Asynchronous Chunk Generation:** Textures are built incrementally across frames to prevent blocking the main UI thread.
- **No External Image Dependencies:** Fully self-contained. Craters, Maria, Valles Marineris, Olympus Mons, and more are generated mathematically using `latLonToVector3` exact positioning.
- **Performance Focused:** Built-in caching, configurable quality tiers, instance meshes for asteroid fields, and full `dispose()` memory cleanup for SPA lifecycle safety.

## Installation / Usage in Host Apps

Copy `src/worlds` and `src/utils` into your project. Only `three` is required as a dependency.

### Basic Initialization (Dynamic Import for Angular/SSR compatibility)

```typescript
// Important: In Angular or Next.js, load inside `afterNextRender` or `ngAfterViewInit`
// to ensure no document/window object errors during SSR.

import * as THREE from 'three';

// Use dynamic import if needed
const { createWorld } = await import('./src/worlds/index');

const moon = createWorld(THREE, 'moon', { 
  quality: 'high',  // 'low' (1024x512), 'medium' (2048x1024), 'high' (4096x2048)
  textureBase: '/assets/textures' // Optional fallback directory for real textures
});

scene.add(moon.object);

// Show loading spinner
await moon.ready;
// Hide loading spinner

// Animation loop
function tick(delta) {
  moon.update(delta); // Handles autonomous rotations
}

// Cleanup on component destroy
function onDestroy() {
  moon.dispose();
}