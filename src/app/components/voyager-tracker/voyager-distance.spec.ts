import { formatCountdown, formatKm, formatLightTime, LIGHT_DAY_KM, ONE_LIGHT_DAY_UTC_MS, voyager1Snapshot } from './voyager-distance';

describe('Voyager 1 distance estimate', () => {
  it('matches NASA\'s one-light-day milestone', () => {
    const snapshot = voyager1Snapshot(ONE_LIGHT_DAY_UTC_MS);
    expect(Math.abs(snapshot.distanceKm - LIGHT_DAY_KM)).toBeLessThan(1);
    expect(formatLightTime(snapshot.lightSeconds)).toBe('24h 00m 00s');
    expect(snapshot.msToLightDay).toBe(0);
  });

  it('stays close to NASA figures published before the milestone', () => {
    // NASA listed Voyager 1 at roughly 162.7 AU from Earth in early February 2024.
    const au = voyager1Snapshot(Date.UTC(2024, 1, 1)).distanceKm / 149_597_870.7;
    expect(au).toBeGreaterThan(162);
    expect(au).toBeLessThan(163.5);
  });

  it('keeps moving away just before the milestone', () => {
    const earlier = voyager1Snapshot(ONE_LIGHT_DAY_UTC_MS - 3_600_000);
    expect(earlier.distanceKm).toBeLessThan(LIGHT_DAY_KM);
    expect(earlier.msToLightDay).toBe(3_600_000);
  });

  it('formats numbers for young readers', () => {
    expect(formatKm(25_902_068_371.2)).toBe('25,902,068,371');
    expect(formatLightTime(86_399)).toBe('23h 59m 59s');
    expect(formatCountdown(2 * 86_400_000 + 3_660_000)).toBe('2d 1h 01m');
    expect(formatCountdown(-5)).toBe('0h 00m 00s');
  });
});
