import { afterNextRender, Injectable, signal } from '@angular/core';

export const APOLLO_DEFAULT_NAME = 'Apollo';

const PROFILE_KEY = 'ask-the-machines-player-profile-v1';

@Injectable({ providedIn: 'root' })
export class PlayerProfileService {
  readonly avatarName = signal(APOLLO_DEFAULT_NAME);

  constructor() {
    afterNextRender(() => this.restore());
  }

  setAvatarName(name: string): void {
    const normalized = name.trim().slice(0, 40) || APOLLO_DEFAULT_NAME;
    this.avatarName.set(normalized);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ avatarName: normalized }));
    } catch {
      // The selected name remains available for the current page session.
    }
  }

  private restore(): void {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
      if (
        stored &&
        typeof stored === 'object' &&
        'avatarName' in stored &&
        typeof stored.avatarName === 'string' &&
        stored.avatarName.trim()
      ) {
        this.avatarName.set(stored.avatarName.trim().slice(0, 40));
      }
    } catch {
      this.avatarName.set(APOLLO_DEFAULT_NAME);
    }
  }
}
