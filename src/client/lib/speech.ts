type PlaybackResult = 'played' | 'failed' | 'unknown';
/** A browser voice being local is a prerequisite, not proof of offline operation. */
export function localEnglishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((voice) => voice.localService && /^en(?:[-_]|$)/i.test(voice.lang));
}

export function startLocalPlayback(
  text: string,
  voice: SpeechSynthesisVoice,
  rate: number,
  volume: number,
  synthesis: SpeechSynthesis,
  makeUtterance = (value: string) => new SpeechSynthesisUtterance(value),
): { result: Promise<PlaybackResult>; cancel: () => void } {
  let settle: (result: PlaybackResult) => void = () => {};
  let completed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = new Promise<PlaybackResult>((resolve) => {
    settle = (value) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      resolve(value);
    };
    if (!voice.localService || !/^en(?:[-_]|$)/i.test(voice.lang) || !text.trim()) {
      settle('failed');
      return;
    }
    try {
      const utterance = makeUtterance(text.slice(0, 1500));
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = Math.min(1.5, Math.max(0.5, rate));
      utterance.volume = Math.min(1, Math.max(0, volume));
      utterance.onend = () => settle('played');
      utterance.onerror = () => settle('failed');
      timeout = setTimeout(() => {
        settle('unknown');
        synthesis.cancel();
      }, 90000);
      synthesis.speak(utterance);
    } catch {
      settle('failed');
    }
  });
  return {
    result,
    cancel: () => {
      settle('unknown');
      synthesis.cancel();
    },
  };
}
