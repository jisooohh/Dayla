import {
  ArrowRight,
  CalendarDays,
  Check,
  Heart,
  Newspaper,
  Pill,
  Sun,
  Volume2,
} from 'lucide-react';
import type { Snapshot } from '../../shared/contracts';
import { date, time } from '../lib/api';
import { visitLabels } from './DailyLife';

export function Today({
  snapshot,
  navigate,
  hearTime,
}: {
  snapshot: Snapshot;
  navigate: (view: 'medication' | 'schedule' | 'family' | 'news') => void;
  hearTime: () => void;
}) {
  const zone = snapshot.settings.timeZone;
  const due = snapshot.medications.filter(
    (item) => Date.parse(item.scheduledAt) <= Date.parse(snapshot.now),
  );
  const unanswered = due.find((item) => !item.response);
  const nextVisit = snapshot.visits.find((visit) => visit.status !== 'cancelled');
  const clock = new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: zone,
  }).formatToParts(new Date(snapshot.now));
  const clockNumber = clock
    .filter((part) => ['hour', 'minute', 'literal'].includes(part.type))
    .map((part) => part.value)
    .join('')
    .trim();
  const clockPeriod = clock.find((part) => part.type === 'dayPeriod')?.value;
  // Orange/cream rounded hierarchy adapted from Project-1 StatCard.tsx (MIT).
  // Dark text replaces the upstream low-contrast white-on-orange values.
  return (
    <>
      <header className="home-heading">
        <div>
          <p className="eyebrow">{date(snapshot.now, zone)}</p>
          <h1 tabIndex={-1}>
            좋은 하루예요{' '}
            <span className="greeting-sun" aria-hidden="true">
              ☀
            </span>
          </h1>
          <p className="muted">서두르지 않아도 괜찮아요.</p>
        </div>
        <span className="day-badge">
          <Sun aria-hidden="true" size={22} /> 나의 하루
        </span>
      </header>
      <section className="daily-overview" aria-labelledby="daily-heading">
        <div className="clock-panel">
          <div className="row spread">
            <span className="eyebrow">지금 이 시간</span>
            <Sun size={32} aria-hidden="true" />
          </div>
          <div className="clock">
            <span className="clock-period">{clockPeriod}</span>
            <span className="clock-number">{clockNumber}</span>
          </div>
          <p>오늘도, 천천히 시작해볼까요?</p>
          <button className="clock-button" onClick={hearTime}>
            <Volume2 aria-hidden="true" />
            시간 듣기
            <ArrowRight aria-hidden="true" size={22} />
          </button>
        </div>
        <div className="next-panel">
          <span className="eyebrow">ONE THING AT A TIME</span>
          <h2 id="daily-heading">
            지금 필요한
            <br />
            작은 도움
          </h2>
          <div className="next-event">
            <span className="icon-bubble">
              <Pill aria-hidden="true" />
            </span>
            <div>
              <p className="small muted">
                {unanswered
                  ? '응답을 기다리는 일정'
                  : due.length
                    ? '내 응답이 보관되어 있어요'
                    : '다음 복약 일정'}
              </p>
              <strong>
                {unanswered?.label ?? snapshot.medications[0]?.label ?? '등록된 일정 없음'}
              </strong>
              <p className="small">
                {snapshot.medications[0]
                  ? time((unanswered ?? snapshot.medications[0]).scheduledAt, zone)
                  : ''}{' '}
                · 가상 일정
              </p>
            </div>
          </div>
          <button className="primary" onClick={() => navigate('medication')}>
            {unanswered ? '내 응답 남기기' : '약 알림 확인하기'}
            <ArrowRight aria-hidden="true" />
          </button>
          <p className="small muted">직접 답하신 내용만 기록해요.</p>
        </div>
      </section>
      <nav className="flow-steps" aria-label="하루 시연 흐름">
        {[
          { title: '시간 안내', action: hearTime },
          { title: '내 응답', action: () => navigate('medication') },
          { title: '오늘 일정', action: () => navigate('schedule') },
          { title: '가족 이야기', action: () => navigate('family') },
        ].map((step, index) => (
          <button key={step.title} onClick={step.action}>
            <span
              className={`step-number ${index === 1 && due.some((item) => item.response) ? 'complete' : ''}`}
            >
              {index === 1 && due.some((item) => item.response) ? (
                <Check size={17} aria-hidden="true" />
              ) : (
                `0${index + 1}`
              )}
            </span>
            {step.title}
            {index < 3 && <ArrowRight size={16} className="step-arrow" aria-hidden="true" />}
          </button>
        ))}
      </nav>
      <section className="day-strip">
        <div className="row spread wrap">
          <h2>오늘의 작은 약속</h2>
          <button className="text-button" onClick={() => navigate('schedule')}>
            오늘 일정 <ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
        {nextVisit ? (
          <div className="timeline-row">
            <span className="timeline-time">{time(nextVisit.startsAt, zone)}</span>
            <span className="timeline-point" />
            <div>
              <strong>{nextVisit.alias}</strong>
              <p className="small muted">
                {visitLabels[nextVisit.status]} · 실제 방문 여부는 확인하지 않아요
              </p>
            </div>
            <CalendarDays className="timeline-icon" aria-hidden="true" />
          </div>
        ) : (
          <p className="muted">오늘 등록된 방문 예정이 없어요.</p>
        )}
      </section>
      <div className="secondary-actions">
        <button onClick={() => navigate('family')}>
          <Heart aria-hidden="true" />
          <span>
            <strong>가족과 이야기</strong>
            <small>따뜻한 안부 한마디</small>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </button>
        <button onClick={() => navigate('news')}>
          <Newspaper aria-hidden="true" />
          <span>
            <strong>뉴스 듣기</strong>
            <small>세상 소식 한 조각</small>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
