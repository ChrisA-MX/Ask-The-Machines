import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { ProgressService } from './progress.service';

export const SOUND_STORAGE_KEY = 'ask-the-machines-sound-v1';

export type SoundEffect = 'tap' | 'confirm' | 'whoosh' | 'chime' | 'fanfare' | 'message' | 'reply' | 'error';

/** Ambient chords, low to high: Dm9, Bbmaj9, Fmaj9, Cadd9. Slow and calm, with no melody to get tired of. */
const CHORDS: readonly (readonly number[])[] = [
  [73.42, 110, 146.83, 174.61, 220, 329.63],
  [58.27, 87.31, 116.54, 146.83, 174.61, 261.63],
  [87.31, 130.81, 174.61, 220, 261.63, 392],
  [65.41, 98, 130.81, 164.81, 196, 293.66],
];
/** D minor pentatonic, used for the occasional distant "star" ping. */
const SPARKLES = [587.33, 698.46, 783.99, 880, 1046.5, 1174.66];
const CHORD_SECONDS = 14;
const MUSIC_LEVEL = 0.36;
const DUCKED_LEVEL = 0.06;

/**
 * Every sound in the app, generated in the browser with the Web Audio API. There are no audio files.
 *
 * Browsers only allow sound after the visitor interacts with the page, so the audio engine starts on the
 * first click, tap or key press. The quiet theme fades in then, and fades down while a story is being read
 * aloud or a video is playing. The mute choice is remembered on this device.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router, { optional: true });
  private readonly progress = inject(ProgressService);

  readonly muted = signal(false);
  /** True once the visitor has interacted and the audio engine is running. */
  readonly started = signal(false);
  readonly supported = signal(false);

  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private effectsBus?: GainNode;
  private echo?: DelayNode;
  private noise?: AudioBuffer;
  private chordTimer?: ReturnType<typeof setTimeout>;
  private sparkleTimer?: ReturnType<typeof setTimeout>;
  private duckTimer?: ReturnType<typeof setInterval>;
  private chordIndex = 0;
  private musicPlaying = false;
  private initialized = false;
  private navigations = 0;
  private storyCount = -1;
  private gameCount = -1;

  constructor() {
    // A finished story or mini-game is the app's biggest reward, so it gets its own sound.
    effect(() => {
      const stories = this.progress.completedStoryIds().length;
      const games = this.progress.completedMiniGameIds().length;
      if (this.storyCount >= 0 && games === this.gameCount + 1) this.play('fanfare');
      else if (this.storyCount >= 0 && stories === this.storyCount + 1) this.play('chime');
      this.storyCount = stories;
      this.gameCount = games;
    });
  }

  /** Wires up the listeners. Safe to call more than once, and does nothing on the server. */
  init(): void {
    if (!this.isBrowser || this.initialized) return;
    this.initialized = true;
    const view = this.document.defaultView;
    if (!view || !this.engine()) return;
    this.supported.set(true);
    try { this.muted.set(JSON.parse(view.localStorage.getItem(SOUND_STORAGE_KEY) ?? '{}')?.muted === true); } catch { /* Default to sound on. */ }

    const firstGesture = () => {
      this.document.removeEventListener('pointerdown', firstGesture, true);
      this.document.removeEventListener('keydown', firstGesture, true);
      this.start();
    };
    this.document.addEventListener('pointerdown', firstGesture, true);
    this.document.addEventListener('keydown', firstGesture, true);
    this.document.addEventListener('click', (event) => this.onClick(event), true);
    this.document.addEventListener('visibilitychange', () => this.syncMusic());
    this.router?.events.subscribe((event) => {
      if (event instanceof NavigationEnd && this.navigations++ > 0) this.play('whoosh');
    });
  }

  toggleMuted(): void {
    this.setMuted(!this.muted());
  }

  setMuted(muted: boolean): void {
    this.muted.set(muted);
    try { this.document.defaultView?.localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify({ muted })); } catch { /* Keep the choice for this visit only. */ }
    if (!muted && !this.context) this.start();
    const context = this.context;
    if (context && this.master) {
      this.master.gain.cancelScheduledValues(context.currentTime);
      this.master.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.08);
    }
    this.syncMusic();
    if (!muted) this.play('confirm');
  }

  play(effectName: SoundEffect): void {
    const context = this.context;
    const out = this.effectsBus;
    if (!context || !out || this.muted() || context.state !== 'running') return;
    const now = context.currentTime;
    switch (effectName) {
      case 'tap': this.tone(out, 'sine', 620, now, 0.07, 0.09, 880); break;
      case 'confirm':
        this.tone(out, 'triangle', 523.25, now, 0.12, 0.1);
        this.tone(out, 'triangle', 783.99, now + 0.07, 0.18, 0.09);
        break;
      case 'message': this.tone(out, 'sine', 440, now, 0.09, 0.08, 660); break;
      case 'reply':
        this.tone(out, 'sine', 880, now, 0.14, 0.07, undefined, true);
        this.tone(out, 'sine', 1174.66, now + 0.11, 0.22, 0.06, undefined, true);
        break;
      case 'error':
        this.tone(out, 'triangle', 311.13, now, 0.16, 0.08);
        this.tone(out, 'triangle', 233.08, now + 0.13, 0.26, 0.08);
        break;
      case 'chime':
        [587.33, 880, 1174.66].forEach((frequency, index) =>
          this.tone(out, 'sine', frequency, now + index * 0.11, 0.7, 0.085, undefined, true));
        break;
      case 'fanfare':
        [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((frequency, index) =>
          this.tone(out, 'triangle', frequency, now + index * 0.1, index === 4 ? 1.1 : 0.4, 0.085, undefined, true));
        break;
      case 'whoosh': this.whoosh(out, now); break;
    }
  }

  private engine(): typeof AudioContext | undefined {
    const view = this.document.defaultView as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext } | null;
    return view?.AudioContext ?? view?.webkitAudioContext;
  }

  private start(): void {
    const Engine = this.engine();
    if (this.context || !Engine) return;
    try {
      const context = new Engine();
      // A gentle limiter keeps overlapping sounds from ever getting harsh on small speakers.
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.ratio.value = 6;
      limiter.connect(context.destination);
      const master = context.createGain();
      master.gain.value = this.muted() ? 0 : 1;
      master.connect(limiter);
      const musicBus = context.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      const effectsBus = context.createGain();
      effectsBus.gain.value = 0.9;
      effectsBus.connect(master);
      // A soft echo gives the bell-like sounds some "space" without a reverb file.
      const echo = context.createDelay(1);
      echo.delayTime.value = 0.42;
      const feedback = context.createGain();
      feedback.gain.value = 0.38;
      const echoTone = context.createBiquadFilter();
      echoTone.type = 'lowpass';
      echoTone.frequency.value = 2200;
      echo.connect(echoTone).connect(feedback).connect(echo);
      echoTone.connect(master);
      this.context = context;
      this.master = master;
      this.musicBus = musicBus;
      this.effectsBus = effectsBus;
      this.echo = echo;
      void context.resume();
      this.started.set(true);
      this.syncMusic();
    } catch {
      this.context = undefined;
    }
  }

  private onClick(event: Event): void {
    const target = event.target instanceof Element
      ? event.target.closest('a, button, summary, [role="tab"], [role="button"]')
      : null;
    if (!target || target.closest('app-sound-toggle') || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') return;
    this.play(target.matches('.journey-button, .primary-action, .primary, .save-button, .play-video') ? 'confirm' : 'tap');
  }

  /** Starts, stops or quietens the theme to match mute, tab visibility, read-aloud and video. */
  private syncMusic(): void {
    const context = this.context;
    if (!context || !this.musicBus) return;
    const shouldPlay = !this.muted() && this.document.visibilityState === 'visible';
    if (shouldPlay && !this.musicPlaying) {
      this.musicPlaying = true;
      void context.resume();
      this.fadeMusic(MUSIC_LEVEL, 2.5);
      this.nextChord();
      this.scheduleSparkle();
      this.duckTimer = setInterval(() => this.fadeMusic(this.somethingElseIsPlaying() ? DUCKED_LEVEL : MUSIC_LEVEL, 0.5), 700);
    } else if (!shouldPlay && this.musicPlaying) {
      this.musicPlaying = false;
      this.fadeMusic(0, 0.3);
      clearTimeout(this.chordTimer);
      clearTimeout(this.sparkleTimer);
      clearInterval(this.duckTimer);
    }
  }

  private somethingElseIsPlaying(): boolean {
    const view = this.document.defaultView;
    return !!view?.speechSynthesis?.speaking || !!this.document.querySelector('.video-frame iframe');
  }

  private fadeMusic(level: number, timeConstant: number): void {
    if (!this.context || !this.musicBus) return;
    this.musicBus.gain.setTargetAtTime(level, this.context.currentTime, timeConstant);
  }

  private nextChord(): void {
    const context = this.context;
    const bus = this.musicBus;
    if (!context || !bus || !this.musicPlaying) return;
    const now = context.currentTime;
    const warmth = context.createBiquadFilter();
    warmth.type = 'lowpass';
    warmth.frequency.setValueAtTime(500, now);
    warmth.frequency.linearRampToValueAtTime(1100, now + CHORD_SECONDS * 0.5);
    warmth.frequency.linearRampToValueAtTime(600, now + CHORD_SECONDS + 5);
    warmth.connect(bus);
    const notes = CHORDS[this.chordIndex++ % CHORDS.length];
    notes.forEach((frequency, index) => {
      // Two slightly detuned voices per note give a slow, shimmering "pad".
      for (const detune of [-5, 6]) {
        const voice = context.createOscillator();
        voice.type = index < 2 ? 'sine' : 'triangle';
        voice.frequency.value = frequency;
        voice.detune.value = detune;
        const level = context.createGain();
        const peak = index < 2 ? 0.05 : 0.026;
        level.gain.setValueAtTime(0, now);
        level.gain.linearRampToValueAtTime(peak, now + 5);
        level.gain.setValueAtTime(peak, now + CHORD_SECONDS - 1);
        level.gain.linearRampToValueAtTime(0, now + CHORD_SECONDS + 5);
        voice.connect(level).connect(warmth);
        voice.start(now);
        voice.stop(now + CHORD_SECONDS + 5.2);
      }
    });
    this.chordTimer = setTimeout(() => this.nextChord(), CHORD_SECONDS * 1000);
  }

  private scheduleSparkle(): void {
    this.sparkleTimer = setTimeout(() => {
      const context = this.context;
      if (!context || !this.musicBus || !this.musicPlaying) return;
      const frequency = SPARKLES[Math.floor(Math.random() * SPARKLES.length)];
      this.tone(this.musicBus, 'sine', frequency, context.currentTime, 2.4, 0.03, undefined, true);
      this.scheduleSparkle();
    }, 3500 + Math.random() * 5000);
  }

  /** One short note with a click-free attack and a smooth fade. */
  private tone(
    destination: AudioNode, type: OscillatorType, frequency: number, at: number,
    seconds: number, peak: number, glideTo?: number, withEcho = false,
  ): void {
    const context = this.context;
    if (!context) return;
    const voice = context.createOscillator();
    voice.type = type;
    voice.frequency.setValueAtTime(frequency, at);
    if (glideTo) voice.frequency.exponentialRampToValueAtTime(glideTo, at + seconds);
    const level = context.createGain();
    level.gain.setValueAtTime(0.0001, at);
    level.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    voice.connect(level).connect(destination);
    if (withEcho && this.echo) level.connect(this.echo);
    voice.start(at);
    voice.stop(at + seconds + 0.05);
  }

  /** Filtered noise that sweeps upward: the sound of moving to another page. */
  private whoosh(destination: AudioNode, at: number): void {
    const context = this.context;
    if (!context) return;
    if (!this.noise) {
      this.noise = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    }
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const sweep = context.createBiquadFilter();
    sweep.type = 'bandpass';
    sweep.Q.value = 1.2;
    sweep.frequency.setValueAtTime(300, at);
    sweep.frequency.exponentialRampToValueAtTime(2400, at + 0.4);
    const level = context.createGain();
    level.gain.setValueAtTime(0.0001, at);
    level.gain.exponentialRampToValueAtTime(0.09, at + 0.15);
    level.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    source.connect(sweep).connect(level).connect(destination);
    source.start(at);
    source.stop(at + 0.5);
  }
}
