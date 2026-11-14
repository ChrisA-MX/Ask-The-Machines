import { Injectable } from '@angular/core';
import { WorldId } from './machines.data';

export interface TrailReturnContext {
  worldId: WorldId;
  machineId: string;
  scrollY: number;
}

/** Holds the in-memory trail location while Angular navigates to/from a story route. */
@Injectable({ providedIn: 'root' })
export class StorylineNavigationService {
  private returnContext: TrailReturnContext | null = null;

  remember(context: TrailReturnContext): void { this.returnContext = context; }
  peek(): TrailReturnContext | null { return this.returnContext; }
  consume(): TrailReturnContext | null {
    const context = this.returnContext;
    this.returnContext = null;
    return context;
  }
}
