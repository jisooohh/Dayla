import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  CalendarDays,
  Heart,
  PanelLeft,
  MessageCircle,
  Mic,
  Newspaper,
  Pill,
  RotateCcw,
  Settings as SettingsIcon,
  Square,
} from 'lucide-react';
import type { ConversationReply, Snapshot } from '../shared/contracts';
import { api, time, reportLabels } from './lib/api';
import { useVoice } from './lib/voice';
import { DaylaCharacter, DaylaLogo } from './components/Brand';
import { ConfirmDialog } from './components';
import { Medication, Records } from './features/Medication';
import { Family, News, Schedule } from './features/DailyLife';
import { Settings } from './features/Settings';

type View = 'conversation' | 'medication' | 'schedule' | 'family' | 'news' | 'settings';
type Turn = { id: string; role: 'user' | 'assistant'; text: string };
const navigation = [
  { view: 'conversation' as const, title: 'Conversation', icon: MessageCircle },
  { view: 'medication' as const, title: 'Medication', icon: Pill },
  { view: 'schedule' as const, title: 'Schedule', icon: CalendarDays },
  { view: 'family' as const, title: 'Family', icon: Heart },
  { view: 'news' as const, title: 'News', icon: Newspaper },
  { view: 'settings' as const, title: 'Settings', icon: SettingsIcon },
];

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [online, setOnline] = useState(false);
  const [view, setView] = useState<View>('conversation');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [confirmation, setConfirmation] = useState<ConversationReply['confirmation']>();
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});
  const sessionId = useRef(crypto.randomUUID());
  const snapshotRef = useRef<Snapshot | null>(null);
  const lastCue = useRef<string | null | undefined>(undefined);
  const baselineNeeded = useRef(true);
  const requestSequence = useRef(0);
  const pendingMutations = useRef(0);
  const cancellationEpoch = useRef(0);
  const clientId = useRef(crypto.randomUUID());
  const voice = useVoice({
    rate: snapshot?.settings.speechRate ?? 0.9,
    volume: snapshot?.settings.speechVolume ?? 1,
    onTranscript: (text) => void sendRef.current(text),
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const presenter = new URLSearchParams(window.location.search).get('presenter') === '1';
  const cancelSpeech = useCallback(() => {
    cancellationEpoch.current += 1;
    voiceRef.current.stop();
  }, []);
  const accept = useCallback((next: Snapshot) => {
    const previous = snapshotRef.current;
    const cueId = next.cue?.id ?? null;
    if (
      !baselineNeeded.current &&
      !document.hidden &&
      previous &&
      cueId &&
      cueId !== lastCue.current &&
      next.cue?.delivery === 'pending' &&
      Date.parse(next.cue.expiresAt) > Date.parse(next.serverTime)
    ) {
      const cue = next.cue;
      const receivedAt = performance.now();
      const claimEpoch = cancellationEpoch.current;
      void (async () => {
        try {
          await api(`/cues/${encodeURIComponent(cue.id)}/delivery`, {
            status: 'attempted',
            clientId: clientId.current,
          });
          const currentServerTime = Date.parse(next.serverTime) + performance.now() - receivedAt;
          const latest = snapshotRef.current;
          const settingsUnchanged =
            latest?.settings.hourlyEnabled &&
            latest.settings.timeZone === next.settings.timeZone &&
            latest.settings.quietStart === next.settings.quietStart &&
            latest.settings.quietEnd === next.settings.quietEnd;
          const cueStillActive =
            latest?.cue?.id === cue.id && ['pending', 'attempted'].includes(latest.cue.delivery);
          const canPlay =
            claimEpoch === cancellationEpoch.current &&
            !document.hidden &&
            settingsUnchanged &&
            cueStillActive &&
            Date.parse(cue.expiresAt) > Math.max(Date.now(), currentServerTime);
          const due = next.medications.find(
            (item) => !item.response && Date.parse(item.scheduledAt) <= Date.parse(next.now),
          );
          const text = `It's ${time(cue.scheduledAt, next.settings.timeZone)}.${due ? ` You have a medication check-in for ${due.label}. What would you like to record?` : ' I’m here if you need a little help.'}`;
          if (canPlay)
            setTurns((current) => [
              ...current,
              { id: crypto.randomUUID(), role: 'assistant', text },
            ]);
          const status =
            canPlay &&
            voiceRef.current.active &&
            voiceRef.current.phase === 'idle' &&
            !sendingRef.current
              ? await voiceRef.current.speak(text)
              : 'unknown';
          await api(`/cues/${encodeURIComponent(cue.id)}/delivery`, {
            status,
            clientId: clientId.current,
          });
        } catch {
          if (claimEpoch === cancellationEpoch.current)
            setError('I couldn’t confirm that reminder played. You can ask me for the time.');
        }
      })();
    }
    baselineNeeded.current = false;
    lastCue.current = cueId;
    snapshotRef.current = next;
    setSnapshot(next);
    setOnline(true);
  }, []);
  useEffect(() => {
    let mounted = true;
    let pollInFlight = false;
    async function poll() {
      if (document.hidden || pendingMutations.current > 0 || pollInFlight) return;
      pollInFlight = true;
      const sequence = ++requestSequence.current;
      try {
        const next = await api<Snapshot>('/today');
        if (mounted && sequence === requestSequence.current) accept(next);
      } catch {
        if (mounted && sequence === requestSequence.current) {
          setOnline(false);
          baselineNeeded.current = true;
          cancelSpeech();
        }
      } finally {
        pollInFlight = false;
      }
    }
    const visibility = () => {
      baselineNeeded.current = true;
      if (!document.hidden) void poll();
      else cancelSpeech();
    };
    const disconnected = () => {
      ++requestSequence.current;
      setOnline(false);
      baselineNeeded.current = true;
      cancelSpeech();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('offline', disconnected);
    void poll();
    const interval = setInterval(() => void poll(), 2000);
    return () => {
      mounted = false;
      cancellationEpoch.current += 1;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('offline', disconnected);
    };
  }, [accept, cancelSpeech]);
  async function mutate(path: string, body: unknown, method?: string) {
    if (path === '/settings') cancelSpeech();
    const sequence = ++requestSequence.current;
    pendingMutations.current += 1;
    try {
      const next = await api<Snapshot>(path, body, method);
      if (sequence === requestSequence.current) accept(next);
      return next;
    } finally {
      pendingMutations.current -= 1;
    }
  }
  function navigate(next: View) {
    setView(next);
    if (window.matchMedia('(max-width: 760px)').matches) setMenuOpen(false);
    setError('');
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());
  }
  async function send(text: string) {
    text = text.trim();
    if (!text || sendingRef.current || !online) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    setInput('');
    cancelSpeech();
    const replyEpoch = cancellationEpoch.current;
    const replySession = sessionId.current;
    voice.setThinking(true);
    setTurns((current) => [...current, { id: crypto.randomUUID(), role: 'user', text }]);
    try {
      const reply = await api<ConversationReply>('/conversation', {
        text,
        sessionId: sessionId.current,
        requestId: crypto.randomUUID(),
      });
      if (replyEpoch !== cancellationEpoch.current || replySession !== sessionId.current) return;
      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', text: reply.text },
      ]);
      setConfirmation(reply.confirmation);
      const sequence = ++requestSequence.current;
      const next = await api<Snapshot>('/today');
      if (sequence === requestSequence.current) accept(next);
      if (replyEpoch !== cancellationEpoch.current || replySession !== sessionId.current) return;
      voice.setThinking(false);
      if (!document.hidden && replyEpoch === cancellationEpoch.current)
        void voice.speak(reply.text);
    } catch (e) {
      if (replyEpoch !== cancellationEpoch.current || replySession !== sessionId.current) return;
      voice.setThinking(false);
      setError(e instanceof Error ? e.message : 'I couldn’t complete that. Please try again.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  sendRef.current = send;
  async function clockAction(path: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      if (path !== '/demo/advance') {
        cancelSpeech();
        baselineNeeded.current = true;
      }
      await mutate(path, body);
      if (path === '/demo/reset') {
        setTurns([]);
        setConfirmation(undefined);
        sessionId.current = crypto.randomUUID();
        setResetting(false);
        navigate('conversation');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t update the clock.');
    } finally {
      setBusy(false);
    }
  }
  const home = () => navigate('conversation');
  const hour = snapshot
    ? Number(
        new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hourCycle: 'h23',
          timeZone: snapshot.settings.timeZone,
        }).format(new Date(snapshot.now)),
      )
    : new Date().getHours();
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
  const micClick = () => (voice.phase === 'listening' ? voice.finish() : void voice.start());
  return (
    <div
      className={`app-shell ${menuOpen ? 'navigation-open' : ''} ${snapshot?.settings.largeText ? 'large-text' : ''}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <button
        ref={menuToggleRef}
        className="navigation-toggle icon-button"
        aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={menuOpen}
        aria-controls="dayla-sidebar"
        title={menuOpen ? 'Close navigation' : 'Open navigation'}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <PanelLeft size={20} strokeWidth={1.6} aria-hidden="true" />
      </button>
      <aside id="dayla-sidebar" className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            home();
          }}
          aria-label="Dayla home"
        >
          <DaylaLogo />
        </a>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.view}
              className={`nav-item ${view === item.view ? 'active' : ''}`}
              aria-current={view === item.view ? 'page' : undefined}
              aria-label={item.title}
              title={menuOpen ? undefined : item.title}
              onClick={() => navigate(item.view)}
            >
              <item.icon size={23} aria-hidden="true" />
              <span>{item.title}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="presence-dot" />
          <p>
            A little company.
            <br />
            Every day.
          </p>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="menu-backdrop"
          aria-label="Dismiss navigation"
          onClick={() => {
            setMenuOpen(false);
            menuToggleRef.current?.focus();
          }}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <span>Your everyday companion</span>
          <span className="topbar-date">
            {snapshot && time(snapshot.now, snapshot.settings.timeZone)}
          </span>
        </header>
        {!online && (
          <p className="error-note connection-note" role="status">
            Connecting to Dayla. Your messages will be ready when we reconnect.
          </p>
        )}
        {error && (
          <p className="error-note connection-note" role="alert">
            {error}
          </p>
        )}
        <main id="main" className={view === 'conversation' ? 'conversation-main' : 'feature-main'}>
          {view === 'conversation' ? (
            <div className={`conversation ${turns.length ? 'has-turns' : ''}`}>
              <div className="welcome">
                <DaylaCharacter phase={voice.phase} level={voice.level} />
                <h1 tabIndex={-1}>{greeting}</h1>
                <p>How are you feeling today?</p>
              </div>
              <button
                type="button"
                className={`voice-trigger ${voice.phase === 'listening' ? 'is-listening' : ''}`}
                aria-label={voice.phase === 'listening' ? 'Finish speaking' : 'Start speaking'}
                aria-describedby="voice-status"
                disabled={!online || sending}
                onClick={micClick}
              >
                <span className="voice-orb" aria-hidden="true">
                  {voice.phase === 'listening' ? (
                    <Square size={28} />
                  ) : (
                    <Mic size={32} strokeWidth={1.6} />
                  )}
                </span>
                <span>{voice.phase === 'listening' ? 'Finish speaking' : 'Start speaking'}</span>
              </button>
              <div id="voice-status" className="conversation-status" role="status">
                {sending ? 'Thinking…' : voice.message || 'I’m here. Take your time.'}
              </div>
              {(voice.phase === 'speaking' ||
                voice.phase === 'listening' ||
                voice.phase === 'thinking') && (
                <button className="quiet-control" onClick={cancelSpeech}>
                  <Square size={16} />
                  Stop{' '}
                  {voice.phase === 'listening'
                    ? 'listening'
                    : voice.phase === 'thinking'
                      ? 'waiting'
                      : 'speaking'}
                </button>
              )}
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
              >
                <label className="sr-only" htmlFor="message">
                  Message Dayla
                </label>
                <input
                  id="message"
                  value={input}
                  maxLength={1000}
                  placeholder="Or type a message…"
                  onChange={(e) => setInput(e.target.value)}
                  disabled={sending}
                  autoComplete="off"
                />
                <div className="composer-actions">
                  <button
                    type="submit"
                    className="send-button icon-button"
                    aria-label="Send message"
                    disabled={!online || sending || !input.trim()}
                  >
                    <ArrowUp size={25} />
                  </button>
                </div>
              </form>
              {voice.needsBrowserConsent && !voice.browserConsent && (
                <div className="voice-consent">
                  <p>
                    Your browser’s speech service will process microphone audio. Start only when
                    you’re ready.
                  </p>
                  <button
                    onClick={() => {
                      voice.enableBrowserVoice();
                      void voice.start();
                    }}
                  >
                    Use browser voice
                  </button>
                </div>
              )}
              {!!turns.length && (
                <section
                  className="conversation-history"
                  aria-label="Conversation"
                  aria-live="polite"
                  aria-relevant="additions"
                >
                  {turns.slice(-12).map((turn) => (
                    <div key={turn.id} className={`conversation-turn ${turn.role}`}>
                      <span className="turn-author">
                        {turn.role === 'assistant' ? 'Dayla' : 'You'}
                      </span>
                      <p>{turn.text}</p>
                    </div>
                  ))}
                  {confirmation && (
                    <div className="conversation-confirmation">
                      <p>
                        Record “{reportLabels[confirmation.value]}” for {confirmation.label}?
                      </p>
                      <div className="row">
                        <button
                          className="primary"
                          disabled={sending || !online}
                          onClick={() => void send('yes')}
                        >
                          Confirm
                        </button>
                        <button disabled={sending || !online} onClick={() => void send('no')}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  <button className="quiet-control" onClick={() => void voice.replay()}>
                    <RotateCcw size={17} />
                    Hear that again
                  </button>
                </section>
              )}
            </div>
          ) : snapshot ? (
            <>
              {view === 'medication' && (
                <>
                  <Medication
                    snapshot={snapshot}
                    mutate={mutate}
                    online={online}
                    next={() => navigate('schedule')}
                    back={home}
                  />
                  <Records snapshot={snapshot} />
                </>
              )}
              {view === 'schedule' && (
                <Schedule
                  snapshot={snapshot}
                  mutate={mutate}
                  online={online}
                  next={() => navigate('family')}
                  back={home}
                />
              )}
              {view === 'family' && (
                <Family online={online} back={home} savedDraft={snapshot.drafts[0] ?? null} />
              )}
              {view === 'news' && <News speak={voice.speak} back={home} />}
              {view === 'settings' && (
                <Settings snapshot={snapshot} mutate={mutate} online={online} voice={voice} />
              )}
            </>
          ) : (
            <h1 tabIndex={-1}>Getting your day ready…</h1>
          )}
        </main>
        {presenter && (
          <aside className="presenter-controls" aria-label="Clock controls">
            <span>{snapshot && time(snapshot.now, snapshot.settings.timeZone)}</span>
            <button disabled={busy || !online} onClick={() => setResetting(true)}>
              Reset morning
            </button>
            <button
              disabled={busy || !online}
              onClick={() => void clockAction('/demo/advance', { minutes: 1 })}
            >
              Advance 1 minute
            </button>
            <button
              disabled={busy || !online}
              onClick={() => void clockAction('/clock/live', { confirm: true })}
            >
              Use current time
            </button>
          </aside>
        )}
      </div>
      {resetting && (
        <ConfirmDialog
          title="Start a fresh morning?"
          busy={busy}
          cancel={() => setResetting(false)}
          confirm={() => void clockAction('/demo/reset', { confirm: true })}
          confirmLabel="Reset morning"
        >
          <p>This clears saved check-ins and drafts and returns the clock to 8:59 AM.</p>
          {error && <p role="alert">{error}</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}
