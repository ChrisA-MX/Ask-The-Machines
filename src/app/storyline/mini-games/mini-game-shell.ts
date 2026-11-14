import { A11yModule } from '@angular/cdk/a11y';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ApolloGame } from '../../components/apollo-game/apollo-game';
import { MACHINES, WorldId, WorldStory } from '../machines.data';
import { OpportunityGame } from './opportunity-game';
import { VoyagerGame } from './voyager-game';

@Component({
  selector: 'app-mini-game-shell',
  standalone: true,
  imports: [A11yModule, ApolloGame, OpportunityGame, VoyagerGame],
  templateUrl: './mini-game-shell.html',
  styleUrl: './mini-game-shell.scss',
})
export class MiniGameShell {
  @Input({ required: true }) world!: WorldStory;
  @Input() nextWorldName = '';
  @Output() readonly completed = new EventEmitter<WorldId>();
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly next = new EventEmitter<void>();
  protected gameComplete = false;
  private completionEmitted = false;

  protected markComplete(): void {
    if (this.completionEmitted) return;
    this.gameComplete = true;
    this.completionEmitted = true;
    this.completed.emit(this.world.id);
  }

  protected replay(): void {
    this.gameComplete = false;
    this.completionEmitted = false;
  }

  protected facts(): string[] {
    if (this.world.id === 'mars') return this.machineFacts(['opportunity-mer-b', 'insight']);
    if (this.world.id === 'outer') return this.machineFacts(['voyager-1']);
    return [];
  }

  protected backToWorlds(): void { this.closed.emit(); }
  protected goNextWorld(): void { this.next.emit(); }

  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  private machineFacts(ids: string[]): string[] {
    return ids.flatMap((id) => MACHINES.find((machine) => machine.id === id)?.fact ?? []);
  }
}
