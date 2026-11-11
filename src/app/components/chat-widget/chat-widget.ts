import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../services/chat.service';

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

@Component({
  imports: [FormsModule],
  selector: 'app-chat-widget',
  styleUrl: './chat-widget.css',
  templateUrl: './chat-widget.html',
})
export class ChatWidget {
  @ViewChild('messageInput') private messageInput?: ElementRef<HTMLInputElement>;

  protected readonly isOpen = signal(false);
  protected readonly isThinking = signal(false);
  protected readonly messages = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Hi, space explorer! I’m Mission Control. Ask me what this project is about, or how the machine stories work.',
    },
  ]);
  protected draft = '';
  protected readonly suggestions = [
    'What is this project about?',
    'Who are the machines?',
    'What will I learn?',
  ];

  constructor(private readonly chat: ChatService) {}

  protected openChat(): void {
    this.isOpen.update((open) => !open);
    if (this.isOpen()) setTimeout(() => this.messageInput?.nativeElement.focus());
  }

  protected async send(text = this.draft): Promise<void> {
    const question = text.trim();
    if (!question || this.isThinking()) return;

    this.messages.update((items) => [...items, { role: 'user', text: question }]);
    this.draft = '';
    this.isThinking.set(true);
    try {
      const reply = await this.chat.ask(question);
      this.messages.update((items) => [...items, { role: 'assistant', text: reply }]);
    } finally {
      this.isThinking.set(false);
    }
  }
}
