import { useCallback, useEffect, useRef, useState } from 'react';

type PlaybackResult = 'played' | 'failed' | 'unknown';
interface VoiceChoice {
  uri: string;
  name: string;
  local: boolean;
}
interface SavedVoice {
  uri: string;
  name: string;
  verified: boolean;
}
const STORAGE_KEY = 'dayla.local-voice.v1';

/** A browser voice being local is a prerequisite, not proof of offline operation. */
export function localKoreanVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((voice) => voice.localService && /^ko(?:[-_]|$)/i.test(voice.lang));
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
    if (!voice.localService || !/^ko(?:[-_]|$)/i.test(voice.lang) || !text.trim()) {
      settle('failed');
      return;
    }
    try {
      const utterance = makeUtterance(text.slice(0, 500));
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = Math.min(1.2, Math.max(0.6, rate));
      utterance.volume = Math.min(1, Math.max(0, volume));
      utterance.onend = () => settle('played');
      utterance.onerror = () => settle('failed');
      timeout = setTimeout(() => {
        settle('unknown');
        synthesis.cancel();
      }, 45000);
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

function readSavedVoice(): SavedVoice | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (
      saved &&
      typeof saved === 'object' &&
      'uri' in saved &&
      'name' in saved &&
      'verified' in saved &&
      typeof saved.uri === 'string' &&
      typeof saved.name === 'string' &&
      typeof saved.verified === 'boolean'
    ) {
      return saved as SavedVoice;
    }
  } catch {
    /* Storage may be disabled; speech still works after manual setup. */
  }
  return null;
}

export function useSpeech({ rate, volume }: { rate: number; volume: number }) {
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window;
  const [nativeVoices, setNativeVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [verified, updateVerified] = useState(false);
  const [status, setStatus] = useState('설정에서 한국어 음성을 확인해 주세요.');
  const tested = useRef<string | null>(null);
  const lastText = useRef('');
  const active = useRef<ReturnType<typeof startLocalPlayback> | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (!supported) return;
    const refresh = () => {
      generation.current += 1;
      active.current?.cancel();
      active.current = null;
      tested.current = null;
      const available = localKoreanVoices(window.speechSynthesis.getVoices());
      setNativeVoices(available);
      const saved = readSavedVoice();
      const match = available.find(
        (voice) => voice.voiceURI === saved?.uri && voice.name === saved.name,
      );
      // Restore verification only together with the exact saved voice identity.
      // A fallback voice must never inherit another voice's offline confirmation.
      setSelectedVoice(
        (current) =>
          match?.voiceURI ??
          (available.some((voice) => voice.voiceURI === current)
            ? current
            : (available[0]?.voiceURI ?? '')),
      );
      updateVerified(Boolean(match && saved?.verified));
      if (!available.length)
        setStatus('로컬 한국어 음성이 없어요. 큰 글씨와 버튼을 이용해 주세요.');
      else if (match && saved?.verified) setStatus('직접 확인한 로컬 한국어 음성을 사용해요.');
    };
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', refresh);
      active.current?.cancel();
    };
  }, [supported]);

  const selectVoice = useCallback((uri: string) => {
    active.current?.cancel();
    generation.current += 1;
    setSelectedVoice(uri);
    updateVerified(false);
    tested.current = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Optional browser storage. */
    }
    setStatus('선택한 음성을 시험한 뒤, 오프라인 재생을 직접 확인해 주세요.');
  }, []);

  const play = useCallback(
    async (text: string, isTest: boolean): Promise<PlaybackResult> => {
      const voice = nativeVoices.find((item) => item.voiceURI === selectedVoice);
      if (!supported || !voice || (!verified && !isTest)) {
        setStatus('음성 설정이 필요해요. 화면의 버튼으로 계속할 수 있어요.');
        return 'unknown';
      }
      active.current?.cancel();
      const run = ++generation.current;
      lastText.current = text;
      setStatus('읽고 있어요. 원하면 그만 듣기를 눌러 주세요.');
      const playback = startLocalPlayback(text, voice, rate, volume, window.speechSynthesis);
      active.current = playback;
      const result = await playback.result;
      if (run !== generation.current) return result;
      active.current = null;
      if (isTest && result === 'played') tested.current = voice.voiceURI;
      setStatus(
        result === 'played'
          ? '기기에서 재생을 마쳤어요. 실제로 들으셨는지는 확인하지 않아요.'
          : result === 'failed'
            ? '음성 재생에 실패했어요. 화면을 확인해 주세요.'
            : '재생 완료를 확인할 수 없어요.',
      );
      return result;
    },
    [nativeVoices, rate, selectedVoice, supported, verified, volume],
  );

  const setVerified = useCallback(
    (value: boolean) => {
      const voice = nativeVoices.find((item) => item.voiceURI === selectedVoice);
      if (!voice || (value && tested.current !== selectedVoice)) {
        setStatus('먼저 시험 문장을 끝까지 재생해 주세요.');
        return;
      }
      updateVerified(value);
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ uri: voice.voiceURI, name: voice.name, verified: value }),
        );
      } catch {
        setStatus('브라우저 설정 저장이 제한돼 있어요. 다음 실행 때 다시 확인해 주세요.');
        return;
      }
      setStatus(value ? '직접 확인한 로컬 한국어 음성을 사용해요.' : '음성 확인을 해제했어요.');
    },
    [nativeVoices, selectedVoice],
  );

  const stop = useCallback(() => {
    generation.current += 1;
    active.current?.cancel();
    active.current = null;
    setStatus('읽기를 멈췄어요.');
  }, []);

  const voices: VoiceChoice[] = nativeVoices.map((voice) => ({
    uri: voice.voiceURI,
    name: voice.name,
    local: true,
  }));
  return {
    voices,
    selectedVoice,
    selectVoice,
    verified,
    setVerified,
    status,
    supported,
    speak: (text: string) => play(text, false),
    test: () => play('안녕하세요. 데일라예요. 오늘도 편안한 하루 보내세요.', true),
    stop,
    replay: () =>
      lastText.current ? play(lastText.current, false) : Promise.resolve<PlaybackResult>('unknown'),
  };
}
