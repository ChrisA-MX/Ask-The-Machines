import { afterNextRender, Injectable, signal } from '@angular/core';

export const APOLLO_DEFAULT_NAME = 'Explorer';
export const AGE_RANGES = [
  { value: 'under-13', label: 'Under 13' },
  { value: '13-17', label: '13–17' },
  { value: '18-24', label: '18–24' },
  { value: '25-34', label: '25–34' },
  { value: '35-44', label: '35–44' },
  { value: '45-54', label: '45–54' },
  { value: '55-plus', label: '55+' },
] as const;

export type AgeRange = typeof AGE_RANGES[number]['value'];

export interface PlayerProfile {
  name: string;
  ageRange: AgeRange;
}

const PROFILE_KEY = 'ask-the-machines-player-profile-v1';
const PROFILE_DISMISSED_KEY = 'ask-the-machines-player-profile-dismissed-v1';

@Injectable({ providedIn: 'root' })
export class PlayerProfileService {
  readonly avatarName = signal(APOLLO_DEFAULT_NAME);
  readonly ageRange = signal<AgeRange | null>(null);
  readonly hasProfile = signal(false);
  readonly onboardingDismissed = signal(false);

  constructor() {
    afterNextRender(() => this.restore());
  }

  saveProfile(name: string, ageRange: AgeRange): boolean {
    const normalized = name.trim().slice(0, 40);
    if (!normalized || !AGE_RANGES.some((range) => range.value === ageRange)) return false;
    this.avatarName.set(normalized);
    this.ageRange.set(ageRange);
    this.hasProfile.set(true);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: normalized, ageRange }));
      localStorage.removeItem(PROFILE_DISMISSED_KEY);
    } catch {
      // The profile remains available for the current page session.
    }
    return true;
  }

  dismissOnboarding(): void {
    this.onboardingDismissed.set(true);
    try { localStorage.setItem(PROFILE_DISMISSED_KEY, 'true'); } catch { /* Storage may be unavailable. */ }
  }

  private restore(): void {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        const record = stored as Record<string, unknown>;
        const storedName = typeof record['name'] === 'string'
          ? record['name']
          : typeof record['avatarName'] === 'string' ? record['avatarName'] : '';
        const name = storedName.trim().slice(0, 40);
        const ageRange = record['ageRange'];
        if (name) this.avatarName.set(name);
        if (name && typeof ageRange === 'string' && AGE_RANGES.some((range) => range.value === ageRange)) {
          this.ageRange.set(ageRange as AgeRange);
          this.hasProfile.set(true);
        }
      }
      this.onboardingDismissed.set(localStorage.getItem(PROFILE_DISMISSED_KEY) === 'true');
    } catch {
      this.onboardingDismissed.set(false);
    }
  }
}
