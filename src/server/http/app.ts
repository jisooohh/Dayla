import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { DomainError, supportsTimeZone } from '../domain/rules.js';
import { createNewsService } from '../services/news.js';
import { createVoiceService } from '../services/voice.js';
import { createConversationService } from '../services/conversation.js';
import type { Store } from '../storage/store.js';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
function localUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      loopbackHosts.has(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
const settingsSchema = z
  .object({
    timeZone: z.string().max(100).refine(supportsTimeZone),
    hourlyEnabled: z.boolean(),
    quietStart: z.number().int().min(0).max(23),
    quietEnd: z.number().int().min(0).max(23),
    speechRate: z.number().min(0.5).max(1.5),
    speechVolume: z.number().min(0).max(1),
    largeText: z.boolean(),
  })
  .partial()
  .strict();
const responseSchema = z
  .object({
    value: z.enum(['taken', 'not-yet', 'unsure']),
    requestId: z.string().min(1).max(128),
    expectedResponseId: z.number().int().positive().nullable(),
  })
  .strict();
const visitSchema = z
  .object({
    status: z.enum(['scheduled', 'changed', 'cancelled']),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    expectedRevision: z.number().int().positive(),
  })
  .strict();
const deliverySchema = z
  .object({
    status: z.enum(['attempted', 'played', 'failed', 'unknown']),
    clientId: z.string().min(1).max(128),
  })
  .strict();

export function createApp(
  store: Store,
  options: {
    fetcher?: typeof fetch;
    staticDir?: string;
    voiceService?: ReturnType<typeof createVoiceService>;
  } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    if (!localUrl(`http://${req.headers.host ?? ''}`))
      return res.status(403).json({ error: 'Dayla is available only on this computer.' });
    if (req.headers.origin && !localUrl(req.headers.origin))
      return res.status(403).json({ error: 'This request origin is not allowed.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!req.is('application/json') || req.headers['sec-fetch-site'] === 'cross-site')
        return res.status(403).json({ error: 'Only local JSON requests are allowed.' });
    }
    next();
  });
  app.post('/api/voice/transcribe', express.json({ limit: '6mb', strict: true }));
  app.use(express.json({ limit: '16kb', strict: true }));
  const news = createNewsService(store, options.fetcher);
  const voice = options.voiceService ?? createVoiceService(process.env, options.fetcher);
  const conversation = createConversationService(store);
  let voiceInFlight = false;
  async function voiceOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (voiceInFlight)
      throw new DomainError(
        'Dayla is already processing a voice request. Please wait a moment.',
        429,
      );
    voiceInFlight = true;
    try {
      return await operation();
    } finally {
      voiceInFlight = false;
    }
  }
  const route =
    (handler: RequestHandler): RequestHandler =>
    (req, res, next) => {
      try {
        Promise.resolve(handler(req, res, next)).catch(next);
      } catch (error) {
        next(error);
      }
    };
  app.get('/api/status', (_req, res) =>
    res.json({
      ok: true,
      mode: store.mode,
      serverTime: store.actualNow(),
      schedulerRunning: store.schedulerRunning,
    }),
  );
  app.get(
    '/api/today',
    route((_req, res) => {
      res.json(store.tick());
    }),
  );
  app.get('/api/voice/status', (_req, res) => res.json(voice.status()));
  app.post(
    '/api/voice/speak',
    route(async (req, res) => {
      const { text } = z
        .object({ text: z.string().trim().min(1).max(1500) })
        .strict()
        .parse(req.body);
      const audio = await voiceOperation(() => voice.synthesize(text));
      res.type('audio/mpeg').send(Buffer.from(audio));
    }),
  );
  app.post(
    '/api/voice/transcribe',
    route(async (req, res) => {
      const { audio: audioBase64, mime } = z
        .object({
          audio: z
            .string()
            .min(4)
            .max(4 * Math.ceil((4 * 1024 * 1024) / 3))
            .regex(/^[A-Za-z0-9+/]*={0,2}$/)
            .refine((value) => value.length % 4 === 0),
          mime: z
            .string()
            .regex(/^audio\/(?:webm|ogg|mp4|wav|mpeg)(?:;codecs=(?:opus|pcm|mp4a\.40\.2))?$/),
        })
        .strict()
        .parse(req.body);
      const audio = Buffer.from(audioBase64, 'base64');
      if (
        !audio.length ||
        audio.length > 4 * 1024 * 1024 ||
        audio.toString('base64') !== audioBase64
      ) {
        throw new DomainError('Please use a valid recording of up to 4 MB.');
      }
      const text = await voiceOperation(() => voice.transcribe(audio, mime));
      res.json({ text });
    }),
  );
  app.post(
    '/api/conversation',
    route((req, res) => {
      const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
      const input = z
        .object({ text: z.string().trim().min(1).max(1000), sessionId: id, requestId: id })
        .strict()
        .parse(req.body);
      store.tick();
      res.json(conversation.reply(input));
    }),
  );
  app.post(
    '/api/clock/live',
    route((req, res) => {
      z.object({ confirm: z.literal(true) })
        .strict()
        .parse(req.body);
      res.json(store.resumeLive());
    }),
  );
  app.put(
    '/api/settings',
    route((req, res) => {
      res.json(store.updateSettings(settingsSchema.parse(req.body)));
    }),
  );
  app.post(
    '/api/demo/advance',
    route((req, res) => {
      const { minutes } = z
        .object({ minutes: z.number().int().min(1).max(120) })
        .strict()
        .parse(req.body);
      res.json(store.advance(minutes));
    }),
  );
  app.post(
    '/api/demo/reset',
    route((req, res) => {
      z.object({ confirm: z.literal(true) })
        .strict()
        .parse(req.body);
      res.json(store.resetDemo());
    }),
  );
  app.post(
    '/api/occurrences/:id/responses',
    route((req, res) => {
      res.json(store.respond(String(req.params.id), responseSchema.parse(req.body)));
    }),
  );
  app.patch(
    '/api/visits/:id',
    route((req, res) => {
      res.json(store.updateVisit(String(req.params.id), visitSchema.parse(req.body)));
    }),
  );
  app.post(
    '/api/cues/:id/delivery',
    route((req, res) => {
      const { status, clientId } = deliverySchema.parse(req.body);
      res.json(store.deliver(String(req.params.id), status, clientId));
    }),
  );
  app.get(
    '/api/news',
    route(async (_req, res) => {
      res.json(await news.get());
    }),
  );
  app.post(
    '/api/drafts',
    route((req, res) => {
      const { topic } = z
        .object({ topic: z.enum(['hello', 'meal', 'walk']) })
        .strict()
        .parse(req.body);
      res.json(store.createDraft(topic));
    }),
  );
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: 'This feature could not be found.' }),
  );
  if (options.staticDir) {
    const directory = path.resolve(options.staticDir);
    app.use(express.static(directory));
    app.get(/.*/, (req, res, next) => {
      if (!req.accepts('html') || path.extname(req.path)) return next();
      res.sendFile(path.join(directory, 'index.html'));
    });
  }
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof DomainError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      res.status(400).json({ error: 'Please check your input and try again.' });
      return;
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      res.status(413).json({ error: 'The request is too large.' });
      return;
    }
    res.status(500).json({
      error: 'Dayla could not complete this request. Please check your connection and try again.',
    });
  };
  app.use(errors);
  return app;
}
