import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCountdown, formatKm, formatLightTime, NASA_VOYAGER_STATUS_URL, voyager1Snapshot } from './voyager-distance';

/** Live Voyager 1 distance, anchored to NASA's published one-light-day milestone. */
@Component({
  selector: 'app-voyager-tracker',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './voyager-tracker.css',
  template: `
    @if (compact()) {
      <a class="tracker-chip" routerLink="/about" fragment="nasa-data" aria-label="Live Voyager 1 distance from NASA data. Open the data and credits page.">
        <span class="live-dot" aria-hidden="true"></span>
        <span class="chip-label">LIVE &middot; NASA DATA</span>
        <span class="chip-text">Voyager 1 is <strong>{{ distance() }} km</strong> from Earth</span>
        <span class="chip-sub">{{ milestone() }}</span>
      </a>
    } @else {
      <section class="tracker-card" aria-labelledby="tracker-heading">
        <p class="tracker-eyebrow"><span class="live-dot" aria-hidden="true"></span> LIVE &middot; REAL DATA FROM NASA/JPL</p>
        <h2 id="tracker-heading">Voyager 1 is <strong>{{ distance() }} km</strong> from Earth</h2>
        <dl>
          <div><dt>A radio signal takes</dt><dd>{{ lightTime() }}</dd></div>
          <div><dt>One light-day from Earth</dt><dd>{{ milestone() }}</dd></div>
        </dl>
        <p class="tracker-note">
          A light-day is how far light travels in 24 hours. NASA says Voyager 1 gets there on November 18, 2026, the first thing people have built to go that far.
          We estimate the live number from NASA's published milestone and speed.
          <a [href]="statusUrl" target="_blank" rel="noopener noreferrer">See NASA's official tracker</a>
        </p>
      </section>
    }
  `,
})
export class VoyagerTracker {
  readonly compact = input(false);
  protected readonly statusUrl = NASA_VOYAGER_STATUS_URL;
  private readonly now = signal<number | null>(null);
  private readonly snapshot = computed(() => {
    const now = this.now();
    return now === null ? null : voyager1Snapshot(now);
  });
  protected readonly distance = computed(() => {
    const snapshot = this.snapshot();
    return snapshot ? formatKm(snapshot.distanceKm) : 'about 25.9 billion';
  });
  protected readonly lightTime = computed(() => {
    const snapshot = this.snapshot();
    return snapshot ? formatLightTime(snapshot.lightSeconds) : 'about a day';
  });
  protected readonly milestone = computed(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return 'November 18, 2026';
    return snapshot.msToLightDay > 0
      ? `One light-day in ${formatCountdown(snapshot.msToLightDay)}`
      : 'Passed one light-day on Nov. 18, 2026';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.now.set(Date.now());
      const timer = setInterval(() => this.now.set(Date.now()), 1000);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }
}
