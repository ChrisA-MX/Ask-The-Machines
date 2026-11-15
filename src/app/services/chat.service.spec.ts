import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ChatService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ChatService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the question, at most six conversation messages, and story context', async () => {
    const history = Array.from({ length: 7 }, (_, index) => ({
      role: index % 2 ? 'assistant' as const : 'user' as const,
      content: `Turn ${index}`,
    }));
    const resultPromise = service.ask('What happened at Tranquility Base?', history, 'apollo-11-eagle');
    const request = http.expectOne('/chat');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      message: 'What happened at Tranquility Base?',
      history: history.slice(-6),
      machineId: 'apollo-11-eagle',
    });
    request.flush({ reply: 'The descent stage remained on the Moon.', suggestions: ['What did Eagle find?'] });

    await expect(resultPromise).resolves.toEqual({
      reply: 'The descent stage remained on the Moon.',
      succeeded: true,
      suggestions: ['What did Eagle find?'],
    });
  });
});
