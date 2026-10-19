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
  scheduled: 'Scheduled',
  changed: 'Rescheduled',
  cancelled: 'Cancelled',
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
      setMessage('Your schedule has been updated.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Couldn’t confirm the change was saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionHeading
        eyebrow="YOUR DAY"
        title="A little something to look forward to."
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
              <p className="small muted">A planned visit. Attendance hasn’t been confirmed.</p>
              <button
                className="text-button"
                disabled={!online || busy}
                onClick={() => setEditing(editing?.id === visit.id ? null : visit)}
              >
                Edit visit
              </button>
              {editing?.id === visit.id && (
                <div className="edit-visit">
                  <p className="small">Make a change to your visit.</p>
                  <button disabled={busy} onClick={() => void update(visit, 'changed')}>
                    Move 30 minutes later
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void update(visit, visit.status === 'cancelled' ? 'scheduled' : 'cancelled')
                    }
                  >
                    {visit.status === 'cancelled' ? 'Restore visit' : 'Cancel visit'}
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
      <NextButton onClick={next}>Make a family note</NextButton>
    </>
  );
}

const topics = [
  {
    value: 'hello' as const,
    title: 'Say hello',
    description: 'A little note to let them know you care',
    icon: Sun,
  },
  {
    value: 'meal' as const,
    title: 'Share a meal',
    description: 'Good food and a little time together',
    icon: Coffee,
  },
  {
    value: 'walk' as const,
    title: 'Take a walk',
    description: 'Fresh air, at your own pace',
    icon: MessageCircle,
  },
];
export function Family({
  online,
  back,
  savedDraft,
}: {
  online: boolean;
  back: () => void;
  savedDraft: FamilyDraft | null;
}) {
  const [draft, setDraft] = useState<FamilyDraft | null>(savedDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function makeDraft(topic: DraftTopic) {
    setBusy(true);
    setError('');
    try {
      setDraft(await api<FamilyDraft>('/drafts', { topic }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t prepare your note.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionHeading
        eyebrow="STAY CLOSE"
        title="A small note. A little closer."
        description="Choose what’s on your mind, and I’ll help find the words."
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
      {busy && <p role="status">Finding the words…</p>}
      {draft && (
        <section className="draft-panel" aria-live="polite">
          <p className="eyebrow">A NOTE FOR YOUR FAMILY</p>
          <blockquote>{draft.text}</blockquote>
          <span className="tag">Draft · Not sent</span>
          <p className="small muted">
            Keep this for your next conversation. No message has been sent.
          </p>
        </section>
      )}
      <NextButton onClick={back}>Back to conversation</NextButton>
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
      setError(e instanceof Error ? e.message : 'Couldn’t connect to the news.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionHeading
        eyebrow="AROUND THE WORLD"
        title="Something new to talk about."
        description="A few headlines, with a link to the original story."
        back={back}
      />
      <button className="primary" disabled={busy} onClick={() => void load()}>
        <RefreshCw size={24} aria-hidden="true" />
        {busy ? 'Finding headlines…' : 'Get the news'}
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
              ? 'Latest headlines'
              : result.status === 'stale'
                ? 'Saved headlines · May not be up to date'
                : 'News is unavailable right now'}{' '}
            · {result.message}
          </p>
          {result.fetchedAt && (
            <p className="small muted">
              Retrieved: {new Date(result.fetchedAt).toLocaleString('en-US')}
            </p>
          )}
          <div className="news-list">
            {result.articles.map((article) => (
              <article key={article.id}>
                <p className="small muted">
                  {article.source} · {new Date(article.publishedAt).toLocaleString('en-US')}
                </p>
                <h2>{article.title}</h2>
                <div className="row wrap">
                  <button onClick={() => void speak(`${article.source}. ${article.title}`)}>
                    <Volume2 aria-hidden="true" size={22} />
                    Read headline
                  </button>
                  <a
                    className="button"
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Read story <ArrowUpRight size={22} aria-hidden="true" />
                    <span className="sr-only">Opens in a new tab</span>
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
