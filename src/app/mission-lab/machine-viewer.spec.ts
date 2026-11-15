import { fitCameraDistance, buildLabStoryUrl, buildLabWorldUrl, LAB_MODELS } from '../data/lab-models';
import { nextLabTabIndex } from './machine-viewer';

describe('Mission Lab model configuration and controls', () => {
  it('contains exactly five uniquely identified model entries with no credit placeholders', () => {
    expect(LAB_MODELS).toHaveLength(5);
    expect(new Set(LAB_MODELS.map((model) => model.id)).size).toBe(5);
    expect(LAB_MODELS.map((model) => model.file)).toEqual([
      'apollo-lunar-module.glb', 'mars-rover.glb', 'mars-ingenuity-helicopter.glb', 'ingenuity-flight.glb', 'voyager-probe.glb',
    ]);
    expect(LAB_MODELS.every((model) => model.credit === undefined)).toBe(true);
    expect(LAB_MODELS.find((model) => model.id === 'mars-rover')?.label).toBe('Mars Rover');
  });

  it('fits both small and large model bounds and increases camera distance for larger bounds', () => {
    const small = fitCameraDistance({ x: 0.1, y: 0.21, z: 0.34 }, 38, 1.5);
    const large = fitCameraDistance({ x: 1635, y: 302, z: 477 }, 38, 1.5);
    expect(Number.isFinite(small)).toBe(true);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small * 100);
  });

  it('moves selection with arrow keys and Home/End', () => {
    expect(nextLabTabIndex('ArrowRight', 4, 5)).toEqual({ index: 0, preventDefault: true });
    expect(nextLabTabIndex('ArrowLeft', 0, 5)).toEqual({ index: 4, preventDefault: true });
    expect(nextLabTabIndex('Home', 3, 5)).toEqual({ index: 0, preventDefault: true });
    expect(nextLabTabIndex('End', 1, 5)).toEqual({ index: 4, preventDefault: true });
    expect(nextLabTabIndex('Tab', 2, 5)).toEqual({ index: 2, preventDefault: false });
  });

  it('builds story links when a story exists and a trail link for the generic rover', () => {
    expect(buildLabStoryUrl(LAB_MODELS[0])).toBe('/storylines/moon/apollo-11-eagle');
    expect(buildLabStoryUrl(LAB_MODELS[1])).toBeNull();
    expect(buildLabWorldUrl(LAB_MODELS[1])).toBe('/storylines?world=mars&trail=1');
    expect(buildLabStoryUrl(LAB_MODELS[2])).toBe('/storylines/mars/ingenuity');
    expect(buildLabStoryUrl(LAB_MODELS[3])).toBe('/storylines/mars/ingenuity');
    expect(buildLabStoryUrl(LAB_MODELS[4])).toBe('/storylines/outer/voyager-1');
  });
});
