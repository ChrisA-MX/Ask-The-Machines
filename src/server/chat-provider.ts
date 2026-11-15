import { buildApolloInstructions, buildLocalFallback, MachineRetrieval } from './chat-knowledge';

export type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string };
export interface ChatProviderResult { reply: string; suggestions: string[]; provider: 'nvidia' | 'openai' | 'local' }
export interface ChatProviderOptions {
  question: string;
  history: readonly ChatHistoryMessage[];
  retrieval: MachineRetrieval;
  nvidiaApiKey?: string;
  nvidiaModel?: string;
  openAiApiKey?: string;
  openAiModel?: string;
  fetcher?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
}

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_NVIDIA_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function cleanAssistantText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, '')
    .replace(/<\/?think\b[^>]*>/gi, '')
    .trim();
}

function shortStatusMessage(status: number): string {
  if (status === 429) return 'rate limited';
  if (status >= 500) return 'provider unavailable';
  if (status === 400) return 'request rejected';
  if (status === 401 || status === 403) return 'authentication rejected';
  return 'provider request failed';
}

async function requestWithTimeout(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  return fetcher(url, { ...init, signal: AbortSignal.timeout(15_000) });
}

async function requestNvidia(options: ChatProviderOptions, systemPrompt: string): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const messages = [
    { role: 'system', content: systemPrompt },
    ...options.history.slice(-6).map(({ role, content }) => ({ role, content })),
    { role: 'user', content: options.question },
  ];
  const makeBody = (withTemplate: boolean) => ({
    model: options.nvidiaModel || DEFAULT_NVIDIA_MODEL,
    stream: false,
    temperature: 0.3,
    top_p: 0.95,
    max_tokens: 350,
    messages,
    ...(withTemplate ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  });

  let templateRejected = false;
  let retryableAttempt = 0;
  while (retryableAttempt < 2) {
    let response: Response;
    try {
      response = await requestWithTimeout(fetcher, NVIDIA_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.nvidiaApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(makeBody(!templateRejected)),
      });
    } catch (error) {
      console.warn('[chat] NVIDIA request timed out or failed:', error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network error');
      return '';
    }

    if (response.status === 400 && !templateRejected) {
      templateRejected = true;
      console.warn('[chat] NVIDIA rejected chat_template_kwargs (400); retrying once without it.');
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && retryableAttempt === 0) {
      console.warn(`[chat] NVIDIA returned HTTP ${response.status}: ${shortStatusMessage(response.status)}; retrying once.`);
      retryableAttempt++;
      await (options.wait ?? wait)(250);
      continue;
    }
    if (!response.ok) {
      console.warn(`[chat] NVIDIA returned HTTP ${response.status}: ${shortStatusMessage(response.status)}.`);
      return '';
    }
    try {
      const result = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      return cleanAssistantText(result.choices?.[0]?.message?.content);
    } catch {
      console.warn('[chat] NVIDIA returned an unreadable response.');
      return '';
    }
  }
  return '';
}

async function requestOpenAi(options: ChatProviderOptions, systemPrompt: string): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const input = [
    ...options.history.slice(-6),
    { role: 'user' as const, content: options.question },
  ].map(({ role, content }) => ({
    role,
    content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: content }],
  }));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await requestWithTimeout(fetcher, OPENAI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.openAiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.openAiModel || 'gpt-4.1-mini',
          instructions: systemPrompt,
          input,
          max_output_tokens: 350,
          store: false,
        }),
      });
      if ((response.status === 429 || response.status >= 500) && attempt === 0) {
        console.warn(`[chat] OpenAI returned HTTP ${response.status}: ${shortStatusMessage(response.status)}; retrying once.`);
        await (options.wait ?? wait)(250);
        continue;
      }
      if (!response.ok) {
        console.warn(`[chat] OpenAI returned HTTP ${response.status}: ${shortStatusMessage(response.status)}.`);
        return '';
      }
      const result = await response.json() as {
        output_text?: unknown;
        output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
      };
      const responseText = typeof result.output_text === 'string' ? result.output_text : result.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
        .map((item) => item.text as string).join('\n');
      return cleanAssistantText(responseText);
    } catch (error) {
      console.warn('[chat] OpenAI request timed out or failed:', error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network error');
      return '';
    }
  }
  return '';
}

export async function answerWithProviderChain(options: ChatProviderOptions): Promise<ChatProviderResult> {
  const systemPrompt = buildApolloInstructions(options.retrieval);
  const machineSuggestions = options.retrieval.best ? [
    `What did ${options.retrieval.best.name} find?`,
    `Is ${options.retrieval.best.name} still working?`,
    `How did ${options.retrieval.best.name} work?`,
  ] : [];

  const requestContext = [options.question, ...options.history.filter((message) => message.role === 'user').slice(-2).map((message) => message.content)].join(' ');
  const mentionsVoyager = options.retrieval.selected.some((machine) => machine.id === 'voyager-1' || machine.id === 'voyager-2')
    || /voyager\s*[12]?/i.test(requestContext);
  if (mentionsVoyager && /\b(how far|distance|miles|kilometers|kilometres)\b/i.test(requestContext)) {
    return {
      reply: "A Voyager spacecraft's distance from Earth changes every day. Check NASA's Voyager mission status page for today's distance: https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/",
      suggestions: machineSuggestions,
      provider: 'local',
    };
  }

  if (options.nvidiaApiKey) {
    const reply = await requestNvidia(options, systemPrompt);
    if (reply) return { reply, suggestions: machineSuggestions, provider: 'nvidia' };
  }
  if (options.openAiApiKey) {
    const reply = await requestOpenAi(options, systemPrompt);
    if (reply) return { reply, suggestions: machineSuggestions, provider: 'openai' };
  }
  const fallback = buildLocalFallback(options.retrieval);
  return {
    reply: fallback.reply,
    suggestions: fallback.suggestions.length ? fallback.suggestions : machineSuggestions,
    provider: 'local',
  };
}

export const chatProviderDefaults = { nvidiaModel: DEFAULT_NVIDIA_MODEL };
