import { afterEach, describe, expect, it } from 'vitest';
import { createStore, type Store } from '../../src/server/storage/store.js';
import { createConversationService } from '../../src/server/services/conversation.js';

const stores: Store[] = [];
function setup() {
  let now = new Date('2026-10-20T00:00:00Z');
  const store = createStore(':memory:', () => now);
  stores.push(store);
  store.advance(1);
  const service = createConversationService(store);
  let count = 0;
  const say = (text: string, sessionId = 'a', requestId = `r${++count}`) =>
    service.reply({ text, sessionId, requestId });
  return {
    store,
    say,
    elapse: (milliseconds: number) => {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}
afterEach(() => stores.splice(0).forEach((store) => store.close()));

describe('bounded voice conversation', () => {
  it('records an explicit current self-report only after confirmation and deduplicates retries', () => {
    const { store, say } = setup();
    expect(say('I took my medication.', 'a', 'propose').confirmation?.value).toBe('taken');
    expect(store.snapshot().responses).toHaveLength(0);
    const result = say('yes', 'a', 'confirm');
    expect(result.action).toBe('recorded');
    expect(say('yes', 'a', 'confirm')).toEqual(result);
    expect(store.snapshot().responses).toHaveLength(1);
    expect(() => say('no', 'a', 'confirm')).toThrow('request ID');
  });
  it('never interprets negative, past, or uncertain speech as a taken report', () => {
    const { store, say } = setup();
    expect(say("I haven't taken my medication yet").confirmation?.value).toBe('not-yet');
    say('yes');
    expect(store.snapshot().medications[0].response?.value).toBe('not-yet');
    expect(say("I don't know if I took my medication").confirmation?.value).toBe('unsure');
    say('yes');
    expect(store.snapshot().medications[0].response?.value).toBe('unsure');
    for (const text of [
      'I took my medication yesterday',
      'I think I took my medication',
      "I didn't say I took my medication",
      'I took my medication, or maybe I did not',
    ]) {
      expect(say(text).confirmation).toBeUndefined();
      expect(say('yes').action).toBeUndefined();
    }
    expect(store.snapshot().responses).toHaveLength(2);
  });
  it('requires a pending confirmation in the same session and rejects stale concurrent reports', () => {
    const { store, say } = setup();
    expect(say('yes').action).toBeUndefined();
    say('I took my medication', 'a');
    expect(say('yes', 'b').action).toBeUndefined();
    say('not yet', 'b');
    say('yes', 'b');
    expect(() => say('yes', 'a')).toThrow('record has changed');
    expect(store.snapshot().responses).toHaveLength(1);
    expect(store.snapshot().medications[0].response?.value).toBe('not-yet');
  });
  it('expires, cancels, and clears confirmations when the subject changes', () => {
    const { store, say, elapse } = setup();
    say('I took my medication');
    elapse(120_001);
    expect(say('yes').action).toBeUndefined();
    say('I took my medication');
    expect(say('no').action).toBe('cancelled');
    expect(say('yes').action).toBeUndefined();
    say('I took my medication');
    expect(say('What time is it?').text).toContain('9:00 AM');
    expect(say('yes').action).toBeUndefined();
    expect(store.snapshot().responses).toHaveLength(0);
  });
  it('responds to simple feelings without changing records', () => {
    const { store, say } = setup();
    expect(say("I'm lonely").text).toContain('here with you');
    expect(say("I'm tired").text).toContain('at your pace');
    expect(say("I'm feeling good today").text).toContain('lovely');
    expect(store.snapshot().responses).toHaveLength(0);
    expect(store.snapshot().drafts).toHaveLength(0);
  });
  it('summarizes plans, saves an unsent draft once, and gives honest unsupported responses', () => {
    const { store, say } = setup();
    expect(say('Who is visiting today?').text).toContain('3:00 PM');
    expect(say('Draft a family message', 'a', 'draft').action).toBe('draft');
    say('Draft a family message', 'a', 'draft');
    expect(store.snapshot().drafts).toHaveLength(1);
    expect(store.snapshot().drafts[0].sent).toBe(false);
    expect(say('Send my family a message').action).toBeUndefined();
    expect(say('Should I take an extra dose?').text).toContain('cannot advise');
    expect(say('What is the weather?').text).toContain('do not have live weather');
    expect(say('Write an essay about the moon').text).toContain('I can help with');
  });
});
