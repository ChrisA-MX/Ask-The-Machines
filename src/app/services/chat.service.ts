import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ProgressService } from './progress.service';

export interface ChatReply {
  reply: string;
}

export interface ChatResult {
  reply: string;
  succeeded: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly progress = inject(ProgressService);

  async ask(message: string): Promise<ChatResult> {
    try {
      const response = await firstValueFrom(
        this.http.post<ChatReply>('/chat', {
          message,
          completedMachineIds: this.progress.completedMachineIds(),
        }),
      );
      if (response.reply?.trim()) return { reply: response.reply.trim(), succeeded: true };
    } catch {
      return {
        reply: 'Apollo is not connected right now. Please try again in a little while.',
        succeeded: false,
      };
    }
    return { reply: 'Apollo could not prepare a reply. Please try again.', succeeded: false };
  }
}
