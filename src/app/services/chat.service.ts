import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface ChatReply {
  reply: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);

  async ask(message: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post<ChatReply>('/chat', { machineId: 'project-guide', message }),
      );
      if (response.reply?.trim()) return response.reply.trim();
    } catch {
      return 'Mission Control is not connected right now. Please try again in a little while.';
    }
    return 'Mission Control could not prepare a reply. Please try again.';
  }
}
