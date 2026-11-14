import { afterNextRender, Injectable, signal } from '@angular/core';
import { CHAT_MACHINE_IDS, CHAT_MACHINE_STORY_IDS } from '../../shared/machine-facts';
import { VALID_MINI_GAME_IDS, VALID_STORY_IDS, WorldId } from '../storyline/machines.data';

export const PROGRESS_STORAGE_KEY = 'ask-the-machines-world-progress-v2';
export const LEGACY_PROGRESS_STORAGE_KEY = 'ask-the-machines-world-progress-v1';
export const PROGRESS_STORAGE_VERSION = 2;

export interface StoredProgressSnapshot {
  version: typeof PROGRESS_STORAGE_VERSION;
  completedStories: string[];
  completedMiniGames: WorldId[];
}

/** Filters stale ids from both the old array format and the current versioned format. */
export function migrateStoredProgress(value: unknown): StoredProgressSnapshot {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
  const storyIds = Array.isArray(value)
    ? value
    : record?.['completedStories'];
  const gameIds = record?.['completedMiniGames'];
  return {
    version: PROGRESS_STORAGE_VERSION,
    completedStories: [...new Set((Array.isArray(storyIds) ? storyIds : []).filter(
      (id): id is string => typeof id === 'string' && VALID_STORY_IDS.has(id),
    ))],
    completedMiniGames: [...new Set((Array.isArray(gameIds) ? gameIds : []).filter(
      (id): id is WorldId => typeof id === 'string' && VALID_MINI_GAME_IDS.has(id),
    ))],
  };
}

const storyToChatId = new Map(Object.entries(CHAT_MACHINE_STORY_IDS).map(([chatId, storyId]) => [storyId, chatId]));

@Injectable({ providedIn: 'root' })
export class ProgressService {
  /** Chat API ids, kept separate from the story ids used by the trail and storage. */
  readonly completedMachineIds = signal<string[]>([]);
  readonly completedStoryIds = signal<string[]>([]);
  readonly completedMiniGameIds = signal<WorldId[]>([]);
  private restored = false;

  constructor() {
    afterNextRender(() => this.restore());
  }

  /** Safe to call from the browser page too, so its initial state sees restored progress. */
  restore(): void {
    if (this.restored || typeof localStorage === 'undefined') return;
    this.restored = true;
    let current: unknown = null;
    let legacy: unknown = null;
    try {
      current = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? 'null');
      if (current === null) legacy = JSON.parse(localStorage.getItem(LEGACY_PROGRESS_STORAGE_KEY) ?? 'null');
    } catch {
      // Malformed storage is treated as empty; no persisted state can crash the app.
    }
    const snapshot = migrateStoredProgress(current ?? legacy);
    this.apply(snapshot);
    // Persist the normalized snapshot so removed IDs disappear from storage too.
    this.persist();
    try { localStorage.removeItem(LEGACY_PROGRESS_STORAGE_KEY); } catch { /* Storage may be read-only. */ }
  }

  setCompletedStoryIds(storyIds: Iterable<string>): void {
    const valid = [...new Set([...storyIds].filter((id) => VALID_STORY_IDS.has(id)))];
    this.completedStoryIds.set(valid);
    this.completedMachineIds.set(valid.map((id) => storyToChatId.get(id)).filter((id): id is string => !!id));
    this.persist();
  }

  setCompletedMiniGameIds(gameIds: Iterable<string>): void {
    this.completedMiniGameIds.set([...new Set([...gameIds].filter(
      (id): id is WorldId => VALID_MINI_GAME_IDS.has(id),
    ))]);
    this.persist();
  }

  completeMiniGame(worldId: WorldId): void {
    this.setCompletedMiniGameIds([...this.completedMiniGameIds(), worldId]);
  }

  reset(): void {
    this.completedStoryIds.set([]);
    this.completedMachineIds.set([]);
    this.completedMiniGameIds.set([]);
    try {
      localStorage.removeItem(PROGRESS_STORAGE_KEY);
      localStorage.removeItem(LEGACY_PROGRESS_STORAGE_KEY);
    } catch { /* Storage may be unavailable in private browsing. */ }
  }

  private apply(snapshot: StoredProgressSnapshot): void {
    this.completedStoryIds.set(snapshot.completedStories);
    this.completedMachineIds.set(snapshot.completedStories.map((id) => storyToChatId.get(id)).filter((id): id is string => !!id));
    this.completedMiniGameIds.set(snapshot.completedMiniGames);
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    const snapshot: StoredProgressSnapshot = {
      version: PROGRESS_STORAGE_VERSION,
      completedStories: this.completedStoryIds(),
      completedMiniGames: this.completedMiniGameIds(),
    };
    try { localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* Keep in-memory progress if storage is unavailable. */ }
  }
}
