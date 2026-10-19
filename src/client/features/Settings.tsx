import { useState } from 'react';
import type { Settings as SettingsType, Snapshot } from '../../shared/contracts';
import type { Mutate } from '../lib/api';
import { SectionHeading } from '../components';
import type { useSpeech } from '../lib/speech';

export function Settings({
  snapshot,
  mutate,
  online,
  speech,
}: {
  snapshot: Snapshot;
  mutate: Mutate;
  online: boolean;
  speech: ReturnType<typeof useSpeech>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(patch: Partial<SettingsType>) {
    setBusy(true);
    setMessage('');
    try {
      await mutate('/settings', patch, 'PUT');
      setMessage('설정을 저장했어요.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '저장을 확인하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionHeading
        eyebrow="나에게 맞게"
        title="편하게 보고, 들어요"
        description="음성은 이 기기의 한국어 음성만 사용해요."
      />
      <div className="settings-sections">
        <section>
          <h2>한국어 음성</h2>
          <p className="small muted">
            {speech.supported
              ? '브라우저 음성 기능을 확인했어요.'
              : '이 브라우저는 음성 기능을 지원하지 않아요.'}{' '}
            {speech.voices.length
              ? '한국어 로컬 음성을 선택해주세요.'
              : '사용 가능한 한국어 로컬 음성이 없어요. 기기의 언어·음성 설정을 확인해주세요.'}
          </p>
          <label className="field">
            목소리
            <select
              value={speech.selectedVoice}
              onChange={(e) => speech.selectVoice(e.target.value)}
              disabled={!speech.voices.length}
            >
              <option value="">목소리를 선택해주세요</option>
              {speech.voices.map((voice) => (
                <option key={voice.uri} value={voice.uri}>
                  {voice.name} · 기기 내 음성
                </option>
              ))}
            </select>
          </label>
          <button disabled={!speech.selectedVoice} onClick={() => void speech.test()}>
            시험 문장 듣기
          </button>
          <p className="small muted">
            인터넷 연결을 끈 뒤 시험 문장이 한국어로 들리는지 확인해주세요. 확인 전에는 일정 내용을
            읽지 않아요.
          </p>
          <label className="check-field">
            <input
              type="checkbox"
              checked={speech.verified}
              disabled={!speech.selectedVoice}
              onChange={(e) => speech.setVerified(e.target.checked)}
            />{' '}
            인터넷 없이 한국어 재생을 직접 확인했어요
          </label>
          <p className="notice" role="status">
            {speech.status}
          </p>
        </section>
        <section>
          <h2>듣기와 화면</h2>
          <label className="field">
            읽기 속도
            <select
              disabled={busy || !online}
              value={snapshot.settings.speechRate}
              onChange={(e) => void save({ speechRate: Number(e.target.value) })}
            >
              <option value={0.7}>천천히</option>
              <option value={0.9}>조금 천천히</option>
              <option value={1}>보통</option>
              <option value={1.2}>조금 빠르게</option>
            </select>
          </label>
          <label className="field">
            음량
            <select
              disabled={busy || !online}
              value={snapshot.settings.speechVolume}
              onChange={(e) => void save({ speechVolume: Number(e.target.value) })}
            >
              <option value={0.5}>50%</option>
              <option value={0.75}>75%</option>
              <option value={1}>100%</option>
            </select>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              disabled={busy || !online}
              checked={snapshot.settings.largeText}
              onChange={(e) => void save({ largeText: e.target.checked })}
            />
            글자를 더 크게 보기
          </label>
        </section>
        <section>
          <h2>정각 시간 안내</h2>
          <label className="check-field">
            <input
              type="checkbox"
              disabled={busy || !online}
              checked={snapshot.settings.hourlyEnabled}
              onChange={(e) => void save({ hourlyEnabled: e.target.checked })}
            />{' '}
            이 화면이 열려 있을 때 정각 안내
          </label>
          <div className="field-pair">
            <label className="field">
              조용한 시간 시작
              <select
                disabled={busy || !online}
                value={snapshot.settings.quietStart}
                onChange={(e) => void save({ quietStart: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {hour}시
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              조용한 시간 종료
              <select
                disabled={busy || !online}
                value={snapshot.settings.quietEnd}
                onChange={(e) => void save({ quietEnd: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {hour}시
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="small muted">
            PC 잠금·절전·종료 시 알림을 보장하지 않아요. 기존 휴대전화 알림은 유지해주세요. 복약
            일정은 조용한 시간 설정으로 바뀌지 않아요.
          </p>
        </section>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </>
  );
}
