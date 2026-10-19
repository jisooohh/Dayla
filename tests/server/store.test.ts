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
    expect(() => store.respond('demo-med-0900', request)).toThrow('예정 시간');
    store.advance(1);
    const first = store.respond('demo-med-0900', request).responses[0];
    expect(store.respond('demo-med-0900', request).responses).toHaveLength(1);
    expect(() => store.respond('demo-med-0900', { ...request, value: 'unsure' })).toThrow(
      '요청 ID',
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
    ).toThrow('기록이 변경');
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
  it('claims once per client and expires against actual time while demo clock is paused', () => {
    const store = setup();
    const cue = store.advance(1).cue!;
    expect(cue.delivery).toBe('pending');
    expect(store.snapshot().cue?.id).toBe(cue.id);
    store.deliver(cue.id, 'attempted', 'tab-a');
    expect(() => store.deliver(cue.id, 'attempted', 'tab-a')).toThrow();
    expect(() => store.deliver(cue.id, 'attempted', 'tab-b')).toThrow();
    expect(() => store.deliver(cue.id, 'played', 'tab-b')).toThrow();
    wallTime = new Date(wallTime.getTime() + 15_001);
    expect(store.snapshot().cue?.delivery).toBe('unknown');
    expect(() => store.deliver(cue.id, 'played', 'tab-a')).toThrow();
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
