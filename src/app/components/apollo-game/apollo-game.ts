import { Component, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule, transferArrayItem } from '@angular/cdk/drag-drop';

interface GearItem {
  id: string;
  name: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-apollo-game',
  imports: [DragDropModule],
  templateUrl: './apollo-game.html',
  styleUrl: './apollo-game.scss',
})
export class ApolloGame {
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

  protected readonly requiredGearCount = this.startingGear.length;

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
    this.announcement.set('The cargo checklist is reset. Move all three gear items to the surface.');
  }
}
