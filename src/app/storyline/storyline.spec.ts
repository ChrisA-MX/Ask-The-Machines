import { MACHINES, WORLDS } from './machines.data';
import { migrateStoredProgress } from '../services/progress.service';
import { isMachineUnlocked, isMiniGameUnlocked, isWorldUnlocked, pointsAlongPath } from './storyline';
import { placePreviewCard, PreviewRect } from './preview-placement';

const nodeRect = (left: number, top: number, width = 44, height = 44): PreviewRect => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

describe('Storyline world data and progression', () => {
  it('contains four story machines per world (12 total)', () => {
    expect(WORLDS.map((world) => [world.id, world.machines.length])).toEqual([
      ['moon', 4], ['mars', 4], ['outer', 4],
    ]);
    expect(MACHINES).toHaveLength(12);
    expect(WORLDS.map((world) => world.miniGame.title).length).toBe(3);
    expect(new Set(MACHINES.map((machine) => machine.id)).size).toBe(12);
  });

  it('unlocks Mars after all Moon machines and Outer after all Mars machines', () => {
    const completed = new Set<string>();
    expect(isWorldUnlocked(WORLDS, completed, 1)).toBe(false);
    WORLDS[0].machines.forEach((machine) => completed.add(machine.id));
    expect(isWorldUnlocked(WORLDS, completed, 1)).toBe(true);
    expect(isWorldUnlocked(WORLDS, completed, 2)).toBe(false);
    WORLDS[1].machines.forEach((machine) => completed.add(machine.id));
    expect(isWorldUnlocked(WORLDS, completed, 2)).toBe(true);
  });

  it('unlocks machines in order inside a world', () => {
    const completed = new Set<string>(WORLDS[0].machines.slice(0, 2).map((machine) => machine.id));
    expect(isMachineUnlocked(WORLDS, completed, 0, 0)).toBe(true);
    expect(isMachineUnlocked(WORLDS, completed, 0, 2)).toBe(true);
    expect(isMachineUnlocked(WORLDS, completed, 0, 3)).toBe(false);
    expect(isMachineUnlocked(WORLDS, completed, 1, 0)).toBe(false);
  });

  it('unlocks the mini-game only after all four stories in its world', () => {
    const completed = new Set(WORLDS[0].machines.slice(0, 3).map((machine) => machine.id));
    expect(isMiniGameUnlocked(WORLDS, completed, 0)).toBe(false);
    completed.add(WORLDS[0].machines[3].id);
    expect(isMiniGameUnlocked(WORLDS, completed, 0)).toBe(true);
  });

  it('migrates old progress and discards machine ids removed from the new stories', () => {
    expect(migrateStoredProgress(['surveyor-3', 'spirit-mer-a', 'cassini', 'sojourner'])).toEqual({
      version: 2,
      completedStories: ['surveyor-3', 'sojourner'],
      completedMiniGames: [],
    });
  });

  it('retains valid mini-game badges and removes invalid persisted ids', () => {
    expect(migrateStoredProgress({ version: 1, completedStories: ['insight', 'curiosity'], completedMiniGames: ['mars', 'cassini'] })).toEqual({
      version: 2,
      completedStories: ['insight'],
      completedMiniGames: ['mars'],
    });
  });

  it('uses getPointAtLength for every evenly spaced stop in each world', () => {
    for (const world of WORLDS) {
      const calls: number[] = [];
      const pathLength = 1000;
      const path = {
        getTotalLength: () => pathLength,
        getPointAtLength: (distance: number) => {
          calls.push(distance);
          return { x: distance, y: distance / 2 };
        },
      } as SVGPathElement;

      const stopCount = world.machines.length + 1;
      const points = pointsAlongPath(path, stopCount);
      expect(points).toHaveLength(stopCount);
      expect(calls).toEqual(Array.from({ length: stopCount }, (_, index) => pathLength * (index + 1) / (stopCount + 1)));
      points.forEach((point, index) => expect(point).toEqual({ x: calls[index], y: calls[index] / 2 }));
    }
  });

  it('places preview cards above lower nodes and below upper nodes', () => {
    const viewport = { width: 375, height: 812 };
    const card = { width: 320, height: 180 };
    expect(placePreviewCard(nodeRect(150, 700), card, viewport).side).toBe('above');
    expect(placePreviewCard(nodeRect(150, 80), card, viewport).side).toBe('below');
  });

  it('clamps an edge node card inside the viewport and shifts it around the chat launcher', () => {
    const viewport = { width: 375, height: 812 };
    const node = nodeRect(331, 360);
    const card = { width: 320, height: 180 };
    const chat = nodeRect(14, 168, 80, 80);
    const placement = placePreviewCard(node, card, viewport, chat);
    expect(placement.left).toBeGreaterThanOrEqual(14);
    expect(placement.left + card.width).toBeLessThanOrEqual(viewport.width - 14);
    expect(placement.top).toBeGreaterThanOrEqual(14);
    expect(placement.top + card.height).toBeLessThanOrEqual(viewport.height - 14);
    expect(placement.arrowOffset).toBeGreaterThan(0);
    expect(placement.arrowOffset).toBeLessThan(card.width);
    expect(placement.side).toBe('below');
    expect(placement.top).toBeGreaterThanOrEqual(chat.bottom);
  });
});
