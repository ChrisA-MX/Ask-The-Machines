import { afterNextRender, Component, DestroyRef, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';

export type ApolloAnimation = 'wave' | 'idle' | 'happy' | 'sad' | 'thumbsUp';
export type SpritePlayback = 'loop' | 'pingpong';

export interface SpriteRowConfig {
  name: ApolloAnimation;
  frames: number;
  fps: number;
  loop: boolean;
  playback?: SpritePlayback;
  holdLast?: boolean;
}

export interface SpriteSheetConfig {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: SpriteRowConfig[];
}

interface SpriteFrameStep {
  frame: number;
  direction: 1 | -1;
  finished: boolean;
}

const SPRITE_CONFIG_URL = 'assets/game/astronauts/apollo-sprites.json';

export function advanceSpriteFrame(
  current: number,
  direction: 1 | -1,
  row: SpriteRowConfig,
  oneShot = false,
): SpriteFrameStep {
  if (row.frames <= 1) return { frame: 0, direction: 1, finished: !row.loop || oneShot };
  const looping = row.loop && !oneShot;
  const playback = row.playback ?? 'loop';
  const next = current + direction;

  if (next >= row.frames) {
    if (!looping) {
      return {
        frame: row.holdLast ? row.frames - 1 : current,
        direction,
        finished: true,
      };
    }
    if (playback === 'pingpong') return { frame: row.frames - 2, direction: -1, finished: false };
    return { frame: 0, direction: 1, finished: false };
  }

  if (next < 0) return { frame: 1, direction: 1, finished: false };
  return { frame: next, direction, finished: false };
}

function isSpriteSheetConfig(value: unknown): value is SpriteSheetConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SpriteSheetConfig>;
  if (
    candidate.frameWidth !== 256 ||
    candidate.frameHeight !== 256 ||
    candidate.columns !== 9 ||
    !Array.isArray(candidate.rows)
  ) {
    return false;
  }
  const names = new Set<string>();
  return candidate.rows.every((row) => {
    if (
      !row ||
      !['wave', 'idle', 'happy', 'sad', 'thumbsUp'].includes(row.name) ||
      names.has(row.name) ||
      !Number.isInteger(row.frames) ||
      row.frames < 1 ||
      row.frames > candidate.columns! ||
      !Number.isFinite(row.fps) ||
      row.fps <= 0 ||
      typeof row.loop !== 'boolean' ||
      (row.playback !== undefined && !['loop', 'pingpong'].includes(row.playback))
    ) {
      return false;
    }
    names.add(row.name);
    return true;
  }) && ['wave', 'idle', 'happy', 'sad', 'thumbsUp'].every((name) => names.has(name));
}

@Component({
  selector: 'app-animated-sprite',
  template: `
    @if (config() && !configError()) {
      <span
        class="sprite-frame"
        role="img"
        [attr.aria-label]="altText"
        [style.width]="responsive ? '100%' : displaySize + 'px'"
        [style.height]="responsive ? '100%' : displaySize + 'px'"
        [style.background-image]="backgroundImage()"
        [style.background-size]="backgroundSize()"
        [style.background-position]="backgroundPosition()"
      ></span>
    } @else if (configError()) {
      <span class="sprite-fallback" role="img" [attr.aria-label]="altText">A</span>
    }
  `,
  styles: [`
    :host { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; }
    .sprite-frame { display: block; overflow: hidden; background-repeat: no-repeat; }
    .sprite-fallback {
      display: grid; width: 100%; height: 100%; place-items: center;
      border: 1px solid #67b6ff; border-radius: 50%; background: #102f63;
      color: #ffe14d; font: 700 1rem sans-serif;
    }
  `],
})
export class AnimatedSprite implements OnChanges {
  @Input() animation: ApolloAnimation = 'idle';
  @Input() altText = 'Apollo the astronaut';
  @Input() displaySize = 64;
  @Input() responsive = false;
  @Input() staticFrame = 0;
  @Input() oneShot = false;
  @Output() readonly animationFinished = new EventEmitter<void>();
  @Output() readonly animationCycle = new EventEmitter<void>();
  @Output() readonly assetsLoaded = new EventEmitter<void>();
  @Output() readonly assetsError = new EventEmitter<void>();

  protected readonly config = signal<SpriteSheetConfig | null>(null);
  protected readonly configError = signal(false);
  protected readonly sheetUrl = signal('');
  protected readonly frameIndex = signal(0);

  private readonly destroyRef = inject(DestroyRef);
  private animationFrame = 0;
  private lastFrameTime = 0;
  private direction: 1 | -1 = 1;
  private disposed = false;

  constructor() {
    afterNextRender(() => void this.loadSpriteSheet());
    this.destroyRef.onDestroy(() => {
      this.disposed = true;
      if (typeof window !== 'undefined') window.cancelAnimationFrame(this.animationFrame);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['animation'] || changes['oneShot']) && this.config()) {
      this.startAnimation();
    }
  }

  protected backgroundSize(): string {
    const config = this.config();
    if (!config) return '0 0';
    if (this.responsive) return `${config.columns * 100}% ${config.rows.length * 100}%`;
    const rowCount = config.rows.length;
    return `${config.columns * this.displaySize}px ${rowCount * this.displaySize}px`;
  }

  protected backgroundImage(): string | null {
    const url = this.sheetUrl();
    return url ? `url("${url}")` : null;
  }

  protected backgroundPosition(): string {
    const config = this.config();
    if (!config) return '0 0';
    const rowIndex = config.rows.findIndex((row) => row.name === this.animation);
    if (this.responsive) {
      const horizontal = config.columns > 1 ? this.frameIndex() / (config.columns - 1) * 100 : 0;
      const vertical = config.rows.length > 1 ? Math.max(0, rowIndex) / (config.rows.length - 1) * 100 : 0;
      return `${horizontal}% ${vertical}%`;
    }
    return `-${this.frameIndex() * this.displaySize}px -${Math.max(0, rowIndex) * this.displaySize}px`;
  }

  private async loadSpriteSheet(): Promise<void> {
    try {
      const configUrl = new URL(SPRITE_CONFIG_URL, document.baseURI);
      const response = await fetch(configUrl);
      if (!response.ok) throw new Error(`Sprite configuration returned HTTP ${response.status}.`);
      const value: unknown = await response.json();
      if (!isSpriteSheetConfig(value)) throw new Error('Sprite configuration has an invalid shape.');

      const sheetUrl = new URL('apollo-sprites.png', configUrl).toString();
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Apollo sprite sheet could not be loaded.'));
        image.src = sheetUrl;
      });
      if (this.disposed) return;
      this.config.set(value);
      this.sheetUrl.set(sheetUrl);
      this.assetsLoaded.emit();
      this.startAnimation();
    } catch (error) {
      if (this.disposed) return;
      console.error('Unable to load Apollo sprite assets:', error);
      this.configError.set(true);
      this.assetsError.emit();
    }
  }

  private startAnimation(): void {
    const row = this.config()?.rows.find((item) => item.name === this.animation);
    if (!row) {
      console.error(`Apollo sprite configuration has no "${this.animation}" row.`);
      this.configError.set(true);
      return;
    }
    if (typeof window !== 'undefined') window.cancelAnimationFrame(this.animationFrame);
    this.frameIndex.set(0);
    this.direction = 1;
    this.lastFrameTime = 0;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.frameIndex.set(Math.min(Math.max(0, this.staticFrame), row.frames - 1));
      if (!row.loop || this.oneShot) this.animationFinished.emit();
      return;
    }
    this.animationFrame = window.requestAnimationFrame((time) => this.tick(time));
  }

  private tick(time: number): void {
    const row = this.config()?.rows.find((item) => item.name === this.animation);
    if (!row || this.disposed) return;
    if (this.lastFrameTime === 0) this.lastFrameTime = time;
    if (time - this.lastFrameTime >= 1000 / row.fps) {
      this.lastFrameTime = time;
      const step = advanceSpriteFrame(this.frameIndex(), this.direction, row, this.oneShot);
      this.frameIndex.set(step.frame);
      this.direction = step.direction;
      if (
        (row.playback === 'pingpong' && this.direction === 1 && step.frame === 1) ||
        (row.playback !== 'pingpong' && step.direction === 1 && step.frame === 0)
      ) {
        this.animationCycle.emit();
      }
      if (step.finished) {
        this.animationFinished.emit();
        return;
      }
    }
    this.animationFrame = window.requestAnimationFrame((nextTime) => this.tick(nextTime));
  }
}
