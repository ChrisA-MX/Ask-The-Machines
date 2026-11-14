import { Component, DestroyRef, EventEmitter, inject, Output, signal } from '@angular/core';
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
  @Output() readonly completed = new EventEmitter<void>();
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
  protected readonly selectedGearId = signal<string | null>(null);
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
    this.selectedGearId.set(null);
    this.updateCompletion();
  }

  protected selectGear(item: GearItem): void {
    this.selectedGearId.set(this.selectedGearId() === item.id ? null : item.id);
    this.announcement.set(`${item.name} ${this.selectedGearId() === item.id ? 'selected' : 'deselected'}. Choose Leave on the Moon or Bring home.`);
  }

  protected isSelected(item: GearItem): boolean { return this.selectedGearId() === item.id; }
  protected hasSelectedModuleItem(): boolean { return this.lunarModule().some((item) => item.id === this.selectedGearId()); }
  protected hasSelectedSurfaceItem(): boolean { return this.discardPile().some((item) => item.id === this.selectedGearId()); }

  protected moveSelected(destination: 'module' | 'surface'): void {
    const id = this.selectedGearId();
    if (!id) return;
    const from = destination === 'surface' ? this.lunarModule() : this.discardPile();
    const to = destination === 'surface' ? this.discardPile() : this.lunarModule();
    const index = from.findIndex((item) => item.id === id);
    if (index < 0) return;
    transferArrayItem(from, to, index, to.length);
    this.lunarModule.set([...this.lunarModule()]);
    this.discardPile.set([...this.discardPile()]);
    this.selectedGearId.set(null);
    this.updateCompletion();
  }

  private updateCompletion(): void {
    const complete = this.discardPile().length === this.requiredGearCount;
    const wasComplete = this.isComplete();
    this.isComplete.set(complete);
    this.apolloAnimation.set(complete ? 'thumbsUp' : 'idle');
    if (complete && !wasComplete) this.completed.emit();
    this.announcement.set(complete
      ? 'Weight limit reached! You have room for the Moon Rocks. Lift-off successful!'
      : `${this.discardPile().length} of ${this.requiredGearCount} gear items moved to Leave on the Moon.`);
  }

  protected resetGame(): void {
    this.lunarModule.set(this.startingGear.map((item) => ({ ...item })));
    this.discardPile.set([]);
    this.isComplete.set(false);
    this.selectedGearId.set(null);
    this.apolloAnimation.set('idle');
    this.announcement.set('The cargo checklist is reset. Move all three gear items to the surface.');
  }

  protected onAnimationFinished(): void {
    if (this.apolloAnimation() === 'thumbsUp') this.apolloAnimation.set('idle');
  }
}
