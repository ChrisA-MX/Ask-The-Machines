import { MACHINES, WORLDS } from './machines.data';
import { isMachineUnlocked, isWorldUnlocked, pointsAlongPath } from './storyline';

describe('Storyline world data and progression', () => {
  it('contains 4 Moon, 7 Mars, and 4 Outer Solar System machines (15 total)', () => {
    expect(WORLDS.map((world) => [world.id, world.machines.length])).toEqual([
      ['moon', 4], ['mars', 7], ['outer', 4],
    ]);
    expect(MACHINES).toHaveLength(15);
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

      const points = pointsAlongPath(path, world.machines.length);
      expect(points).toHaveLength(world.machines.length);
      expect(calls).toEqual(world.machines.map((_, index) => pathLength * (index + 1) / (world.machines.length + 1)));
      points.forEach((point, index) => expect(point).toEqual({ x: calls[index], y: calls[index] / 2 }));
    }
  });
});
