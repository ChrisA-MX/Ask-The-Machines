export type LabWorldId = 'moon' | 'mars' | 'outer';

export interface LabModelCredit {
  title: string;
  author: string;
  sourceUrl: string;
  license: string;
}

export interface LabModel {
  id: string;
  label: string;
  file: string;
  shortDescription: string;
  storyId?: string;
  worldId?: LabWorldId;
  credit?: LabModelCredit;
  cameraHint?: { yawDeg: number; pitchDeg: number };
  rotationCorrection?: { x: number; y: number; z: number };
}

export const LAB_MODELS: readonly LabModel[] = [
  {
    id: 'apollo-lunar-module',
    label: 'Apollo Lunar Module',
    file: 'apollo-lunar-module.glb',
    shortDescription: 'The lunar module was a two-part spacecraft. The bottom half landed on the Moon and stayed there, and the top half carried the astronauts back up to orbit.',
    storyId: 'apollo-11-eagle',
    worldId: 'moon',
    cameraHint: { yawDeg: 35, pitchDeg: 62 },
  },
  {
    id: 'mars-rover',
    label: 'Mars Rover',
    file: 'mars-rover.glb',
    shortDescription: 'Rovers are robot geologists on wheels. They drive across Mars, studying rocks, soil and weather with cameras and instruments on board.',
    worldId: 'mars',
  },
  {
    id: 'ingenuity-helicopter',
    label: 'Ingenuity',
    file: 'mars-ingenuity-helicopter.glb',
    shortDescription: 'Ingenuity was the first helicopter to fly on another planet. Its two blades spin in opposite directions to grip Mars’s very thin air.',
    storyId: 'ingenuity',
    worldId: 'mars',
    rotationCorrection: { x: 0, y: 0, z: Math.PI },
    cameraHint: { yawDeg: 30, pitchDeg: 60 },
  },
  {
    id: 'ingenuity-flight',
    label: 'Ingenuity in Flight',
    file: 'ingenuity-flight.glb',
    shortDescription: 'Here’s Ingenuity in its flying pose. It flew 72 times, scouting safe routes and interesting rocks for the Perseverance rover.',
    storyId: 'ingenuity',
    worldId: 'mars',
    cameraHint: { yawDeg: 30, pitchDeg: 62 },
  },
  {
    id: 'voyager-probe',
    label: 'Voyager Probe',
    file: 'voyager-probe.glb',
    shortDescription: 'Voyager’s big dish antenna talks to Earth, and a golden record is mounted on its side. Voyager 1 and Voyager 2 share this design, and both are still sending signals home.',
    storyId: 'voyager-1',
    worldId: 'outer',
    rotationCorrection: { x: Math.PI / 2, y: 0, z: 0 },
    cameraHint: { yawDeg: 20, pitchDeg: 58 },
  },
];

export function buildLabStoryUrl(model: LabModel): string | null {
  if (!model.storyId || !model.worldId) return null;
  return `/storylines/${model.worldId}/${model.storyId}`;
}

export function buildLabWorldUrl(model: LabModel): string | null {
  return model.worldId ? `/storylines?world=${model.worldId}&trail=1` : null;
}

export interface ModelDimensions { x: number; y: number; z: number }

/** Camera distance needed to fit a bounding sphere in the narrower FOV dimension. */
export function fitCameraDistance(size: ModelDimensions, fovDegrees: number, aspect: number, margin = 1.2): number {
  const radius = Math.hypot(size.x, size.y, size.z) / 2;
  const verticalHalfFov = Math.max(0.01, Math.min(179, fovDegrees)) * Math.PI / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(0.01, aspect));
  return radius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)) * margin;
}
