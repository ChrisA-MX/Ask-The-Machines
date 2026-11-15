import { TestBed } from '@angular/core/testing';
import { SOUND_STORAGE_KEY, SoundService } from './sound.service';

describe('SoundService', () => {
  beforeEach(() => localStorage.removeItem(SOUND_STORAGE_KEY));

  it('stays silent and does not throw where Web Audio is unavailable', () => {
    const service = TestBed.inject(SoundService);
    service.init();
    expect(() => service.play('tap')).not.toThrow();
    expect(service.started()).toBe(false);
  });

  it('remembers the mute choice on this device', () => {
    const service = TestBed.inject(SoundService);
    service.setMuted(true);
    expect(service.muted()).toBe(true);
    expect(JSON.parse(localStorage.getItem(SOUND_STORAGE_KEY) ?? '{}')).toEqual({ muted: true });
    service.toggleMuted();
    expect(service.muted()).toBe(false);
  });
});
