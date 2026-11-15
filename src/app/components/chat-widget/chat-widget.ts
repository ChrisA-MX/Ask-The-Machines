import { afterEveryRender, afterNextRender, Component, computed, DestroyRef, ElementRef, HostBinding, HostListener, inject, Injector, PLATFORM_ID, ViewChild, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AnimatedSprite, ApolloAnimation } from '../animated-sprite/animated-sprite';
import { ChatAvailabilityService } from '../../services/chat-availability.service';
import { ChatHistoryMessage, ChatService } from '../../services/chat.service';
import { PlayerProfileService } from '../../services/player-profile.service';
import { SoundService } from '../../services/sound.service';
import { MACHINES, MachineStory } from '../../storyline/machines.data';

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
  @ViewChild('chatBody') private chatBody?: ElementRef<HTMLDivElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly chat = inject(ChatService);
  private readonly router = inject(Router);
  private readonly availability = inject(ChatAvailabilityService);
  private readonly profile = inject(PlayerProfileService);
  private readonly sound = inject(SoundService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  protected readonly isOpen = signal(false);
  protected readonly isThinking = signal(false);
  protected readonly apolloAnimation = signal<ApolloAnimation>('idle');
  protected readonly bubbleVisible = signal(false);
  protected readonly spriteFailed = signal(false);
  protected readonly reducedMotion = signal(false);
  protected readonly storyModalOpen = signal(false);
  protected readonly isBusy = computed(() => !this.availability.isAvailable());
  protected readonly greeting = computed(
    () => `Hello, ${this.profile.avatarName()}. I'm Apollo.`,
  );
  private readonly openingMessage = computed(
    () => `${this.greeting()} Ask me what this project is about, or how the machine stories work.`,
  );
  protected readonly messages = signal<ChatMessage[]>([]);
  protected draft = '';
  protected readonly suggestions = signal([
    'What is this project about?',
    'Who are the machines?',
    'What will I learn?',
  ]);

  private isHovered = false;
  private isFocused = false;
  private returnToIdleAfterWave = false;
  private greetingTimer?: ReturnType<typeof setTimeout>;
  private touchHideTimer?: ReturnType<typeof setTimeout>;
  private animationTimer?: ReturnType<typeof setTimeout>;
  private modalObserver?: MutationObserver;
  private visualViewport?: VisualViewport;
  private visualViewportListener?: () => void;
  private lastScrolledBody?: HTMLDivElement;
  private lastScrolledMessageCount = -1;

  @HostBinding('class.story-modal-open')
  protected get storyModalLayerIsOpen(): boolean { return this.storyModalOpen(); }

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.greetingTimer) clearTimeout(this.greetingTimer);
      if (this.touchHideTimer) clearTimeout(this.touchHideTimer);
      if (this.animationTimer) clearTimeout(this.animationTimer);
      this.modalObserver?.disconnect();
      if (this.visualViewportListener) {
        this.visualViewport?.removeEventListener('resize', this.visualViewportListener);
        this.visualViewport?.removeEventListener('scroll', this.visualViewportListener);
      }
    });
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        this.scheduleTouchGreeting();
        this.visualViewport = window.visualViewport ?? undefined;
        this.visualViewportListener = () => this.syncPanelViewport();
        this.visualViewport?.addEventListener('resize', this.visualViewportListener);
        this.visualViewport?.addEventListener('scroll', this.visualViewportListener);
        this.modalObserver = new MutationObserver(() => this.checkStoryModal());
        this.modalObserver.observe(document.body, { childList: true, subtree: true });
        this.checkStoryModal();
        this.syncPanelViewport();
      }, { injector: this.injector });
      afterEveryRender(() => {
        if (!isPlatformBrowser(this.platformId)) return;
        this.syncPanelViewport();
        this.scrollToLatestMessage();
      });
    }
  }

  protected openChat(): void {
    if (!this.availability.isAvailable() || this.isOpen()) return;
    if (!this.messages().length) {
      this.messages.set([{ role: 'assistant', text: this.openingMessage() }]);
    }
    this.updateStorySuggestions();
    this.isOpen.set(true);
    this.bubbleVisible.set(false);
    this.returnToIdleAfterWave = false;
    this.clearTimers();
    this.apolloAnimation.set('idle');
    afterNextRender(() => this.messageInput?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeChat(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.bubbleVisible.set(false);
    this.apolloAnimation.set('idle');
    afterNextRender(() => {
      if (restoreFocus && !this.storyModalOpen()) this.apolloButton?.nativeElement.focus();
    }, { injector: this.injector });
  }

  @HostListener('window:resize')
  private onWindowResize(): void { this.syncPanelViewport(); }

  @HostListener('window:ask-apollo')
  private onAskApollo(): void { this.openChat(); }

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

    const previousMessages = this.messages().slice(1);
    const history: ChatHistoryMessage[] = previousMessages.slice(-6).map(({ role, text: content }) => ({ role, content }));
    const story = this.currentStory();
    this.updateStorySuggestions(story);
    this.messages.update((items) => [...items, { role: 'user', text: question }]);
    this.draft = '';
    this.isThinking.set(true);
    this.sound.play('message');
    try {
      const result = await this.chat.ask(question, history, story?.routeId);
      this.messages.update((items) => [...items, { role: 'assistant', text: result.reply }]);
      if ((story || result.offline) && result.suggestions?.length) this.suggestions.set(result.suggestions.slice(0, 3));
      this.playAnimation(result.succeeded ? 'happy' : 'sad', 2000);
      this.sound.play(result.succeeded ? 'reply' : 'error');
    } finally {
      this.isThinking.set(false);
    }
  }

  private currentStory(): MachineStory | undefined {
    const match = this.router.url.match(/^\/storylines\/[^/?#]+\/([^/?#]+)/);
    if (!match) return undefined;
    let routeId = match[1];
    try { routeId = decodeURIComponent(routeId); } catch { /* Keep the encoded route segment. */ }
    return MACHINES.find((machine) => machine.routeId === routeId);
  }

  private updateStorySuggestions(story = this.currentStory()): void {
    if (!story) {
      this.suggestions.set(['What is this project about?', 'Who are the machines?', 'What will I learn?']);
      return;
    }
    this.suggestions.set([
      `What did ${story.name} find?`,
      `Is ${story.name} still working?`,
      `How did ${story.name} work?`,
    ]);
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

  private syncPanelViewport(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const panel = this.chatDialog?.nativeElement;
    if (!panel) return;
    const viewport = window.visualViewport;
    panel.style.setProperty('--chat-visible-height', `${viewport?.height ?? window.innerHeight}px`);
    panel.style.setProperty('--chat-visible-top', `${viewport?.offsetTop ?? 0}px`);
    panel.style.setProperty('--chat-layout-height', `${window.innerHeight}px`);
    this.keepPrimaryActionsReachable(panel, viewport?.height ?? window.innerHeight, viewport?.offsetTop ?? 0);
  }

  private keepPrimaryActionsReachable(panel: HTMLElement, visibleHeight: number, visibleTop: number): void {
    panel.classList.remove('chat-panel--action-clearance');
    panel.style.removeProperty('top');
    panel.style.removeProperty('height');
    panel.style.removeProperty('max-height');
    panel.style.removeProperty('min-height');
    panel.style.removeProperty('bottom');
    const panelRect = panel.getBoundingClientRect();
    const visibleBottom = visibleTop + visibleHeight - 16;
    const navigation = document.querySelector<HTMLElement>('header nav');
    const topLimit = Math.max(visibleTop + 12, (navigation?.getBoundingClientRect().bottom ?? 0) + 12);
    const primaryActions = [...document.querySelectorAll<HTMLElement>('.journey-button, .explore-button, .peek-button')]
      .filter((action) => action.getClientRects().length > 0);
    const overlap = primaryActions.find((action) => {
      const rect = action.getBoundingClientRect();
      return rect.top < panelRect.bottom && rect.bottom > panelRect.top && rect.left < panelRect.right && rect.right > panelRect.left;
    });
    if (!overlap) return;

    const actionRect = overlap.getBoundingClientRect();
    const gap = 12;
    const aboveSpace = Math.max(0, actionRect.top - gap - topLimit);
    const belowSpace = Math.max(0, visibleBottom - actionRect.bottom - gap);
    const placeAbove = belowSpace < 188 && aboveSpace >= belowSpace;
    const available = placeAbove ? aboveSpace : belowSpace;
    if (available < 160) return;

    const height = Math.min(panelRect.height, available);
    panel.classList.toggle('chat-panel--action-clearance', height < 320);
    const top = placeAbove ? actionRect.top - gap - height : actionRect.bottom + gap;
    panel.style.setProperty('top', `${top}px`);
    panel.style.setProperty('bottom', 'auto');
    panel.style.setProperty('height', `${height}px`);
    panel.style.setProperty('max-height', `${height}px`);
    panel.style.setProperty('min-height', '0px');
  }

  private scrollToLatestMessage(): void {
    if (!this.isOpen()) return;
    const body = this.chatBody?.nativeElement;
    const messageCount = this.messages().length;
    if (!body || (body === this.lastScrolledBody && messageCount === this.lastScrolledMessageCount)) return;
    this.lastScrolledBody = body;
    this.lastScrolledMessageCount = messageCount;
    body.scrollTop = body.scrollHeight;
  }

  private checkStoryModal(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const modalOpen = !!document.querySelector('app-story-modal');
    if (modalOpen !== this.storyModalOpen()) this.storyModalOpen.set(modalOpen);
    const storyPreviewOpen = !!document.querySelector('.stop-card-overlay');
    if ((modalOpen || storyPreviewOpen) && this.isOpen()) this.closeChat(!storyPreviewOpen);
  }
}
