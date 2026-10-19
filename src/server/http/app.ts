import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { DomainError, supportsTimeZone } from '../domain/rules.js';
import { createNewsService } from '../services/news.js';
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
  options: { fetcher?: typeof fetch; staticDir?: string } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    if (!localUrl(`http://${req.headers.host ?? ''}`))
      return res.status(403).json({ error: '로컬 PC에서만 사용할 수 있어요.' });
    if (req.headers.origin && !localUrl(req.headers.origin))
      return res.status(403).json({ error: '허용되지 않은 요청 출처예요.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!req.is('application/json') || req.headers['sec-fetch-site'] === 'cross-site')
        return res.status(403).json({ error: '로컬 JSON 요청만 허용해요.' });
    }
    next();
  });
  app.use(express.json({ limit: '16kb', strict: true }));
  const news = createNewsService(store, options.fetcher);
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
      mode: 'demo',
      serverTime: store.actualNow(),
      schedulerRunning: store.schedulerRunning,
    }),
  );
  app.get(
    '/api/today',
    route((_req, res) => {
      res.json(store.snapshot());
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
  app.use('/api', (_req, res) => res.status(404).json({ error: '요청한 기능을 찾을 수 없어요.' }));
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
      res.status(400).json({ error: '입력 내용을 확인해주세요.' });
      return;
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      res.status(413).json({ error: '요청이 너무 커요.' });
      return;
    }
    res
      .status(500)
      .json({ error: '저장 또는 처리하지 못했어요. 연결을 확인하고 다시 시도해주세요.' });
  };
  app.use(errors);
  return app;
}
