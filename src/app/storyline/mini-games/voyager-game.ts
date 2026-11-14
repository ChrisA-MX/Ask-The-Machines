import { Component, DestroyRef, EventEmitter, inject, Output, signal } from '@angular/core';

@Component({
  selector: 'app-voyager-game',
  standalone: true,
  templateUrl: './voyager-game.html',
  styleUrl: './voyager-game.scss',
})
export class VoyagerGame {
  @Output() readonly completed = new EventEmitter<void>();
  protected readonly dialAngle = signal(0);
  protected readonly remainingSeconds = signal(60);
  protected readonly state = signal<'ready' | 'running' | 'retry' | 'won'>('ready');
  protected readonly announcement = signal('');
  private readonly destroyRef = inject(DestroyRef);
  private targetAngle = 237;
  private interval?: number;

  constructor() { this.destroyRef.onDestroy(() => this.stopTimer()); }

  protected start(): void {
    this.stopTimer();
    this.targetAngle = Math.floor(Math.random() * 360);
    this.dialAngle.set(0);
    this.remainingSeconds.set(60);
    this.state.set('running');
    this.announcement.set('Static detected. Turn the dial to search for Voyager’s signal.');
    this.interval = window.setInterval(() => this.tick(), 100);
  }

  protected setDial(event: Event): void { this.dialAngle.set(Number((event.target as HTMLInputElement).value)); }
  protected strength(): number {
    const difference = Math.abs(((this.dialAngle() - this.targetAngle + 540) % 360) - 180);
    return Math.max(0, Math.round(100 - difference * 1.55));
  }
  protected secondsLeft(): number { return Math.ceil(this.remainingSeconds()); }
  protected canLock(): boolean { return this.state() === 'running' && this.strength() >= 94; }

  protected lockOn(): void {
    if (!this.canLock()) return;
    this.state.set('won');
    this.announcement.set('Signal locked! Voyager 1 is still sending a signal from interstellar space.');
    this.completed.emit();
    this.stopTimer();
  }

  protected replay(): void { this.start(); }

  private tick(): void {
    if (this.state() !== 'running') return;
    const remaining = Math.max(0, this.remainingSeconds() - 0.1);
    this.remainingSeconds.set(remaining);
    if (remaining <= 0) {
      this.state.set('retry');
      this.announcement.set('The faint signal slipped back into static. Reset the dial and search again.');
      this.stopTimer();
    }
  }

  private stopTimer(): void {
    if (this.interval !== undefined) window.clearInterval(this.interval);
    this.interval = undefined;
  }
}
