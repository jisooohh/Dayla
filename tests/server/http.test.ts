import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/server/http/app.js';
import { createStore, type Store } from '../../src/server/storage/store.js';

let store: Store;
let server: Server;
let base: string;
const network = vi.fn<typeof fetch>();
beforeEach(async () => {
  store = createStore();
  network.mockReset();
  server = createApp(store, { fetcher: network }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  if (server.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  store.close();
});
const post = (url: string, data: unknown, headers = {}) =>
  fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });

it('rejects hostile origin, Host, malformed shape and invalid timezone', async () => {
  expect(
    (await post('/api/demo/advance', { minutes: 1 }, { Origin: 'https://attacker.example' }))
      .status,
  ).toBe(403);
  // Fetch owns the Host header, so use the HTTP transport to test DNS rebinding defense.
  const hostileHost = await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(
      base + '/api/today',
      { headers: { Host: 'attacker.example' } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.once('error', reject);
    req.end();
  });
  expect(hostileHost).toBe(403);
  expect((await post('/api/demo/advance', { minutes: 999 })).status).toBe(400);
  expect((await post('/api/demo/reset', { confirm: false })).status).toBe(400);
  expect(
    (
      await fetch(base + '/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeZone: 'not-a-zone' }),
      })
    ).status,
  ).toBe(400);
  expect((await post('/api/drafts', { topic: 'hello', recipient: 'someone' })).status).toBe(400);
  expect((await post('/api/drafts', { topic: 'x'.repeat(20_000) })).status).toBe(413);
});
it('supports the complete demo flow and family drafts never use the network', async () => {
  expect((await post('/api/demo/advance', { minutes: 1 })).status).toBe(200);
  const response = await post('/api/occurrences/demo-med-0900/responses', {
    value: 'unsure',
    requestId: 'http-test',
    expectedResponseId: null,
  });
  expect(response.status).toBe(200);
  expect((await response.json()).medications[0].response.value).toBe('unsure');
  const draft = await post('/api/drafts', { topic: 'meal' });
  expect(await draft.json()).toMatchObject({ topic: 'meal', sent: false });
  expect(network).not.toHaveBeenCalled();
  expect((await (await fetch(base + '/api/today')).json()).responses).toHaveLength(1);
});
