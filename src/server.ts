import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { retrieveMachineStories } from './server/chat-knowledge';
import { answerWithProviderChain, ChatHistoryMessage } from './server/chat-provider';
import { ChatRateLimiter } from './server/chat-rate-limit';

try {
  process.loadEnvFile();
} catch {
  // Deployments may inject environment variables directly and omit a local .env file.
}

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

const chatRateLimiter = new ChatRateLimiter(20, 60_000);

app.use(express.json({ limit: '12kb' }));

app.post('/chat', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const body: unknown = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Send a JSON object with a message.' });
    return;
  }

  const request = body as { message?: unknown; history?: unknown; machineId?: unknown };
  const { message } = request;
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message must be non-empty text.' });
    return;
  }
  if (message.trim().length > 300) {
    res.status(413).json({ error: 'Please keep your question under 300 characters.' });
    return;
  }

  if (request.history !== undefined && !Array.isArray(request.history)) {
    res.status(400).json({ error: 'history must be a list of messages.' });
    return;
  }
  const rawHistory = Array.isArray(request.history) ? request.history : [];
  const validHistory: ChatHistoryMessage[] = [];
  for (const item of rawHistory) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      res.status(400).json({ error: 'Each history message needs a role and text.' });
      return;
    }
    const candidate = item as { role?: unknown; content?: unknown };
    if ((candidate.role !== 'user' && candidate.role !== 'assistant') || typeof candidate.content !== 'string') {
      res.status(400).json({ error: 'Each history message needs a user or assistant role and text.' });
      return;
    }
    validHistory.push({ role: candidate.role, content: candidate.content.slice(0, 1200) });
  }
  if (request.machineId !== undefined && (typeof request.machineId !== 'string' || request.machineId.length > 80)) {
    res.status(400).json({ error: 'machineId must be text.' });
    return;
  }

  const clientKey = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  if (!chatRateLimiter.allow(clientKey)) {
    res.status(429).json({
      reply: 'Apollo is helping lots of explorers right now. Please wait a minute, then try again.',
      suggestions: [],
    });
    return;
  }

  try {
    const question = message.trim();
    const history = validHistory.slice(-6);
    const retrieval = retrieveMachineStories(question, history, request.machineId as string | undefined);
    const result = await answerWithProviderChain({
      question,
      history,
      retrieval,
      nvidiaApiKey: process.env['NVIDIA_API_KEY'],
      nvidiaModel: process.env['NVIDIA_MODEL'],
      openAiApiKey: process.env['OPENAI_API_KEY'],
      openAiModel: process.env['OPENAI_MODEL'],
    });
    res.json({ reply: result.reply, suggestions: result.suggestions });
  } catch {
    console.warn('[chat] Provider chain failed unexpectedly; using the local story reply.');
    const result = await answerWithProviderChain({
      question: message.trim(),
      history: validHistory.slice(-6),
      retrieval: retrieveMachineStories(message.trim(), validHistory.slice(-6), request.machineId as string | undefined),
    });
    res.json({ reply: result.reply, suggestions: result.suggestions });
  }
});

// Return a clear client error for malformed JSON without exposing server details.
app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: 'Please send valid JSON.' });
    return;
  }
  next(error);
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
