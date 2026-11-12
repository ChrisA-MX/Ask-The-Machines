import { A11yModule } from '@angular/cdk/a11y';
import { isPlatformBrowser } from '@angular/common';
import { afterNextRender, Component, DestroyRef, inject, input, output, PLATFORM_ID, signal } from '@angular/core';
import { MachineStory } from '../machines.data';

@Component({ selector: 'app-story-modal', standalone: true, imports: [A11yModule], templateUrl: './story-modal.html', styleUrl: './story-modal.scss' })
export class StoryModal {
  readonly machine = input.required<MachineStory>();
  readonly completed = input(false);
  readonly closed = output<void>();
  readonly finished = output<void>();
  protected readonly mode = signal<'read' | 'listen' | 'finished'>('read');
  protected readonly playing = signal(false);
  protected readonly supported = signal(false);
  protected readonly rate = signal(1);
  protected readonly paragraphIndex = signal(-1);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private synthesis?: SpeechSynthesis;
  private hiddenListener?: () => void;
  private resumeAfterVisibility = false;

  constructor() {
    if (isPlatformBrowser(this.platformId)) afterNextRender(() => this.initializeSpeech());
    this.destroyRef.onDestroy(() => { this.stopSpeech(); if (this.hiddenListener) document.removeEventListener('visibilitychange', this.hiddenListener); });
  }

  protected selectRead(): void { this.stopSpeech(); this.mode.set('read'); }
  protected selectListen(): void { this.mode.set('listen'); }
  protected selectFinished(): void {
    this.stopSpeech();
    this.mode.set('finished');
    if (!this.completed()) this.finished.emit();
  }
  protected setRate(value: string): void { this.rate.set(Number(value)); }
  protected togglePlayback(): void {
    if (!this.supported()) return;
    if (this.playing()) { this.synthesis?.pause(); this.playing.set(false); return; }
    if (this.synthesis?.paused) { this.synthesis.resume(); this.playing.set(true); return; }
    this.speakParagraph(0);
  }
  protected stopPlayback(): void { this.stopSpeech(); }
  protected close(): void { this.stopSpeech(); this.closed.emit(); }

  private initializeSpeech(): void {
    if (!isPlatformBrowser(this.platformId) || !('speechSynthesis' in window)) return;
    this.synthesis = window.speechSynthesis;
    this.supported.set(true);
    this.hiddenListener = () => {
      if (document.hidden && this.playing()) { this.resumeAfterVisibility = true; this.synthesis?.pause(); }
      else if (!document.hidden && this.resumeAfterVisibility) { this.resumeAfterVisibility = false; this.synthesis?.resume(); }
    };
    document.addEventListener('visibilitychange', this.hiddenListener);
  }

  private speakParagraph(index: number): void {
    const paragraphs = this.machine().paragraphs;
    if (!this.synthesis || index >= paragraphs.length) { this.playing.set(false); this.paragraphIndex.set(-1); return; }
    this.synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(paragraphs[index]);
    utterance.lang = 'en-US'; utterance.rate = this.rate();
    utterance.onstart = () => { this.paragraphIndex.set(index); this.playing.set(true); };
    utterance.onend = () => { if (this.playing()) this.speakParagraph(index + 1); };
    utterance.onerror = () => this.playing.set(false);
    this.synthesis.speak(utterance);
  }

  private stopSpeech(): void {
    this.synthesis?.cancel(); this.playing.set(false); this.paragraphIndex.set(-1); this.resumeAfterVisibility = false;
  }
}
