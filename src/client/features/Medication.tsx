import { useState } from 'react';
import { Check, CircleHelp, Clock3, ArrowUpRight } from 'lucide-react';
import type { ReportValue, Snapshot, MedicationOccurrence } from '../../shared/contracts';
import { reportLabels, time, type Mutate } from '../lib/api';
import { ConfirmDialog, NextButton, SectionHeading } from '../components';

export function Medication({
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
  const [pending, setPending] = useState<{
    occurrence: MedicationOccurrence;
    value: ReportValue;
    requestId: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const due = snapshot.medications.filter(
    (item) => Date.parse(item.scheduledAt) <= Date.parse(snapshot.now),
  );
  async function save() {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      await mutate(`/occurrences/${encodeURIComponent(pending.occurrence.id)}/responses`, {
        value: pending.value,
        requestId: pending.requestId,
        expectedResponseId: pending.occurrence.response?.id ?? null,
      });
      setSaved('Your check-in is saved.');
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t confirm your check-in was saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionHeading
        eyebrow="YOUR DAILY CHECK-IN"
        title="How are you doing with your medication?"
        description="Keep a record of what you tell me. You can update it whenever you need."
        back={back}
      />
      {saved && (
        <p className="success-note" role="status">
          <Check aria-hidden="true" />
          {saved}
        </p>
      )}
      {!due.length && (
        <div className="empty-state">
          <Clock3 size={44} aria-hidden="true" />
          <h2>Your next check-in is coming up</h2>
          <p>Your medication check-in will appear at its scheduled time.</p>
        </div>
      )}
      {due.map((occurrence) => (
        <section className="medication-block" key={occurrence.id}>
          <div className="row spread">
            <span className="tag">Medication check-in</span>
            <span>{time(occurrence.scheduledAt, snapshot.settings.timeZone)}</span>
          </div>
          <h2>{occurrence.label}</h2>
          <p className="muted">
            {occurrence.response
              ? `Your response: ${reportLabels[occurrence.response.value]}`
              : 'No response recorded yet.'}
          </p>
          {occurrence.response && (
            <p className="small">
              Recorded at {time(occurrence.response.recordedAt, snapshot.settings.timeZone)} · You
              can update this below
            </p>
          )}
          <div className="response-options">
            {(['taken', 'not-yet', 'unsure'] as ReportValue[]).map((value, index) => {
              const Icon = [Check, Clock3, CircleHelp][index];
              return (
                <button
                  key={value}
                  disabled={!online || busy}
                  onClick={() => {
                    setError('');
                    setPending({ occurrence, value, requestId: crypto.randomUUID() });
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{reportLabels[value]}</span>
                  <ArrowUpRight aria-hidden="true" size={20} />
                </button>
              );
            })}
          </div>
          <p className="small muted">
            Follow the instructions from your care team. Dayla records your response without
            changing your medication plan.
          </p>
        </section>
      ))}
      <NextButton onClick={next}>See your schedule</NextButton>
      {pending && (
        <ConfirmDialog
          title="Save this check-in?"
          busy={busy}
          confirm={() => void save()}
          cancel={() => setPending(null)}
        >
          <p>
            {pending.occurrence.label} ·{' '}
            {time(pending.occurrence.scheduledAt, snapshot.settings.timeZone)}
          </p>
          <p className="confirmation-value">{reportLabels[pending.value]}</p>
          <p className="small">Your earlier response will remain in your history.</p>
          {error && (
            <p role="alert" className="error-note">
              {error}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

export function Records({ snapshot }: { snapshot: Snapshot }) {
  return (
    <>
      <header className="history-heading">
        <p className="eyebrow">YOUR HISTORY</p>
        <h2>Your check-ins</h2>
        <p className="muted">Your responses and updates, in one place.</p>
      </header>
      {snapshot.responses.length ? (
        <ol className="record-list">
          {[...snapshot.responses].reverse().map((record) => (
            <li key={record.id}>
              <span className="record-dot" />
              <div>
                <p className="small muted">
                  {time(record.recordedAt, snapshot.settings.timeZone)} ·{' '}
                  {record.supersedesId === null ? 'First response' : 'Updated response'}
                </p>
                <h2>{reportLabels[record.value]}</h2>
                <p className="small">
                  {snapshot.medications.find((item) => item.id === record.occurrenceId)?.label ??
                    'Medication check-in'}{' '}
                  · Self-reported
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state">
          <Clock3 aria-hidden="true" size={44} />
          <h2>No check-ins yet</h2>
          <p>Your saved responses will appear here.</p>
        </div>
      )}
    </>
  );
}
