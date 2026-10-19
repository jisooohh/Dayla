import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore, type Store } from '../../src/server/storage/store.js';
import { isQuietHour, localTime } from '../../src/server/domain/rules.js';

const stores: Store[] = [];
const dirs: string[] = [];
let wallTime = new Date('2026-10-20T00:00:00.000Z');
function setup(filename?: string) {
  wallTime = new Date('2026-10-20T00:00:00.000Z');
  const store = createStore(filename, () => wallTime);
  stores.push(store);
  return store;
}
afterEach(() => {
  stores.splice(0).forEach((store) => store.close());
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe('durable self reports', () => {
  it('requires due occurrence, preserves unknown, deduplicates retries and retains corrections', () => {
    const store = setup();
    expect(store.snapshot().medications[0].response).toBeNull();
    const request = { value: 'taken' as const, requestId: 'first', expectedResponseId: null };
    expect(() => store.respond('demo-med-0900', request)).toThrow('scheduled time');
    store.advance(1);
    const first = store.respond('demo-med-0900', request).responses[0];
    expect(store.respond('demo-med-0900', request).responses).toHaveLength(1);
    expect(() => store.respond('demo-med-0900', { ...request, value: 'unsure' })).toThrow(
      'request ID',
    );
    expect(
      store.respond('demo-med-0900', {
        ...request,
        requestId: 'same-value',
        expectedResponseId: first.id,
      }).responses,
    ).toHaveLength(1);
    expect(() =>
      store.respond('demo-med-0900', {
        value: 'not-yet',
        requestId: 'stale',
        expectedResponseId: null,
      }),
    ).toThrow('record has changed');
    wallTime = new Date('2026-10-20T00:02:00Z');
    const result = store.respond('demo-med-0900', {
      value: 'unsure',
      requestId: 'correction',
      expectedResponseId: first.id,
    });
    expect(result.responses).toHaveLength(2);
    expect(result.responses[1]).toMatchObject({
      value: 'unsure',
      supersedesId: first.id,
      recordedAt: wallTime.toISOString(),
    });
    expect(result.responses[0]).toEqual(first);
    // A late retry of an earlier successful request never overwrites a correction.
    const retried = store.respond('demo-med-0900', request);
    expect(retried.responses).toHaveLength(2);
    expect(retried.medications[0].response?.value).toBe('unsure');
  });
  it('keeps records after reopen but never replays pending cues', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dayla-'));
    dirs.push(dir);
    const file = path.join(dir, 'demo.sqlite');
    const store = setup(file);
    const cue = store.advance(1).cue!;
    store.respond('demo-med-0900', {
      value: 'not-yet',
      requestId: 'persist',
      expectedResponseId: null,
    });
    store.createDraft('meal');
    stores.splice(stores.indexOf(store), 1);
    store.close();
    const reopened = setup(file);
    expect(reopened.snapshot()).toMatchObject({
      now: '2026-10-20T00:00:00.000Z',
      cue: { id: cue.id, delivery: 'unknown' },
      medications: [{ response: { value: 'not-yet' } }],
      drafts: [{ sent: false }],
    });
    expect(() => reopened.deliver(cue.id, 'attempted', 'tab')).toThrow();
  });
});

describe('foreground cue boundaries', () => {
  it('claims once per client and gives its owner time to finish narration after the start deadline', () => {
    const store = setup();
    const cue = store.advance(1).cue!;
    expect(cue.delivery).toBe('pending');
    expect(store.snapshot().cue?.id).toBe(cue.id);
    store.deliver(cue.id, 'attempted', 'tab-a');
    expect(() => store.deliver(cue.id, 'attempted', 'tab-a')).toThrow();
    expect(() => store.deliver(cue.id, 'attempted', 'tab-b')).toThrow();
    expect(() => store.deliver(cue.id, 'played', 'tab-b')).toThrow();
    wallTime = new Date(wallTime.getTime() + 15_001);
    expect(store.snapshot().cue?.delivery).toBe('attempted');
    expect(() => store.deliver(cue.id, 'attempted', 'tab-a')).toThrow();
    expect(() => store.deliver(cue.id, 'played', 'tab-b')).toThrow();
    expect(store.deliver(cue.id, 'played', 'tab-a').cue?.delivery).toBe('played');
    expect(store.deliver(cue.id, 'played', 'tab-a').cue?.delivery).toBe('played');
  });
  it('expires pending claims at 15 seconds and attempted completion at 150 seconds after the claim', () => {
    const store = setup();
    const staleCue = store.advance(1).cue!;
    wallTime = new Date(wallTime.getTime() + 15_000);
    expect(store.snapshot().cue?.delivery).toBe('unknown');
    expect(() => store.deliver(staleCue.id, 'attempted', 'late-tab')).toThrow();
    store.resetDemo();
    const cue = store.advance(1).cue!;
    wallTime = new Date(wallTime.getTime() + 14_000);
    store.deliver(cue.id, 'attempted', 'tab-a');
    wallTime = new Date(wallTime.getTime() + 149_999);
    expect(store.snapshot().cue?.delivery).toBe('attempted');
    wallTime = new Date(wallTime.getTime() + 1);
    expect(store.snapshot().cue?.delivery).toBe('unknown');
    expect(() => store.deliver(cue.id, 'played', 'tab-a')).toThrow();
  });
  it('invalidates claimed playback immediately when settings change or the timeline resets', () => {
    const store = setup();
    const cue = store.advance(1).cue!;
    store.deliver(cue.id, 'attempted', 'tab-a');
    store.updateSettings({ hourlyEnabled: false });
    expect(() => store.deliver(cue.id, 'played', 'tab-a')).toThrow();
    store.resetDemo();
    const nextCue = store.advance(1).cue!;
    store.deliver(nextCue.id, 'attempted', 'tab-a');
    store.resetDemo();
    expect(() => store.deliver(nextCue.id, 'played', 'tab-a')).toThrow();
  });
  it('only emits for the reached hour, respects quiet time and keeps medication visible', () => {
    const store = setup();
    expect(store.advance(2).cue).toBeNull();
    store.resetDemo();
    store.updateSettings({ quietStart: 8, quietEnd: 10 });
    expect(store.advance(1).cue).toBeNull();
    expect(store.snapshot().medications).toHaveLength(1);
    expect(isQuietHour(23, 22, 7)).toBe(true);
    expect(isQuietHour(12, 22, 7)).toBe(false);
    expect(isQuietHour(12, 12, 12)).toBe(false);
    expect(localTime('2026-10-19T15:00:00Z', 'Asia/Seoul')).toEqual({ hour: 0, minute: 0 });
  });
  it('does not infer visit completion and rejects stale edits', () => {
    const store = setup();
    store.updateVisit('demo-visit', { status: 'cancelled', expectedRevision: 1 });
    expect(() =>
      store.updateVisit('demo-visit', { status: 'scheduled', expectedRevision: 1 }),
    ).toThrow();
    for (let i = 0; i < 6; i++) store.advance(120);
    expect(store.snapshot().visits[0]).toMatchObject({ status: 'cancelled', revision: 2 });
    expect(store.snapshot().medications[0].response).toBeNull();
  });
  it('creates only harmless local drafts and resets only demo records', () => {
    const store = setup();
    for (const topic of ['hello', 'meal', 'walk'] as const)
      expect(store.createDraft(topic)).toMatchObject({ topic, sent: false });
    expect(store.snapshot().drafts.every((draft) => !draft.text.includes('약'))).toBe(true);
    expect(store.resetDemo()).toMatchObject({
      responses: [],
      drafts: [],
      now: '2026-10-19T23:59:00.000Z',
    });
  });
});

describe('live daily schedule', () => {
  it('follows the real clock across dates, preserves past reports, and never catches up missed cues', () => {
    wallTime = new Date('2026-10-19T23:59:58Z');
    const store = createStore(':memory:', () => wallTime, { mode: 'live' });
    stores.push(store);
    expect(store.snapshot()).toMatchObject({
      mode: 'live',
      now: wallTime.toISOString(),
      cue: null,
    });
    const med = store.snapshot().medications[0];
    wallTime = new Date('2026-10-20T00:00:03Z');
    const cue = store.tick().cue!;
    expect(cue.delivery).toBe('pending');
    expect(cue.expiresAt).toBe('2026-10-20T00:00:15.000Z');
    store.respond(med.id, { value: 'taken', requestId: 'live', expectedResponseId: null });
    wallTime = new Date('2026-10-21T00:00:04Z');
    const tomorrow = store.tick();
    expect(tomorrow.cue?.id).toBe(cue.id);
    expect(tomorrow.cue?.delivery).toBe('unknown');
    expect(tomorrow.medications).toHaveLength(1);
    expect(tomorrow.medications[0].response).toBeNull();
    expect(tomorrow.medications[0].id).not.toBe(med.id);
    expect(tomorrow.responses).toHaveLength(1);
    store.resetDemo();
    expect(store.snapshot().responses).toHaveLength(1);
    expect(store.resumeLive().mode).toBe('live');
  });
  it('persists clock mode and records across restart without reauthorizing an hourly reminder', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dayla-live-'));
    dirs.push(dir);
    const file = path.join(dir, 'state.sqlite');
    wallTime = new Date('2026-10-19T23:59:58Z');
    const store = createStore(file, () => wallTime, { mode: 'live' });
    wallTime = new Date('2026-10-20T00:00:03Z');
    const cue = store.tick().cue!;
    const med = store.snapshot().medications[0];
    store.respond(med.id, { value: 'unsure', requestId: 'live-persist', expectedResponseId: null });
    store.deliver(cue.id, 'attempted', 'original-tab');
    store.close();
    const reopened = createStore(file, () => wallTime);
    stores.push(reopened);
    expect(reopened.tick()).toMatchObject({
      mode: 'live',
      cue: { id: cue.id, delivery: 'unknown' },
      medications: [{ response: { value: 'unsure' } }],
    });
    expect(() => reopened.deliver(cue.id, 'played', 'original-tab')).toThrow();
    expect(() => reopened.advance(1)).toThrow();
    expect(reopened.resetDemo().mode).toBe('demo');
  });
  it('uses the configured zone offset on each side of DST and avoids duplicate day cards after a zone change', () => {
    wallTime = new Date('2026-03-07T17:00:00Z');
    const store = createStore(':memory:', () => wallTime, { mode: 'live' });
    stores.push(store);
    store.updateSettings({ timeZone: 'Asia/Tokyo' });
    expect(store.snapshot().medications).toHaveLength(1);
    store.updateSettings({ timeZone: 'America/New_York' });
    expect(store.snapshot().medications.map((med) => med.scheduledAt)).toEqual([
      '2026-03-07T14:00:00.000Z',
    ]);
    wallTime = new Date('2026-03-08T17:00:00Z');
    expect(store.tick().medications[0].scheduledAt).toBe('2026-03-08T13:00:00.000Z');
    expect(store.snapshot().visits[0].startsAt).toBe('2026-03-08T19:00:00.000Z');
    wallTime = new Date('2026-11-01T17:00:00Z');
    expect(store.tick().medications[0].scheduledAt).toBe('2026-11-01T14:00:00.000Z');
    store.updateSettings({ timeZone: 'Asia/Kathmandu' });
    expect(store.snapshot().medications[0].scheduledAt).toBe('2026-11-01T03:15:00.000Z');
  });
});
