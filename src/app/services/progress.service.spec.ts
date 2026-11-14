import { TestBed } from '@angular/core/testing';
import { ProgressService, PROGRESS_STORAGE_KEY } from './progress.service';

describe('ProgressService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [ProgressService] });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('persists mini-game completion separately from story completion', () => {
    const service = TestBed.inject(ProgressService);
    service.setCompletedMiniGameIds(['moon']);
    const saved = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? '{}');
    expect(saved.version).toBe(2);
    expect(saved.completedStories).toEqual([]);
    expect(saved.completedMiniGames).toEqual(['moon']);
  });
});
