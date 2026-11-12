import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AnimatedSprite } from '../animated-sprite/animated-sprite';
import { ChatAvailabilityService } from '../../services/chat-availability.service';
import { ChatService } from '../../services/chat.service';
import { PlayerProfileService } from '../../services/player-profile.service';
import { ChatWidget } from './chat-widget';

@Component({
  selector: 'app-animated-sprite',
  standalone: true,
  template: '<span class="mock-sprite" [attr.data-animation]="animation"></span>',
})
class MockAnimatedSprite {
  @Input() animation = 'idle';
  @Input() altText = '';
  @Input() displaySize = 64;
  @Input() responsive = false;
  @Input() staticFrame = 0;
  @Input() oneShot = false;
  @Output() readonly animationCycle = new EventEmitter<void>();
  @Output() readonly assetsError = new EventEmitter<void>();
}

describe('ChatWidget', () => {
  const chat = { ask: vi.fn() };
  const profile = { avatarName: signal('Apollo') };
  let availability: ChatAvailabilityService;

  beforeEach(async () => {
    vi.clearAllMocks();
    chat.ask.mockResolvedValue({ reply: 'Hello!', succeeded: true });
    availability = new ChatAvailabilityService();
    TestBed.overrideComponent(ChatWidget, {
      remove: { imports: [AnimatedSprite] },
      add: { imports: [MockAnimatedSprite] },
    });
    await TestBed.configureTestingModule({
      imports: [ChatWidget],
      providers: [
        { provide: ChatService, useValue: chat },
        { provide: ChatAvailabilityService, useValue: availability },
        { provide: PlayerProfileService, useValue: profile },
      ],
    }).compileComponents();
  });

  it('shows the exact greeting and wave animation on hover', () => {
    const fixture = TestBed.createComponent(ChatWidget);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.apollo-button') as HTMLButtonElement;

    button.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.speech-bubble').textContent.trim())
      .toBe("Hello Explorer, I'm Apollo.");
    expect(fixture.nativeElement.querySelector('.speech-bubble').classList.contains('is-visible')).toBe(true);
    expect(fixture.nativeElement.querySelector('.mock-sprite').getAttribute('data-animation')).toBe('wave');
  });

  it('shows the wave greeting when Apollo receives keyboard focus', () => {
    const fixture = TestBed.createComponent(ChatWidget);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.apollo-button') as HTMLButtonElement).focus();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.speech-bubble').classList.contains('is-visible')).toBe(true);
    expect(fixture.nativeElement.querySelector('.mock-sprite').getAttribute('data-animation')).toBe('wave');
  });

  it('hides the bubble on leave and returns to idle after the wave loop', () => {
    const fixture = TestBed.createComponent(ChatWidget);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.apollo-button') as HTMLButtonElement;
    button.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    button.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();

    const sprite = fixture.debugElement.query(By.directive(MockAnimatedSprite))
      .componentInstance as MockAnimatedSprite;
    expect(fixture.nativeElement.querySelector('.speech-bubble').classList.contains('is-visible')).toBe(false);
    expect(fixture.nativeElement.querySelector('.mock-sprite').getAttribute('data-animation')).toBe('wave');

    sprite.animationCycle.emit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mock-sprite').getAttribute('data-animation')).toBe('idle');
  });

  it('opens the dialog and moves focus into the input', async () => {
    const fixture = TestBed.createComponent(ChatWidget);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.apollo-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#chat-message'));
  });

  it('closes on Escape and returns focus to Apollo', async () => {
    const fixture = TestBed.createComponent(ChatWidget);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.apollo-button') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('disables Apollo while chat availability is false', () => {
    const fixture = TestBed.createComponent(ChatWidget);
    fixture.detectChanges();
    availability.setAvailable(false);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.apollo-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.title).toBe('Apollo is busy rescuing!');
  });

  it('keeps the previous launcher usable if the sprite assets fail', () => {
    const fixture = TestBed.createComponent(ChatWidget);
    fixture.detectChanges();
    fixture.debugElement.query(By.directive(MockAnimatedSprite))
      .componentInstance.assetsError.emit();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.apollo-button') as HTMLButtonElement;
    expect(button.textContent).toContain('Ask Apollo');
    expect(button.getAttribute('aria-label')).toBe('Chat with Apollo');
    expect(button.disabled).toBe(false);
  });
});
