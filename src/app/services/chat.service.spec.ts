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

  it('answers from the bundled story notes when the chat server cannot be reached', async () => {
    const resultPromise = service.ask('What did Opportunity find?', [], 'opportunity');
    http.expectOne('/chat').error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    const result = await resultPromise;
    expect(result.succeeded).toBe(true);
    expect(result.offline).toBe(true);
    expect(result.reply).toContain('Opportunity');
    expect(result.suggestions?.length).toBe(3);
  });

  it('gives a live Voyager 1 distance offline', async () => {
    const resultPromise = service.ask('How far away is Voyager 1?');
    http.expectOne('/chat').flush('Not found', { status: 404, statusText: 'Not Found' });

    const result = await resultPromise;
    expect(result.offline).toBe(true);
    expect(result.reply).toMatch(/Voyager 1 is about [\d,]+ km from Earth/);
  });
});
