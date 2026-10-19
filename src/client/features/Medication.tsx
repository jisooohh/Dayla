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
      setSaved('본인 응답을 저장했어요. 아래에서 기록 시각을 확인하세요.');
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장을 확인하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionHeading
        eyebrow="02 · 내 응답"
        title="지금의 응답을 남겨주세요"
        description="직접 답하신 내용을 기록해요. 실제 복용 여부를 확인하는 기능은 아니에요."
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
          <h2>아직 응답할 약 알림이 없어요</h2>
          <p>시연 시간을 오전 9시로 넘기면 예시 일정이 나타나요.</p>
        </div>
      )}
      {due.map((occurrence) => (
        <section className="medication-block" key={occurrence.id}>
          <div className="row spread">
            <span className="tag">가상 복약 일정</span>
            <span>{time(occurrence.scheduledAt, snapshot.settings.timeZone)}</span>
          </div>
          <h2>{occurrence.label}</h2>
          <p className="muted">
            {occurrence.response
              ? `저장된 응답: ${reportLabels[occurrence.response.value]}`
              : '응답이 아직 확인되지 않았어요.'}
          </p>
          {occurrence.response && (
            <p className="small">
              기록 시각 {time(occurrence.response.recordedAt, snapshot.settings.timeZone)} ·
              아래에서 정정할 수 있어요
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
            약의 양이나 시간을 바꾸는 안내는 하지 않아요. 이전 시간의 알림이라면 응답 기록을
            확인해주세요.
          </p>
        </section>
      ))}
      <NextButton onClick={next}>오늘 일정 살펴보기</NextButton>
      {pending && (
        <ConfirmDialog
          title="이 응답을 기록할까요?"
          busy={busy}
          confirm={() => void save()}
          cancel={() => setPending(null)}
        >
          <p>
            {pending.occurrence.label} ·{' '}
            {time(pending.occurrence.scheduledAt, snapshot.settings.timeZone)}
          </p>
          <p className="confirmation-value">{reportLabels[pending.value]}</p>
          <p className="small">이전 응답이 있다면 정정 이력을 함께 남겨요.</p>
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
      <SectionHeading
        eyebrow="나의 기록"
        title="답하신 그대로, 차곡차곡"
        description="본인 응답과 정정 이력을 함께 보관해요."
      />
      {snapshot.responses.length ? (
        <ol className="record-list">
          {[...snapshot.responses].reverse().map((record) => (
            <li key={record.id}>
              <span className="record-dot" />
              <div>
                <p className="small muted">
                  {time(record.recordedAt, snapshot.settings.timeZone)} ·{' '}
                  {record.supersedesId === null ? '첫 응답' : '정정된 응답'}
                </p>
                <h2>{reportLabels[record.value]}</h2>
                <p className="small">
                  {snapshot.medications.find((item) => item.id === record.occurrenceId)?.label ??
                    '복약 응답'}{' '}
                  · 본인 보고
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state">
          <Clock3 aria-hidden="true" size={44} />
          <h2>아직 남긴 응답이 없어요</h2>
          <p>약 알림에서 답하시면 이곳에 보관해요.</p>
        </div>
      )}
    </>
  );
}
