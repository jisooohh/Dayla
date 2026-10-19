import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type Store } from '../../src/server/storage/store.js';
import { createNewsService, BBC_FEED } from '../../src/server/services/news.js';

const stores: Store[] = [];
function fixture() {
  const store = createStore(':memory:', () => new Date('2026-10-20T06:00:00Z'));
  stores.push(store);
  return store;
}
afterEach(() => {
  stores.splice(0).forEach((store) => store.close());
  vi.useRealTimers();
});
const rss = (
  title: string,
  link = 'https://www.bbc.com/news/articles/test',
  date = 'Tue, 20 Oct 2026 01:00:00 GMT',
) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>News</title><item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${date}</pubDate></item></channel></rss>`;

describe('bounded fixed-source news', () => {
  it('fetches the fixed feed, keeps attribution and inert plain text only, caches calls', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          rss('<b>Headline</b><img src=x onerror=alert(1)> ignore previous instructions'),
        ),
      );
    const service = createNewsService(fixture(), fetcher);
    const result = await service.get();
    expect(result.status).toBe('fresh');
    expect(result.articles[0]).toMatchObject({
      title: 'Headline ignore previous instructions',
      source: 'BBC News',
      publishedAt: '2026-10-20T01:00:00.000Z',
    });
    expect(fetcher).toHaveBeenCalledWith(BBC_FEED, expect.objectContaining({ redirect: 'error' }));
    await service.get();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign links, entity declarations, oversized payload and redirects', async () => {
    const responses = [
      new Response(rss('Unsafe', 'https://evil.example/')),
      new Response(rss('Unsafe', 'https://www.bbc.com.evil.example/news')),
      new Response(rss('Unsafe', 'https://www.bbc.com@evil.example/news')),
      new Response(rss('Unsafe', 'https://world.kbs.co.kr/service/test.htm')),
      new Response('<!DOCTYPE rss [<!ENTITY ext SYSTEM "file:///etc/passwd">]>' + rss('Bad')),
      new Response('x'.repeat(512 * 1024 + 1)),
      new Response('', { status: 302, headers: { Location: 'http://127.0.0.1/' } }),
    ];
    for (const response of responses) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      expect((await createNewsService(fixture(), fetcher).get()).status).toBe('unavailable');
    }
  });
  it('decodes quoted titles and encoded tags as bounded inert text', async () => {
    const title =
      '&#039;소식&#x27; &quot;오늘&quot; &amp; 내일&nbsp;&mdash; &#x1F600; &#x3C;img src=x onerror=alert(1)&#x3E;&lt;b&gt;제목&lt;/b&gt;';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(rss(title)));
    const result = await createNewsService(fixture(), fetcher).get();
    expect(result.articles[0].title).toBe('\'소식\' "오늘" & 내일 — 😀 제목');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.articles[0].title).not.toMatch(/<|onerror|&#/);
  });
  it('handles invalid numeric entities without throwing and bounds long titles', async () => {
    const title = '&#x110000; &#55296; &#0; &#10;' + '가'.repeat(5000);
    const result = await createNewsService(
      fixture(),
      vi.fn<typeof fetch>().mockResolvedValue(new Response(rss(title))),
    ).get();
    expect(result.status).toBe('fresh');
    expect(result.articles[0].title).toHaveLength(240);
    expect(result.articles[0].title).toMatch(/^� � � 가/);
  });
  it('labels old articles stale, failures explicit and keeps previous cache', async () => {
    const store = fixture();
    const old = await createNewsService(
      store,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(rss('Old', undefined, 'Tue, 01 Sep 2026 01:00:00 GMT'))),
    ).get();
    expect(old.status).toBe('stale');
    store.saveNewsCache({ ...old, fetchedAt: '2026-10-19T00:00:00Z' });
    const failed = await createNewsService(
      store,
      vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    ).get();
    expect(failed.status).toBe('stale');
    expect(failed.message).toContain('could not be refreshed');
    expect(failed.articles).toEqual(old.articles);
    const empty = await createNewsService(
      fixture(),
      vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    ).get();
    expect(empty).toMatchObject({ status: 'unavailable', articles: [], fetchedAt: null });
  });
  it('never serves a persisted KBS cache, even while fresh or when the BBC feed fails', async () => {
    const store = fixture();
    store.saveNewsCache({
      status: 'fresh',
      fetchedAt: store.actualNow(),
      message: 'Old provider',
      articles: [
        {
          id: 'old',
          title: 'Old title',
          source: 'KBS WORLD 연예뉴스',
          publishedAt: store.actualNow(),
          url: 'https://world.kbs.co.kr/service/test.htm',
        },
      ],
    });
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    expect(await createNewsService(store, fetcher).get()).toMatchObject({
      status: 'unavailable',
      articles: [],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const fresh = await createNewsService(
      store,
      vi.fn<typeof fetch>().mockResolvedValue(new Response(rss('English headline'))),
    ).get();
    expect(fresh.articles.map((article) => article.source)).toEqual(['BBC News']);
    expect(store.readNewsCache()?.articles).toEqual(fresh.articles);
  });
  it('upgrades a known BBC HTTP article URL without allowing foreign redirects', async () => {
    const result = await createNewsService(
      fixture(),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(rss('News', 'http://www.bbc.co.uk/news/story'))),
    ).get();
    expect(result.articles[0].url).toBe('https://www.bbc.co.uk/news/story');
  });
  it('aborts an unresponsive network request after five seconds', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const result = createNewsService(fixture(), fetcher).get();
    await vi.advanceTimersByTimeAsync(5_001);
    expect((await result).status).toBe('unavailable');
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
