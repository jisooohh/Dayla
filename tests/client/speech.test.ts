import { afterEach, describe, expect, it, vi } from 'vitest';
import { localEnglishVoices, startLocalPlayback } from '../../src/client/lib/speech';

const local = {
  localService: true,
  lang: 'en-US',
  voiceURI: 'local-en',
  name: 'English',
} as SpeechSynthesisVoice;
function fixture() {
  const utterance = {} as SpeechSynthesisUtterance;
  const synthesis = { speak: vi.fn(), cancel: vi.fn() } as unknown as SpeechSynthesis;
  return { utterance, synthesis, make: () => utterance };
}
afterEach(() => vi.useRealTimers());

describe('local speech boundary', () => {
  it('never selects a remote or non-English voice', () => {
    expect(
      localEnglishVoices([local, { ...local, localService: false }, { ...local, lang: 'ko-KR' }]),
    ).toEqual([local]);
  });
  it('rejects remote voices without calling the synthesis engine', async () => {
    const { synthesis, make } = fixture();
    const playback = startLocalPlayback(
      'Hello there.',
      { ...local, localService: false },
      1,
      1,
      synthesis,
      make,
    );
    expect(await playback.result).toBe('failed');
    expect(synthesis.speak).not.toHaveBeenCalled();
  });
  it('only reports played after the browser reports an end event', async () => {
    const { synthesis, make, utterance } = fixture();
    const playback = startLocalPlayback('Hello there.', local, 9, -2, synthesis, make);
    expect(utterance.rate).toBe(1.5);
    expect(utterance.volume).toBe(0);
    utterance.onend?.call(utterance, {} as SpeechSynthesisEvent);
    expect(await playback.result).toBe('played');
  });
  it('marks cancel and missing end acknowledgement unknown', async () => {
    vi.useFakeTimers();
    const { synthesis, make } = fixture();
    const canceled = startLocalPlayback('Hello there.', local, 1, 1, synthesis, make);
    canceled.cancel();
    expect(await canceled.result).toBe('unknown');
    const timedOut = startLocalPlayback('Hello there.', local, 1, 1, synthesis, make);
    vi.advanceTimersByTime(90000);
    expect(await timedOut.result).toBe('unknown');
    expect(synthesis.cancel).toHaveBeenCalledTimes(2);
  });
  it('reports synchronous synthesis failures without claiming playback', async () => {
    const { synthesis, make } = fixture();
    vi.mocked(synthesis.speak).mockImplementation(() => {
      throw new Error('device unavailable');
    });
    expect(await startLocalPlayback('Hello there.', local, 1, 1, synthesis, make).result).toBe(
      'failed',
    );
  });
});
