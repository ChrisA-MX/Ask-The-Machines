import { Component, input, signal } from '@angular/core';

export type DoodleKind = 'planet' | 'astronaut' | 'satellite' | 'rocket' | 'comet' | 'star';

@Component({ selector: 'app-space-doodle', standalone: true, templateUrl: './space-doodle.html', styleUrl: './space-doodle.scss' })
export class SpaceDoodle {
  readonly kind = input<DoodleKind>('star');
  readonly message = input('Hello, space explorer!');
  protected readonly showMessage = signal(false);
  private timeout?: ReturnType<typeof setTimeout>;
  protected peek(): void {
    this.showMessage.set(true);
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.showMessage.set(false), 2200);
  }
  protected dismiss(): void { this.showMessage.set(false); clearTimeout(this.timeout); }
}
