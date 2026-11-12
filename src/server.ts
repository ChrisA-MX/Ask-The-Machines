import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { buildApolloInstructions, normalizeCompletedMachineIds } from './server/chat-knowledge';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

const requestTimes = new Map<string, number[]>();
const CHAT_WINDOW_MS = 10 * 60 * 1000;
const CHAT_REQUEST_LIMIT = 20;

app.use(express.json({ limit: '4kb' }));

app.post('/chat', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const body: unknown = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Send a JSON object with a message.' });
    return;
  }

  const request = body as { message?: unknown; completedMachineIds?: unknown };
  const { message } = request;
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message must be non-empty text.' });
    return;
  }
  if (message.trim().length > 1000) {
    res.status(413).json({ error: 'Please keep your question under 1,000 characters.' });
    return;
  }

  const now = Date.now();
  const clientKey = req.ip ?? 'unknown';
  const recentRequests = (requestTimes.get(clientKey) ?? []).filter((time) => now - time < CHAT_WINDOW_MS);
  if (recentRequests.length >= CHAT_REQUEST_LIMIT) {
    res.status(429).json({ error: 'Apollo is taking a short break. Please try again in a few minutes.' });
    return;
  }
  recentRequests.push(now);
  requestTimes.set(clientKey, recentRequests);

  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    res.status(503).json({ error: 'The chat service is not configured yet.' });
    return;
  }

  const completedMachineIds = normalizeCompletedMachineIds(request.completedMachineIds);

  try {
    const model = process.env['OPENAI_MODEL'] || 'gpt-4.1-mini';
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: buildApolloInstructions(completedMachineIds),
        input: message.trim(),
        max_output_tokens: 220,
        store: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok) {
      console.error('Chat provider returned status', upstream.status);
      res.status(502).json({ error: 'Apollo could not reach the answer service. Please try again.' });
      return;
    }

    const result = await upstream.json() as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    const reply = result.output_text?.trim() || result.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === 'output_text' && item.text)
      .map((item) => item.text)
      .join('\n')
      .trim();

    if (!reply) {
      res.status(502).json({ error: 'Apollo received an empty answer. Please try again.' });
      return;
    }
    res.json({ reply });
  } catch (error) {
    console.error('Chat request failed:', error instanceof Error ? error.message : 'unknown error');
    res.status(502).json({ error: 'Apollo is temporarily unavailable. Please try again.' });
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
