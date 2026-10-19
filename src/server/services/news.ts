import Parser from 'rss-parser';
import { createHash } from 'node:crypto';
import type { NewsArticle, NewsResult } from '../../shared/contracts.js';
import type { Store } from '../storage/store.js';

// BBC News publishes this English headline feed.
// Use the HTTPS endpoint only; no redirect or caller-selected URL is accepted.
export const BBC_FEED = 'https://feeds.bbci.co.uk/news/rss.xml';
const ARTICLE_HOSTS = new Set([
  'www.bbc.co.uk',
  'www.bbc.com',
  'bbc.co.uk',
  'bbc.com',
  'news.bbc.co.uk',
]);
const MAX_BYTES = 512 * 1024;
const CACHE_TTL = 5 * 60_000;
const ARTICLE_MAX_AGE = 72 * 60 * 60_000;
const TITLE_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  middot: '·',
  copy: '©',
  reg: '®',
};

function plainText(value: string): string {
  const decoded = value
    .slice(0, 4096)
    .replace(
      /&(#x[0-9a-f]{1,8}|#[0-9]{1,10}|amp|quot|apos|lt|gt|nbsp|lsquo|rsquo|ldquo|rdquo|ndash|mdash|hellip|middot|copy|reg);/gi,
      (_match, entity: string) => {
        if (!entity.startsWith('#')) return TITLE_ENTITIES[entity.toLowerCase()];
        const hex = entity[1].toLowerCase() === 'x';
        const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return codePoint > 0 &&
          codePoint <= 0x10ffff &&
          !(codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? String.fromCodePoint(codePoint)
          : '\ufffd';
      },
    );
  return (
    decoded
      .replace(/<[^>]*>/g, ' ')
      // eslint-disable-next-line no-control-regex -- Remove control bytes from untrusted feed text.
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240)
  );
}

export function createNewsService(store: Store, fetcher: typeof fetch = fetch) {
  let inflight: Promise<NewsResult> | undefined;
  let lastAttempt = 0;
  let lastResult: NewsResult | undefined;
  const parser = new Parser();
  async function refresh(): Promise<NewsResult> {
    const now = Date.parse(store.actualNow());
    const storedCache = store.readNewsCache();
    // A provider change must not surface previously persisted KBS headlines.
    const cache =
      storedCache?.articles.length &&
      storedCache.articles.every((article) => {
        try {
          const url = new URL(article.url);
          return (
            article.source === 'BBC News' &&
            ARTICLE_HOSTS.has(url.hostname) &&
            url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            !url.port
          );
        } catch {
          return false;
        }
      })
        ? storedCache
        : null;
    if (
      cache?.fetchedAt &&
      now - Date.parse(cache.fetchedAt) < CACHE_TTL &&
      now >= Date.parse(cache.fetchedAt)
    )
      return cache;
    if (lastResult && now - lastAttempt < 30_000) return lastResult;
    lastAttempt = now;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetcher(BBC_FEED, {
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      });
      if (!response.ok || response.redirected || (response.url && response.url !== BBC_FEED))
        throw new Error('Feed unavailable');
      if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES || !response.body)
        throw new Error('Feed size');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) {
            await reader.cancel();
            throw new Error('Feed size');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const xml = Buffer.concat(chunks).toString('utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsupported XML');
      const feed = await parser.parseString(xml);
      const articles: NewsArticle[] = [];
      for (const item of feed.items) {
        if (!item.title || !item.link || !(item.isoDate || item.pubDate)) continue;
        let url: URL;
        try {
          url = new URL(item.link);
        } catch {
          continue;
        }
        // Feed links sometimes use HTTP; upgrade the known first-party host only.
        if (!ARTICLE_HOSTS.has(url.hostname) || url.username || url.password || url.port) continue;
        if (!['http:', 'https:'].includes(url.protocol)) continue;
        url.protocol = 'https:';
        const published = Date.parse(item.isoDate || item.pubDate!);
        if (!Number.isFinite(published) || published > now + 5 * 60_000) continue;
        const title = plainText(item.title);
        if (!title || articles.some((article) => article.url === url.href)) continue;
        articles.push({
          id: createHash('sha256').update(url.href).digest('hex').slice(0, 16),
          title,
          source: 'BBC News',
          publishedAt: new Date(published).toISOString(),
          url: url.href,
        });
      }
      articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      const selected = articles.slice(0, 3);
      if (!selected.length) throw new Error('No eligible items');
      const stale = selected.some(
        (article) => now - Date.parse(article.publishedAt) > ARTICLE_MAX_AGE,
      );
      const result: NewsResult = {
        status: stale ? 'stale' : 'fresh',
        fetchedAt: store.actualNow(),
        articles: selected,
        message: stale
          ? 'Some headlines are more than three days old. Please check their publication dates.'
          : 'Headlines from BBC News.',
      };
      store.saveNewsCache(result);
      lastResult = result;
      return result;
    } catch {
      lastResult = cache
        ? {
            ...cache,
            status: 'stale',
            message: 'News could not be refreshed. These are previously saved headlines.',
          }
        : {
            status: 'unavailable',
            fetchedAt: null,
            articles: [],
            message: 'News is unavailable right now. You can still use the other features.',
          };
      return lastResult;
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    get(): Promise<NewsResult> {
      inflight ??= refresh().finally(() => {
        inflight = undefined;
      });
      return inflight;
    },
  };
}
