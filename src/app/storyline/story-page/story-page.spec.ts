import { MACHINES, WORLDS } from '../machines.data';
import { findStoryRoute, isStoryUnlocked, resolveStoryRoute } from './story-page';

describe('Story page routes and progression', () => {
  it('resolves all twelve typed world and story route ids', () => {
    for (const world of WORLDS) {
      for (const machine of world.machines) {
        expect(findStoryRoute(world.id, machine.routeId ?? machine.id)?.machine.id).toBe(machine.id);
      }
    }
    expect(MACHINES).toHaveLength(12);
  });

  it('shows a not-found result for unknown worlds or machine ids', () => {
    expect(resolveStoryRoute('pluto', 'unknown-story', new Set()).kind).toBe('not-found');
    expect(resolveStoryRoute('moon', 'unknown-story', new Set()).kind).toBe('not-found');
  });

  it('blocks a story until all earlier stories in its world are finished', () => {
    const world = WORLDS[0];
    const thirdStory = world.machines[2];
    const prior = new Set([world.machines[0].id]);
    expect(resolveStoryRoute(world.id, thirdStory.routeId ?? thirdStory.id, prior).kind).toBe('locked');
    prior.add(world.machines[1].id);
    expect(resolveStoryRoute(world.id, thirdStory.routeId ?? thirdStory.id, prior).kind).toBe('story');
  });

  it('unlocks the next story after the current story is marked finished', () => {
    const world = WORLDS[1];
    const current = world.machines[0];
    const next = world.machines[1];
    const completed = new Set<string>();
    expect(isStoryUnlocked(world, 1, completed)).toBe(false);
    completed.add(current.id);
    expect(isStoryUnlocked(world, 1, completed)).toBe(true);
    expect(resolveStoryRoute(world.id, next.routeId ?? next.id, completed).kind).toBe('story');
  });

  it('provides an 11-character YouTube id for each machine video', () => {
    for (const machine of MACHINES) {
      expect(machine.video?.youtubeId).toMatch(/^[\w-]{11}$/);
    }
  });
});
