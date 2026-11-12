import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule, transferArrayItem } from '@angular/cdk/drag-drop';
import { AnimatedSprite, ApolloAnimation } from '../animated-sprite/animated-sprite';
import { ChatAvailabilityService } from '../../services/chat-availability.service';

interface GearItem {
  id: string;
  name: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-apollo-game',
  imports: [DragDropModule, AnimatedSprite],
  templateUrl: './apollo-game.html',
  styleUrl: './apollo-game.scss',
})
export class ApolloGame {
  private readonly availability = inject(ChatAvailabilityService);
  private readonly destroyRef = inject(DestroyRef);

  /** Mock activity items; replace with researched, mission-approved gear data later. */
  private readonly startingGear: GearItem[] = [
    { id: 'plss', name: 'Portable Life Support System', icon: '▣', description: 'A backpack-sized life-support unit' },
    { id: 'overshoes', name: 'Lunar Overshoes', icon: '◢', description: 'Protective boots for walking on the Moon' },
    { id: 'emesis-bags', name: 'Emesis Bags', icon: '◇', description: 'A small crew comfort item' },
  ];

  protected readonly lunarModule = signal<GearItem[]>(this.startingGear.map((item) => ({ ...item })));
  protected readonly discardPile = signal<GearItem[]>([]);
  protected readonly announcement = signal('');
  protected readonly isComplete = signal(false);
  protected readonly apolloAnimation = signal<ApolloAnimation>('idle');

  protected readonly requiredGearCount = this.startingGear.length;

  constructor() {
    this.destroyRef.onDestroy(() => this.availability.setAvailable(true));
  }

  protected onDragStarted(): void {
    this.availability.setAvailable(false);
  }

  protected onDragEnded(): void {
    this.availability.setAvailable(true);
  }

  protected onDrop(event: CdkDragDrop<GearItem[]>): void {
    if (event.previousContainer === event.container) return;

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );
    this.lunarModule.set([...this.lunarModule()]);
    this.discardPile.set([...this.discardPile()]);

    const complete = this.discardPile().length === this.requiredGearCount;
    this.isComplete.set(complete);
    this.apolloAnimation.set(complete ? 'thumbsUp' : 'idle');
    this.announcement.set(
      complete
        ? 'Weight limit reached! You have room for the Moon Rocks. Lift-off successful!'
        : `${this.discardPile().length} of ${this.requiredGearCount} gear items moved to the surface.`,
    );
  }

  protected resetGame(): void {
    this.lunarModule.set(this.startingGear.map((item) => ({ ...item })));
    this.discardPile.set([]);
    this.isComplete.set(false);
    this.apolloAnimation.set('idle');
    this.announcement.set('The cargo checklist is reset. Move all three gear items to the surface.');
  }

  protected onAnimationFinished(): void {
    if (this.apolloAnimation() === 'thumbsUp') this.apolloAnimation.set('idle');
  }
}
