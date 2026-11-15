import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { SoundService } from '../../services/sound.service';

/** Always-visible sound switch, bottom left on every page. */
@Component({
  selector: 'app-sound-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sound-toggle.css',
  template: `
    @if (sound.supported()) {
      <button type="button" class="sound-button" [class.is-muted]="sound.muted()" [class.show-label]="labelVisible()"
        [attr.aria-pressed]="!sound.muted()" [attr.aria-label]="label()" [title]="label()" (click)="toggle()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4z" />
          @if (sound.muted()) { <path d="m16 9 5 6m0-6-5 6" /> } @else { <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> }
        </svg>
        <span class="sound-label">{{ sound.muted() ? 'Sound off' : 'Sound on' }}</span>
      </button>
    }
  `,
})
export class SoundToggle {
  protected readonly sound = inject(SoundService);
  protected readonly labelVisible = signal(false);
  protected readonly label = computed(() => this.sound.muted() ? 'Turn sound on' : 'Turn sound off');
  private labelTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    afterNextRender(() => this.sound.init());
    // When the music first fades in, show the label for a moment so visitors know where the switch is.
    effect(() => {
      if (this.sound.started() && !this.sound.muted()) this.flashLabel();
    });
  }

  protected toggle(): void {
    this.sound.toggleMuted();
    this.flashLabel();
  }

  private flashLabel(): void {
    this.labelVisible.set(true);
    clearTimeout(this.labelTimer);
    this.labelTimer = setTimeout(() => this.labelVisible.set(false), 4500);
  }
}
