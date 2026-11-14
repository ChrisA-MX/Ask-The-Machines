import { Component, DestroyRef, EventEmitter, inject, Output, signal } from '@angular/core';
import { MACHINES } from '../machines.data';

@Component({
  selector: 'app-opportunity-game',
  standalone: true,
  templateUrl: './opportunity-game.html',
  styleUrl: './opportunity-game.scss',
})
export class OpportunityGame {
  @Output() readonly completed = new EventEmitter<void>();
  protected readonly battery = signal(72);
  protected readonly remainingSeconds = signal(60);
  protected readonly panelAngle = signal(25);
  protected readonly sunAngle = signal(205);
  protected readonly stormActive = signal(false);
  protected readonly state = signal<'ready' | 'running' | 'retry' | 'won'>('ready');
  protected readonly announcement = signal('');
  protected readonly facts = MACHINES.filter((machine) => machine.id === 'opportunity-mer-b' || machine.id === 'insight').map((machine) => machine.fact);
  private readonly destroyRef = inject(DestroyRef);
  private interval?: number;
  private reducedMotion = false;

  constructor() { this.destroyRef.onDestroy(() => this.stopTimer()); }

  protected start(): void {
    this.stopTimer();
    this.battery.set(72);
    this.remainingSeconds.set(60);
    this.sunAngle.set(205);
    this.stormActive.set(false);
    this.announcement.set('Solar challenge started. Track the moving Sun with the panel.');
    this.reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.state.set('running');
    this.interval = window.setInterval(() => this.tick(), 100);
  }

  protected setPanelAngle(event: Event): void {
    this.panelAngle.set(Number((event.target as HTMLInputElement).value));
  }

  protected secondsLeft(): number { return Math.ceil(this.remainingSeconds()); }

  private tick(): void {
    if (this.state() !== 'running') return;
    if (!this.reducedMotion) this.sunAngle.set((this.sunAngle() + 0.65) % 360);
    const remaining = Math.max(0, this.remainingSeconds() - 0.1);
    this.remainingSeconds.set(remaining);
    const storm = remaining <= 30;
    this.stormActive.set(storm);
    const angleDifference = Math.abs(((this.panelAngle() - this.sunAngle() + 540) % 360) - 180);
    const aligned = angleDifference <= (storm ? 22 : 30);
    const nextBattery = Math.max(0, Math.min(100, this.battery() + (aligned ? (storm ? 0.55 : 1.35) : -0.85) * 0.1));
    this.battery.set(nextBattery);

    if (nextBattery <= 0) {
      this.state.set('retry');
      this.announcement.set('The battery ran down. Adjust the panel and try the day again.');
      this.stopTimer();
    } else if (remaining <= 0) {
      this.state.set('won');
      this.announcement.set('Success! You kept Opportunity powered through the day and dust storm.');
      this.completed.emit();
      this.stopTimer();
    }
  }

  protected replay(): void { this.start(); }

  private stopTimer(): void {
    if (this.interval !== undefined) window.clearInterval(this.interval);
    this.interval = undefined;
  }
}
