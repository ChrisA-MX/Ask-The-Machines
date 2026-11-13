import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly activeLoads = signal(0);
  private readonly startupLoading = signal(true);
  private startupFinished = false;
  readonly isLoading = computed(() => this.startupLoading() || this.activeLoads() > 0);

  finishStartup(): void {
    if (this.startupFinished) return;
    this.startupFinished = true;
    this.startupLoading.set(false);
  }

  begin(): () => void {
    this.activeLoads.update((count) => count + 1);
    let finished = false;

    return () => {
      if (finished) return;
      finished = true;
      this.activeLoads.update((count) => Math.max(0, count - 1));
    };
  }
}
