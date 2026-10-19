import { useCallback, useEffect, useRef, useState } from 'react';
import { localEnglishVoices, startLocalPlayback } from './speech';
import type { VoicePhase, VoiceStatus } from '../../shared/contracts';

type Result = 'played' | 'failed' | 'unknown';
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function useVoice({
  rate,
  volume,
  onTranscript,
}: {
  rate: number;
  volume: number;
  onTranscript: (text: string) => void;
}) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [message, setMessage] = useState('');
  const [active, setActive] = useState(false);
  const [browserConsent, setBrowserConsent] = useState(false);
  const [needsBrowserConsent, setNeedsBrowserConsent] = useState(false);
  const consent = useRef(false);
  const generation = useRef(0);
  const cleanup = useRef<(() => void)[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const lastText = useRef('');
  const transcript = useRef(onTranscript);
  useEffect(() => {
    transcript.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/voice/status', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setStatus((await response.json()) as VoiceStatus);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage('Voice settings could not be loaded. You can still type.');
      });
    return () => controller.abort();
  }, []);
  const cancel = useCallback(() => {
    generation.current += 1;
    cleanup.current.splice(0).forEach((dispose) => dispose());
    recorder.current = null;
    recognition.current = null;
  }, []);
  const stop = useCallback(() => {
    cancel();
    setPhase('idle');
    setLevel(0);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  const enableBrowserVoice = useCallback(() => {
    consent.current = true;
    setBrowserConsent(true);
    setNeedsBrowserConsent(false);
  }, []);
  const analyze = useCallback((context: AudioContext, source: AudioNode, run: number) => {
    const analyzer = context.createAnalyser();
    analyzer.fftSize = 256;
    source.connect(analyzer);
    const samples = new Uint8Array(analyzer.fftSize);
    let frame = 0;
    const update = () => {
      if (generation.current !== run || context.state === 'closed') return;
      analyzer.getByteTimeDomainData(samples);
      const rms = Math.sqrt(
        samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length,
      );
      setLevel(Math.min(1, rms * 5));
      frame = requestAnimationFrame(update);
    };
    update();
    cleanup.current.push(() => {
      cancelAnimationFrame(frame);
      analyzer.disconnect();
    });
    return analyzer;
  }, []);
  const start = useCallback(async () => {
    stop();
    if (!status) {
      setMessage('Voice settings are still loading. Please try again.');
      return;
    }
    if (!status.configured && !consent.current) {
      setNeedsBrowserConsent(true);
      return;
    }
    setActive(true);
    setMessage('');
    const run = generation.current;
    if (!status.configured) {
      const host = window as VoiceWindow;
      const Engine = host.SpeechRecognition ?? host.webkitSpeechRecognition;
      if (!Engine) {
        setPhase('error');
        setMessage('This browser cannot listen. Please type your message.');
        return;
      }
      const engine = new Engine();
      recognition.current = engine;
      engine.lang = 'en-US';
      engine.continuous = false;
      engine.interimResults = false;
      let received = false;
      engine.onresult = (event) => {
        if (generation.current !== run) return;
        const text = event.results[0]?.[0]?.transcript.trim();
        if (text) {
          received = true;
          setPhase('thinking');
          transcript.current(text);
        }
      };
      engine.onerror = () => {
        if (generation.current !== run) return;
        received = true;
        setPhase('error');
        setMessage('I could not hear you. Check microphone access or type below.');
      };
      engine.onend = () => {
        if (generation.current === run && !received) setPhase('idle');
      };
      cleanup.current.push(() => {
        engine.onresult = null;
        engine.onerror = null;
        engine.onend = null;
        engine.abort();
      });
      try {
        engine.start();
        setPhase('listening');
      } catch {
        setPhase('error');
        setMessage('Microphone access is unavailable. You can still type.');
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation.current !== run) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cleanup.current.push(() => stream.getTracks().forEach((track) => track.stop()));
      const context = new AudioContext();
      cleanup.current.push(() => {
        if (context.state !== 'closed') void context.close();
      });
      await context.resume();
      if (generation.current !== run) return;
      analyze(context, context.createMediaStreamSource(stream), run);
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
        (mime) => MediaRecorder.isTypeSupported(mime),
      );
      const capture = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.current = capture;
      const chunks: Blob[] = [];
      let bytes = 0;
      let tooLarge = false;
      capture.ondataavailable = (event) => {
        bytes += event.data.size;
        if (bytes > 4 * 1024 * 1024) {
          tooLarge = true;
          if (capture.state !== 'inactive') capture.stop();
        } else chunks.push(event.data);
      };
      const timeout = setTimeout(() => {
        if (capture.state !== 'inactive') capture.stop();
      }, 45000);
      cleanup.current.push(() => {
        clearTimeout(timeout);
        capture.onstop = null;
        capture.ondataavailable = null;
        if (capture.state !== 'inactive') capture.stop();
      });
      capture.onstop = async () => {
        clearTimeout(timeout);
        if (context.state !== 'closed') void context.close();
        stream.getTracks().forEach((track) => track.stop());
        if (generation.current !== run) return;
        recorder.current = null;
        setLevel(0);
        setPhase('thinking');
        const controller = new AbortController();
        cleanup.current.push(() => controller.abort());
        try {
          if (tooLarge || bytes === 0) throw new Error();
          const blob = new Blob(chunks, { type: capture.mimeType });
          const buffer = new Uint8Array(await blob.arrayBuffer());
          let binary = '';
          for (const byte of buffer) binary += String.fromCharCode(byte);
          if (generation.current !== run) return;
          const response = await fetch('/api/voice/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: btoa(binary), mime: capture.mimeType }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error();
          const body = (await response.json()) as { text: string };
          if (generation.current !== run) return;
          if (!body.text.trim()) throw new Error();
          transcript.current(body.text);
        } catch {
          if (generation.current !== run) return;
          setPhase('error');
          setMessage('I could not transcribe that. Please try again or type your message.');
        }
      };
      capture.start(250);
      setPhase('listening');
    } catch {
      if (generation.current !== run) return;
      stop();
      setPhase('error');
      setMessage('Microphone access is unavailable. Please check your browser settings.');
    }
  }, [analyze, status, stop]);
  const finish = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recognition.current?.stop();
  }, []);
  const speak = useCallback(
    async (text: string): Promise<Result> => {
      stop();
      lastText.current = text;
      if (!text.trim() || !status) return 'unknown';
      const run = generation.current;
      if (!status.configured) {
        if (!consent.current) {
          setNeedsBrowserConsent(true);
          return 'unknown';
        }
        const synthesis = window.speechSynthesis;
        const voice = synthesis && localEnglishVoices(synthesis.getVoices())[0];
        if (!voice) {
          setMessage('No local English voice is available. Your reply is shown on screen.');
          return 'unknown';
        }
        setActive(true);
        setPhase('speaking');
        const playback = startLocalPlayback(text, voice, rate, volume, synthesis, (value) => {
          const utterance = new SpeechSynthesisUtterance(value);
          utterance.onboundary = () => {
            if (generation.current === run) setLevel((current) => (current > 0.3 ? 0.2 : 0.6));
          };
          return utterance;
        });
        cleanup.current.push(playback.cancel);
        const result = await playback.result;
        if (generation.current === run) {
          setPhase('idle');
          setLevel(0);
          if (result !== 'played')
            setMessage('Speech playback could not finish. Please read the reply.');
        }
        return result;
      }
      setActive(true);
      setPhase('thinking');
      const controller = new AbortController();
      cleanup.current.push(() => controller.abort());
      try {
        const context = new AudioContext();
        cleanup.current.push(() => {
          if (context.state !== 'closed') void context.close();
        });
        await context.resume();
        const response = await fetch('/api/voice/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const audio = await context.decodeAudioData(await response.arrayBuffer());
        if (generation.current !== run) return 'unknown';
        const source = context.createBufferSource();
        source.buffer = audio;
        source.playbackRate.value = Math.min(1.5, Math.max(0.5, rate));
        const gain = context.createGain();
        gain.gain.value = Math.min(1, Math.max(0, volume));
        source.connect(gain);
        analyze(context, gain, run).connect(context.destination);
        setPhase('speaking');
        setMessage('');
        return await new Promise<Result>((resolve) => {
          let ended = false;
          const done = (result: Result) => {
            if (ended) return;
            ended = true;
            clearTimeout(timeout);
            if (generation.current === run) {
              cancel();
              setPhase('idle');
              setLevel(0);
            }
            resolve(result);
          };
          source.onended = () => done('played');
          const timeout = setTimeout(() => {
            done('unknown');
            source.stop();
          }, 90000);
          cleanup.current.push(() => {
            source.onended = null;
            done('unknown');
            source.stop();
            source.disconnect();
            gain.disconnect();
          });
          source.start();
        });
      } catch {
        if (generation.current !== run) return 'unknown';
        stop();
        setPhase('error');
        setLevel(0);
        setMessage('Voice playback is unavailable. Your reply is shown below.');
        return 'failed';
      }
    },
    [analyze, cancel, rate, status, stop, volume],
  );
  return {
    phase,
    level,
    status,
    message,
    active,
    needsBrowserConsent,
    browserConsent,
    enableBrowserVoice,
    start,
    finish,
    speak,
    stop,
    replay: () => (lastText.current ? speak(lastText.current) : Promise.resolve<Result>('unknown')),
    setThinking: (value: boolean) => setPhase(value ? 'thinking' : 'idle'),
  };
}
