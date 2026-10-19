import { useState } from 'react';
import {
  CalendarDays,
  Coffee,
  MessageCircle,
  Sun,
  ArrowUpRight,
  Volume2,
  RefreshCw,
} from 'lucide-react';
import type { DraftTopic, FamilyDraft, NewsResult, Snapshot, Visit } from '../../shared/contracts';
import { api, date, time, type Mutate } from '../lib/api';
import { NextButton, SectionHeading } from '../components';

export const visitLabels = {
  scheduled: '방문 예정',
  changed: '시간 변경 · 방문 예정',
  cancelled: '취소된 일정',
};
export function Schedule({
  snapshot,
  mutate,
  online,
  next,
  back,
}: {
  snapshot: Snapshot;
  mutate: Mutate;
  online: boolean;
  next: () => void;
  back: () => void;
}) {
  const [editing, setEditing] = useState<Visit | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function update(visit: Visit, status: Visit['status']) {
    setBusy(true);
    setMessage('');
    try {
      await mutate(
        `/visits/${encodeURIComponent(visit.id)}`,
        {
          status,
          expectedRevision: visit.revision,
          ...(status === 'changed'
            ? {
                startsAt: new Date(Date.parse(visit.startsAt) + 30 * 60_000).toISOString(),
                endsAt: new Date(Date.parse(visit.endsAt) + 30 * 60_000).toISOString(),
              }
            : {}),
        },
        'PATCH',
      );
      setEditing(null);
      setMessage('서버에 일정 변경을 저장했어요.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '저장을 확인하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionHeading
        eyebrow="03 · 오늘 일정"
        title="오늘은 이런 만남이 있어요"
        description={date(snapshot.now, snapshot.settings.timeZone)}
        back={back}
      />
      <div className="schedule-list">
        {snapshot.visits.map((visit) => (
          <section
            className={`visit-row ${visit.status === 'cancelled' ? 'cancelled' : ''}`}
            key={visit.id}
          >
            <div className="schedule-icon">
              <CalendarDays aria-hidden="true" />
            </div>
            <div className="visit-info">
              <span className="tag">{visitLabels[visit.status]}</span>
              <h2>{visit.alias}</h2>
              <p>
                {time(visit.startsAt, snapshot.settings.timeZone)} –{' '}
                {time(visit.endsAt, snapshot.settings.timeZone)}
              </p>
              <p className="small muted">등록한 예정이에요. 실제 방문 여부는 확인하지 않아요.</p>
              <button
                className="text-button"
                disabled={!online || busy}
                onClick={() => setEditing(editing?.id === visit.id ? null : visit)}
              >
                시연 일정 변경
              </button>
              {editing?.id === visit.id && (
                <div className="edit-visit">
                  <p className="small">가상 일정을 변경하거나 취소할 수 있어요.</p>
                  <button disabled={busy} onClick={() => void update(visit, 'changed')}>
                    30분 늦추기
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void update(visit, visit.status === 'cancelled' ? 'scheduled' : 'cancelled')
                    }
                  >
                    {visit.status === 'cancelled' ? '예정으로 되돌리기' : '방문 취소하기'}
                  </button>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <NextButton onClick={next}>가족과 나눌 이야기 만들기</NextButton>
    </>
  );
}

const topics = [
  {
    value: 'hello' as const,
    title: '안부를 전하고 싶어요',
    description: '오늘도 잘 지내고 있는지',
    icon: Sun,
  },
  {
    value: 'meal' as const,
    title: '함께 밥 먹고 싶어요',
    description: '맛있는 한 끼를 함께',
    icon: Coffee,
  },
  {
    value: 'walk' as const,
    title: '같이 걷고 싶어요',
    description: '날씨 좋은 날, 천천히',
    icon: MessageCircle,
  },
];
export function Family({ online, back }: { online: boolean; back: () => void }) {
  const [draft, setDraft] = useState<FamilyDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function makeDraft(topic: DraftTopic) {
    setBusy(true);
    setError('');
    try {
      setDraft(await api<FamilyDraft>('/drafts', { topic }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '초안을 만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionHeading
        eyebrow="04 · 가족 이야기"
        title="어떤 이야기를 나눠볼까요?"
        description="마음에 드는 이야기를 고르면 짧은 문장을 준비해드려요."
        back={back}
      />
      <div className="topic-list">
        {topics.map((topic) => (
          <button
            key={topic.value}
            disabled={!online || busy}
            onClick={() => void makeDraft(topic.value)}
          >
            <topic.icon aria-hidden="true" />
            <span>
              <strong>{topic.title}</strong>
              <small>{topic.description}</small>
            </span>
            <ArrowUpRight aria-hidden="true" />
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error-note">
          {error}
        </p>
      )}
      {busy && <p role="status">문장을 준비하고 있어요…</p>}
      {draft && (
        <section className="draft-panel" aria-live="polite">
          <p className="eyebrow">가족에게 전하고 싶은 말</p>
          <blockquote>{draft.text}</blockquote>
          <span className="tag">초안 · 아직 보내지 않았어요</span>
          <p className="small muted">직접 이야기할 때 참고하세요. 메시지 전송 기능은 없어요.</p>
        </section>
      )}
      <NextButton onClick={back}>오늘 화면으로 돌아가기</NextButton>
    </>
  );
}

export function News({
  speak,
  back,
}: {
  speak: (text: string) => Promise<unknown>;
  back: () => void;
}) {
  const [result, setResult] = useState<NewsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    try {
      setResult(await api<NewsResult>('/news'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '뉴스 연결을 확인하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionHeading
        eyebrow="잠깐, 세상 이야기"
        title="오늘의 뉴스 한 조각"
        description="출처가 있는 기사 제목을 최대 세 개 가져와요."
        back={back}
      />
      <button className="primary" disabled={busy} onClick={() => void load()}>
        <RefreshCw size={24} aria-hidden="true" />
        {busy ? '뉴스를 가져오는 중…' : '뉴스 가져오기'}
      </button>
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="notice" role="status">
            {result.status === 'fresh'
              ? '최근 가져온 뉴스'
              : result.status === 'stale'
                ? '이전에 저장한 뉴스 · 최신 내용이 아닐 수 있어요'
                : '뉴스를 가져오지 못했어요'}{' '}
            · {result.message}
          </p>
          {result.fetchedAt && (
            <p className="small muted">
              가져온 시각: {new Date(result.fetchedAt).toLocaleString('ko-KR')}
            </p>
          )}
          <div className="news-list">
            {result.articles.map((article) => (
              <article key={article.id}>
                <p className="small muted">
                  {article.source} · {new Date(article.publishedAt).toLocaleString('ko-KR')}
                </p>
                <h2>{article.title}</h2>
                <div className="row wrap">
                  <button onClick={() => void speak(`${article.source}. ${article.title}`)}>
                    <Volume2 aria-hidden="true" size={22} />
                    제목 듣기
                  </button>
                  <a
                    className="button"
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    원문 보기 <ArrowUpRight size={22} aria-hidden="true" />
                    <span className="sr-only">새 탭</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
