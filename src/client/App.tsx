import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  History,
  Home,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldCheck,
  Square,
  Sun,
  Volume2,
} from 'lucide-react';
import type { Snapshot } from '../shared/contracts';
import { api, date, time } from './lib/api';
import { useSpeech } from './lib/speech';
import { ConfirmDialog } from './components';
import { Medication, Records } from './features/Medication';
import { Family, News, Schedule } from './features/DailyLife';
import { Settings } from './features/Settings';
import { Today } from './features/Today';

type View = 'today' | 'medication' | 'schedule' | 'family' | 'news' | 'records' | 'settings';
const navigation = [
  { view: 'today' as const, title: '오늘', icon: Home },
  { view: 'records' as const, title: '내 기록', icon: History },
  { view: 'settings' as const, title: '설정', icon: SettingsIcon },
];

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [online, setOnline] = useState(false);
  const [view, setView] = useState<View>('today');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const snapshotRef = useRef<Snapshot | null>(null);
  const lastCue = useRef<string | null | undefined>(undefined);
  const baselineNeeded = useRef(true);
  const requestSequence = useRef(0);
  const pendingMutations = useRef(0);
  const cancellationEpoch = useRef(0);
  const clientId = useRef(crypto.randomUUID());
  const speech = useSpeech({
    rate: snapshot?.settings.speechRate ?? 0.9,
    volume: snapshot?.settings.speechVolume ?? 1,
  });
  const speechRef = useRef(speech);
  speechRef.current = speech;
  const cancelSpeech = useCallback(() => {
    cancellationEpoch.current += 1;
    speechRef.current.stop();
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
          const status =
            canPlay && speechRef.current.verified
              ? await speechRef.current.speak(
                  `지금은 ${time(cue.scheduledAt, next.settings.timeZone)}입니다.`,
                )
              : 'unknown';
          await api(`/cues/${encodeURIComponent(cue.id)}/delivery`, {
            status,
            clientId: clientId.current,
          });
        } catch {
          if (claimEpoch === cancellationEpoch.current)
            setError(
              '시간 안내의 재생 결과를 확인하지 못했어요. 다시 들으려면 시간 듣기를 눌러주세요.',
            );
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
      setVisible(!document.hidden);
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
    setError('');
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());
  }
  async function advance() {
    setBusy(true);
    setError('');
    try {
      await mutate('/demo/advance', { minutes: 1 });
    } catch (e) {
      setError(e instanceof Error ? e.message : '시연 시간을 변경하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    cancelSpeech();
    setBusy(true);
    setError('');
    try {
      baselineNeeded.current = true;
      await mutate('/demo/reset', { confirm: true });
      setResetting(false);
      navigate('today');
    } catch (e) {
      setError(e instanceof Error ? e.message : '초기화를 확인하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  function hearTime() {
    if (snapshot)
      void speech.speak(
        `지금은 ${time(snapshot.now, snapshot.settings.timeZone)}입니다. ${date(snapshot.now, snapshot.settings.timeZone)}입니다.`,
      );
  }
  const home = () => navigate('today');
  // Adapted from Project-1 app/(protected)/layout.tsx, MIT © 2026 Atharvsinh Jadav.
  // Keeps its cream outer canvas, separate white sidebar and active orange marker;
  // replaces trading/auth navigation with accessible local Dayla navigation.
  return (
    <div className={`app-shell ${snapshot?.settings.largeText ? 'large-text' : ''}`}>
      <a className="skip-link" href="#main">
        본문으로 바로가기
      </a>
      <aside className="sidebar">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            home();
          }}
          aria-label="Dayla 오늘 화면"
        >
          <span className="brand-symbol">
            <Sun aria-hidden="true" size={28} />
          </span>
          dayla<span className="brand-dot">.</span>
        </a>
        <p className="sidebar-caption">매일 곁에, 작은 도움</p>
        <nav aria-label="주 메뉴">
          {navigation.map((item) => (
            <button
              key={item.view}
              className={`nav-item ${(item.view === 'today' ? !['settings', 'records'].includes(view) : view === item.view) ? 'active' : ''}`}
              aria-current={view === item.view ? 'page' : undefined}
              onClick={() => navigate(item.view)}
            >
              <item.icon aria-hidden="true" size={26} />
              {item.title}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="tiny-flower" aria-hidden="true">
            ✳
          </span>
          <p>
            오늘도,
            <br />
            나의 속도로.
          </p>
          <span className="small muted">A little help, every day.</span>
        </div>
      </aside>
      <div className="workspace">
        <div className="demo-ribbon">
          <div>
            <span className="demo-tag">DEMO</span>
            <span>시연 중 · 가상 일정</span>
            {snapshot && (
              <span className="demo-time">
                현재 {time(snapshot.now, snapshot.settings.timeZone, false)}
              </span>
            )}
          </div>
          <div>
            <button disabled={busy || !online} onClick={() => void advance()}>
              시연 시간 1분 앞으로 <ArrowRight aria-hidden="true" size={18} />
            </button>
            <button
              className="reset-button"
              disabled={busy || !online}
              onClick={() => setResetting(true)}
              aria-label="시연 데이터 초기화"
            >
              <RotateCcw aria-hidden="true" size={19} />
              <span>초기화</span>
            </button>
          </div>
        </div>
        <div className="content-panel">
          <header className="topbar">
            <span className="small">DAYLA / 나의 하루</span>
            <span className={`connection ${online && visible ? '' : 'warning'}`}>
              <span className="status-dot" />
              {!visible ? '화면 비활성' : online ? '로컬 서버 연결됨' : '서버 연결 확인 필요'}
            </span>
          </header>
          {!online && (
            <p className="error-note" role="status">
              서버 연결을 확인하지 못했어요. 저장과 시간 변경은 연결 후 가능해요.
            </p>
          )}
          {error && (
            <p className="error-note" role="alert">
              {error}
            </p>
          )}
          <main id="main">
            {!snapshot ? (
              <div className="loading-state">
                <Sun size={52} aria-hidden="true" />
                <h1 tabIndex={-1}>오늘의 하루를 불러오고 있어요</h1>
                <p>로컬 서버가 실행 중인지 확인해주세요.</p>
              </div>
            ) : (
              <>
                {view === 'today' && (
                  <Today snapshot={snapshot} navigate={navigate} hearTime={hearTime} />
                )}
                {view === 'medication' && (
                  <Medication
                    snapshot={snapshot}
                    mutate={mutate}
                    online={online}
                    next={() => navigate('schedule')}
                    back={home}
                  />
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
                {view === 'family' && <Family online={online} back={home} />}
                {view === 'news' && <News speak={speech.speak} back={home} />}
                {view === 'records' && <Records snapshot={snapshot} />}
                {view === 'settings' && (
                  <Settings snapshot={snapshot} mutate={mutate} online={online} speech={speech} />
                )}
              </>
            )}
          </main>
          <div className="voice-status">
            <Volume2 aria-hidden="true" size={20} />
            <span role="status">{speech.status}</span>
            {!speech.verified && (
              <button className="text-button" onClick={() => navigate('settings')}>
                음성 설정
              </button>
            )}
          </div>
          <footer className="playback-controls" aria-label="음성 및 화면 조작">
            <button onClick={() => void speech.replay()}>
              <RotateCcw aria-hidden="true" size={22} />
              다시 듣기
            </button>
            <button onClick={cancelSpeech}>
              <Square aria-hidden="true" size={20} />
              그만 듣기
            </button>
            <button onClick={home}>
              <Home aria-hidden="true" size={22} />
              처음으로
            </button>
          </footer>
          <p className="local-note">
            <ShieldCheck size={17} aria-hidden="true" />
            가상 데이터로 체험하는 로컬 시연 · 음성 재생 완료는 청취 확인이 아니에요.
          </p>
        </div>
      </div>
      {resetting && (
        <ConfirmDialog
          title="시연을 처음으로 돌릴까요?"
          busy={busy}
          cancel={() => setResetting(false)}
          confirm={() => void reset()}
          confirmLabel="가상 데이터 초기화"
        >
          <p>저장된 가상 응답과 초안이 지워지고 시연 시간이 오전 8시 59분으로 돌아가요.</p>
          {error && (
            <p role="alert" className="error-note">
              {error}
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
