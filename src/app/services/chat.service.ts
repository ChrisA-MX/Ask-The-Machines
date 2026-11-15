import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatReply {
  reply: string;
  suggestions?: string[];
}

export interface ChatResult {
  reply: string;
  succeeded: boolean;
  suggestions?: string[];
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);

  async ask(message: string, history: readonly ChatHistoryMessage[] = [], machineId?: string): Promise<ChatResult> {
    try {
      const response = await firstValueFrom(
        this.http.post<ChatReply>('/chat', {
          message,
          history: history.slice(-6),
          ...(machineId ? { machineId } : {}),
        }),
      );
      if (response.reply?.trim()) return { reply: response.reply.trim(), succeeded: true, suggestions: response.suggestions };
    } catch (error) {
      const serverReply = error instanceof HttpErrorResponse && typeof error.error?.reply === 'string'
        ? error.error.reply.trim()
        : '';
      if (serverReply && error instanceof HttpErrorResponse) {
        const suggestions = Array.isArray(error.error?.suggestions)
          ? error.error.suggestions.filter((suggestion: unknown): suggestion is string => typeof suggestion === 'string')
          : undefined;
        return { reply: serverReply, succeeded: true, suggestions };
      }
      return {
        reply: 'Apollo is not connected right now. Please try again in a little while.',
        succeeded: false,
      };
    }
    return { reply: 'Apollo could not prepare a reply. Please try again.', succeeded: false };
  }
}
