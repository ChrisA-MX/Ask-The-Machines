import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ChatAvailabilityService {
  readonly isAvailable = signal(true);

  setAvailable(available: boolean): void {
    this.isAvailable.set(available);
  }
}
