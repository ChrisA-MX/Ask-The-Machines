import { afterNextRender, Injectable, signal } from '@angular/core';
import { CHAT_MACHINE_IDS, CHAT_MACHINE_STORY_IDS } from '../../shared/machine-facts';

export const PROGRESS_STORAGE_KEY = 'ask-the-machines-world-progress-v1';

@Injectable({ providedIn: 'root' })
export class ProgressService {
  readonly completedMachineIds = signal<string[]>([]);

  constructor() {
    afterNextRender(() => this.restore());
  }

  setCompletedStoryIds(storyIds: Iterable<string>): void {
    const mapped = new Set<string>();
    for (const storyId of storyIds) {
      const machineId = CHAT_MACHINE_IDS.find((id) => CHAT_MACHINE_STORY_IDS[id] === storyId);
      if (machineId) mapped.add(machineId);
    }
    this.completedMachineIds.set([...mapped]);
  }

  private restore(): void {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? '[]');
      if (Array.isArray(stored)) {
        this.setCompletedStoryIds(stored.filter((id): id is string => typeof id === 'string'));
      }
    } catch {
      this.completedMachineIds.set([]);
    }
  }
}
