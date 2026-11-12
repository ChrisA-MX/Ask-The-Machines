import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ChatService } from './chat.service';
import { ProgressService } from './progress.service';

describe('ChatService', () => {
  let service: ChatService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ChatService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ProgressService,
          useValue: { completedMachineIds: signal(['apollo-lm', 'opportunity']) },
        },
      ],
    });
    service = TestBed.inject(ChatService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only the question and completed machine IDs, not profile data', async () => {
    const resultPromise = service.ask('What happened at Tranquility Base?');
    const request = http.expectOne('/chat');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      message: 'What happened at Tranquility Base?',
      completedMachineIds: ['apollo-lm', 'opportunity'],
    });
    request.flush({ reply: 'The descent stage remained on the Moon.' });

    await expect(resultPromise).resolves.toEqual({
      reply: 'The descent stage remained on the Moon.',
      succeeded: true,
    });
  });
});
