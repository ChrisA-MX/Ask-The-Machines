import { buildLocalFallback, retrieveMachineStories } from './chat-knowledge';
import { answerWithProviderChain, cleanAssistantText } from './chat-provider';

function retrieval(question = 'What did Opportunity find?') {
  return retrieveMachineStories(question);
}

describe('Apollo provider chain', () => {
  it('sends a text-only NVIDIA request with bounded generation settings and disables thinking', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Opportunity found signs of past water.' } }],
    }), { status: 200 }));
    const history = [{ role: 'user' as const, content: 'Tell me about Opportunity.' }];
    const response = await answerWithProviderChain({
      question: 'What did it find?', history, retrieval: retrieval(), nvidiaApiKey: 'test-key', fetcher,
    });
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(response.provider).toBe('nvidia');
    expect(request.model).toBe('nvidia/nemotron-3-nano-omni-30b-a3b-reasoning');
    expect(request.stream).toBe(false);
    expect(request.temperature).toBe(0.3);
    expect(request.top_p).toBe(0.95);
    expect(request.max_tokens).toBe(350);
    expect(request.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(request.messages.at(-2)).toEqual({ role: 'user', content: history[0].content });
    expect(request.messages.at(-1)).toEqual({ role: 'user', content: 'What did it find?' });
    expect(request.messages.every((message: { content: unknown }) => typeof message.content === 'string')).toBe(true);
  });

  it('removes hidden think blocks and never uses reasoning_content', async () => {
    expect(cleanAssistantText('<think>private chain</think>Public answer')).toBe('Public answer');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '<think>do not show</think>Safe reply', reasoning_content: 'hidden' } }],
    }), { status: 200 }));
    const response = await answerWithProviderChain({
      question: 'What did Opportunity find?', history: [], retrieval: retrieval(), nvidiaApiKey: 'test-key', fetcher,
    });
    expect(response.reply).toBe('Safe reply');
  });

  it('falls through empty NVIDIA content to the local story answer when there is no OpenAI key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '  ' } }],
    }), { status: 200 }));
    const found = retrieval();
    const response = await answerWithProviderChain({
      question: 'What did Opportunity find?', history: [], retrieval: found, nvidiaApiKey: 'test-key', fetcher,
    });
    expect(response.provider).toBe('local');
    expect(response.reply).toBe(buildLocalFallback(found).reply);
  });

  it('retries a 400 once without chat_template_kwargs', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'Grounded answer.' } }] }), { status: 200 }));
    const response = await answerWithProviderChain({
      question: 'What did Opportunity find?', history: [], retrieval: retrieval(), nvidiaApiKey: 'test-key', fetcher,
    });
    expect(response.provider).toBe('nvidia');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).not.toHaveProperty('chat_template_kwargs');
  });

  it('tries NVIDIA, retries a 5xx once, then uses OpenAI before local fallback', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: 'OpenAI story answer.' }), { status: 200 }));
    const response = await answerWithProviderChain({
      question: 'What did Opportunity find?', history: [], retrieval: retrieval(),
      nvidiaApiKey: 'nvidia-test', openAiApiKey: 'openai-test', fetcher, wait: async () => undefined,
    });
    expect(response.provider).toBe('openai');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://integrate.api.nvidia.com/v1/chat/completions',
      'https://integrate.api.nvidia.com/v1/chat/completions',
      'https://api.openai.com/v1/responses',
    ]);
  });

  it('never guesses Voyager current distance and points to the official status page', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await answerWithProviderChain({
      question: 'How far is Voyager 1 right now?', history: [],
      retrieval: retrieveMachineStories('How far is Voyager 1 right now?'),
      nvidiaApiKey: 'test-key', fetcher,
    });
    expect(response.provider).toBe('local');
    expect(response.reply).toContain('changes every day');
    expect(response.reply).toContain('science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/');
    expect(response.reply).not.toMatch(/\b\d+\s*(miles|kilometers|kilometres|km)\b/i);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
