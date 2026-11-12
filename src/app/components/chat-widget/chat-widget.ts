import { afterNextRender, Component, computed, DestroyRef, ElementRef, HostListener, inject, Injector, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnimatedSprite, ApolloAnimation } from '../animated-sprite/animated-sprite';
import { ChatAvailabilityService } from '../../services/chat-availability.service';
import { ChatService } from '../../services/chat.service';
import { PlayerProfileService } from '../../services/player-profile.service';

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

const TOUCH_GREETING_KEY = 'ask-the-machines-apollo-touch-greeting-v1';

@Component({
  imports: [FormsModule, AnimatedSprite],
  selector: 'app-chat-widget',
  styleUrl: './chat-widget.css',
  templateUrl: './chat-widget.html',
})
export class ChatWidget {
  @ViewChild('messageInput') private messageInput?: ElementRef<HTMLInputElement>;
  @ViewChild('apolloButton') private apolloButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('chatDialog') private chatDialog?: ElementRef<HTMLElement>;

  private readonly chat = inject(ChatService);
  private readonly availability = inject(ChatAvailabilityService);
  private readonly profile = inject(PlayerProfileService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  protected readonly isOpen = signal(false);
  protected readonly isThinking = signal(false);
  protected readonly apolloAnimation = signal<ApolloAnimation>('idle');
  protected readonly bubbleVisible = signal(false);
  protected readonly spriteFailed = signal(false);
  protected readonly reducedMotion = signal(false);
  protected readonly isBusy = computed(() => !this.availability.isAvailable());
  protected readonly greeting = computed(
    () => `Hello Explorer, I'm ${this.profile.avatarName()}.`,
  );
  protected readonly messages = signal<ChatMessage[]>([]);
  protected draft = '';
  protected readonly suggestions = [
    'What is this project about?',
    'Who are the machines?',
    'What will I learn?',
  ];

  private isHovered = false;
  private isFocused = false;
  private returnToIdleAfterWave = false;
  private greetingTimer?: ReturnType<typeof setTimeout>;
  private touchHideTimer?: ReturnType<typeof setTimeout>;
  private animationTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.messages.set([{
      role: 'assistant',
      text: `Hi, space explorer! I’m ${this.profile.avatarName()}. Ask me what this project is about, or how the machine stories work.`,
    }]);
    this.destroyRef.onDestroy(() => {
      if (this.greetingTimer) clearTimeout(this.greetingTimer);
      if (this.touchHideTimer) clearTimeout(this.touchHideTimer);
      if (this.animationTimer) clearTimeout(this.animationTimer);
    });
    afterNextRender(() => this.scheduleTouchGreeting());
  }

  protected openChat(): void {
    if (!this.availability.isAvailable() || this.isOpen()) return;
    this.isOpen.set(true);
    this.bubbleVisible.set(false);
    this.returnToIdleAfterWave = false;
    this.clearTimers();
    this.apolloAnimation.set('idle');
    afterNextRender(() => this.messageInput?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeChat(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.bubbleVisible.set(false);
    this.apolloAnimation.set('idle');
    afterNextRender(() => this.apolloButton?.nativeElement.focus(), { injector: this.injector });
  }

  protected onHover(): void {
    this.isHovered = true;
    this.showGreeting();
  }

  protected onMouseLeave(): void {
    this.isHovered = false;
    this.hideGreetingWhenWaveCompletes();
  }

  protected onFocus(): void {
    this.isFocused = true;
    this.showGreeting();
  }

  protected onBlur(): void {
    this.isFocused = false;
    this.hideGreetingWhenWaveCompletes();
  }

  protected onAnimationCycle(): void {
    if (
      this.returnToIdleAfterWave &&
      !this.isHovered &&
      !this.isFocused &&
      this.apolloAnimation() === 'wave'
    ) {
      this.returnToIdleAfterWave = false;
      this.apolloAnimation.set('idle');
    }
  }

  protected onSpriteError(): void {
    this.spriteFailed.set(true);
  }

  protected async send(text = this.draft): Promise<void> {
    const question = text.trim();
    if (!question || this.isThinking()) return;

    this.messages.update((items) => [...items, { role: 'user', text: question }]);
    this.draft = '';
    this.isThinking.set(true);
    try {
      const result = await this.chat.ask(question);
      this.messages.update((items) => [...items, { role: 'assistant', text: result.reply }]);
      this.playAnimation(result.succeeded ? 'happy' : 'sad', 2000);
    } finally {
      this.isThinking.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  private onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeChat();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = this.chatDialog?.nativeElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private showGreeting(): void {
    if (this.isOpen() || !this.availability.isAvailable()) return;
    if (this.greetingTimer) clearTimeout(this.greetingTimer);
    this.bubbleVisible.set(true);
    this.returnToIdleAfterWave = false;
    this.apolloAnimation.set('wave');
  }

  private hideGreetingWhenWaveCompletes(): void {
    if (this.isOpen() || this.isHovered || this.isFocused) return;
    this.bubbleVisible.set(false);
    if (this.apolloAnimation() !== 'wave') return;
    if (this.reducedMotion()) {
      this.apolloAnimation.set('idle');
      return;
    }
    this.returnToIdleAfterWave = true;
  }

  private scheduleTouchGreeting(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    this.reducedMotion.set(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
      window.matchMedia('(hover: none)').matches;
    if (!isTouch || this.isOpen()) return;
    try {
      if (sessionStorage.getItem(TOUCH_GREETING_KEY)) return;
      sessionStorage.setItem(TOUCH_GREETING_KEY, 'shown');
    } catch {
      // The one-time greeting remains limited to this app instance when storage is unavailable.
    }
    this.greetingTimer = setTimeout(() => {
      if (this.isOpen() || !this.availability.isAvailable()) return;
      this.bubbleVisible.set(true);
      this.apolloAnimation.set('wave');
      this.touchHideTimer = setTimeout(() => {
        this.bubbleVisible.set(false);
        if (this.reducedMotion()) this.apolloAnimation.set('idle');
        else this.returnToIdleAfterWave = true;
      }, 3000);
    }, 4000);
  }

  private playAnimation(animation: ApolloAnimation, duration?: number): void {
    if (this.animationTimer) clearTimeout(this.animationTimer);
    this.apolloAnimation.set(animation);
    if (duration) {
      this.animationTimer = setTimeout(() => {
        this.animationTimer = undefined;
        this.apolloAnimation.set('idle');
      }, duration);
    }
  }

  private clearTimers(): void {
    if (this.greetingTimer) clearTimeout(this.greetingTimer);
    if (this.touchHideTimer) clearTimeout(this.touchHideTimer);
    this.greetingTimer = undefined;
    this.touchHideTimer = undefined;
  }
}
