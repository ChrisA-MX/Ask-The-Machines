import { advanceSpriteFrame, SpriteRowConfig } from './animated-sprite';

describe('advanceSpriteFrame', () => {
  const loopRow: SpriteRowConfig = {
    name: 'idle',
    frames: 3,
    fps: 5,
    loop: true,
  };

  it('wraps a looping row to its first frame', () => {
    expect(advanceSpriteFrame(2, 1, loopRow)).toEqual({
      frame: 0,
      direction: 1,
      finished: false,
    });
  });

  it('plays a pingpong row forward and then backward', () => {
    const row = { ...loopRow, frames: 4, playback: 'pingpong' as const };
    const backward = advanceSpriteFrame(3, 1, row);
    expect(backward).toEqual({ frame: 2, direction: -1, finished: false });
    expect(advanceSpriteFrame(1, -1, row)).toEqual({
      frame: 0,
      direction: -1,
      finished: false,
    });
    expect(advanceSpriteFrame(0, -1, row)).toEqual({
      frame: 1,
      direction: 1,
      finished: false,
    });
  });

  it('holds the last frame and reports completion for a one-shot row', () => {
    const row: SpriteRowConfig = {
      name: 'thumbsUp',
      frames: 3,
      fps: 10,
      loop: false,
      holdLast: true,
    };
    expect(advanceSpriteFrame(2, 1, row)).toEqual({
      frame: 2,
      direction: 1,
      finished: true,
    });
  });
});
