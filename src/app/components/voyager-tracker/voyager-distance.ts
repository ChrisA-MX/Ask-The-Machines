/**
 * Voyager 1 distance estimate.
 *
 * The numbers are anchored to NASA's published milestone: Voyager 1 is one light-day
 * (25.902 billion km) from Earth on Nov. 18, 2026 at 2:16:07 a.m. PST.
 * Source: https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/
 *
 * From that anchor the spacecraft moves away from the Sun at NASA's published speed
 * (about 38,000 mph, 17 km/s) along its fixed departure direction, while Earth circles
 * the Sun. That is why the Earth distance can briefly shrink during part of each year.
 * This is an educational estimate, not navigation data.
 */
export const NASA_VOYAGER_STATUS_URL = 'https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/';
export const SPEED_OF_LIGHT_KM_S = 299_792.458;
export const LIGHT_DAY_KM = SPEED_OF_LIGHT_KM_S * 86_400;
/** Nov. 18, 2026, 2:16:07 a.m. PST, as published by NASA. */
export const ONE_LIGHT_DAY_UTC_MS = Date.UTC(2026, 10, 18, 10, 16, 7);

const AU_KM = 149_597_870.7;
const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const RAD = Math.PI / 180;
/** Voyager 1's departure direction in ecliptic coordinates (toward Ophiuchus). */
const VOYAGER_LON = 255.4 * RAD;
const VOYAGER_LAT = 35.0 * RAD;
/** NASA: 38,026.77 mph relative to the Sun. */
const VOYAGER_SPEED_AU_PER_DAY = (16.9995 * 86_400) / AU_KM;

export interface VoyagerSnapshot {
  distanceKm: number;
  lightSeconds: number;
  /** Positive before NASA's one-light-day milestone, negative after it. */
  msToLightDay: number;
}

/** Earth's distance from the Sun (AU) and heliocentric ecliptic longitude (radians). */
function earthPosition(timeMs: number): { radiusAu: number; lon: number } {
  const days = (timeMs - J2000_MS) / DAY_MS;
  const meanAnomaly = (357.528 + 0.9856003 * days) * RAD;
  const sunLon = (280.46 + 0.9856474 * days + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const radiusAu = 1.00014 - 0.01671 * Math.cos(meanAnomaly) - 0.00014 * Math.cos(2 * meanAnomaly);
  return { radiusAu, lon: sunLon + Math.PI };
}

function earthDistanceAu(sunDistanceAu: number, timeMs: number): number {
  const earth = earthPosition(timeMs);
  const alignment = Math.cos(VOYAGER_LAT) * Math.cos(VOYAGER_LON - earth.lon);
  return Math.sqrt(sunDistanceAu ** 2 + earth.radiusAu ** 2 - 2 * sunDistanceAu * earth.radiusAu * alignment);
}

/** Sun distance at the milestone, solved so the Earth distance equals exactly one light-day. */
const SUN_DISTANCE_AT_MILESTONE_AU = (() => {
  const earth = earthPosition(ONE_LIGHT_DAY_UTC_MS);
  const alignment = Math.cos(VOYAGER_LAT) * Math.cos(VOYAGER_LON - earth.lon);
  const lightDayAu = LIGHT_DAY_KM / AU_KM;
  return earth.radiusAu * alignment + Math.sqrt(lightDayAu ** 2 - earth.radiusAu ** 2 * (1 - alignment ** 2));
})();

export function voyager1Snapshot(nowMs: number): VoyagerSnapshot {
  const sunDistanceAu = SUN_DISTANCE_AT_MILESTONE_AU + VOYAGER_SPEED_AU_PER_DAY * ((nowMs - ONE_LIGHT_DAY_UTC_MS) / DAY_MS);
  const distanceKm = earthDistanceAu(sunDistanceAu, nowMs) * AU_KM;
  return { distanceKm, lightSeconds: distanceKm / SPEED_OF_LIGHT_KM_S, msToLightDay: ONE_LIGHT_DAY_UTC_MS - nowMs };
}

export function formatKm(distanceKm: number): string {
  return Math.round(distanceKm).toLocaleString('en-US');
}

export function formatLightTime(lightSeconds: number): string {
  const total = Math.floor(lightSeconds + 1e-6);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return days > 0
    ? `${days}d ${hours}h ${String(minutes).padStart(2, '0')}m`
    : `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}
