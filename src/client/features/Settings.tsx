import { useState } from 'react';
import type { Settings as SettingsType, Snapshot } from '../../shared/contracts';
import type { Mutate } from '../lib/api';
import { SectionHeading } from '../components';
import type { useVoice } from '../lib/voice';

export function Settings({
  snapshot,
  mutate,
  online,
  voice,
}: {
  snapshot: Snapshot;
  mutate: Mutate;
  online: boolean;
  voice: ReturnType<typeof useVoice>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(patch: Partial<SettingsType>) {
    setBusy(true);
    setMessage('');
    try {
      await mutate('/settings', patch, 'PUT');
      setMessage('Your preferences are saved.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Couldn’t save your preferences.');
    } finally {
      setBusy(false);
    }
  }
  const provider =
    voice.status?.provider === 'composio'
      ? 'ElevenLabs via Composio'
      : voice.status?.provider === 'elevenlabs'
        ? 'ElevenLabs'
        : 'Browser voice';
  return (
    <>
      <SectionHeading
        eyebrow="JUST RIGHT FOR YOU"
        title="Make yourself comfortable."
        description="A voice, a pace, and a little peace of mind."
      />
      <div className="settings-sections">
        <section>
          <h2>Your voice companion</h2>
          <p>{provider}</p>
          <p className="small muted">{voice.status?.message || 'Checking voice availability…'}</p>
          {voice.needsBrowserConsent && !voice.browserConsent && (
            <>
              <p className="small">
                Browser voice sends microphone audio to your browser’s speech service. It only
                listens when you press the microphone.
              </p>
              <button onClick={voice.enableBrowserVoice}>Enable browser voice</button>
            </>
          )}
          <button
            onClick={() => void voice.speak('Hello. I’m Dayla, and I’m here to keep you company.')}
          >
            Hear Dayla’s voice
          </button>
          <p className="small muted" role="status">
            {voice.message}
          </p>
        </section>
        <section>
          <h2>Listening & reading</h2>
          <label className="field">
            Speaking pace
            <select
              disabled={busy || !online}
              value={snapshot.settings.speechRate}
              onChange={(e) => void save({ speechRate: Number(e.target.value) })}
            >
              <option value={0.7}>Slow</option>
              <option value={0.9}>Easygoing</option>
              <option value={1}>Natural</option>
              <option value={1.2}>A little faster</option>
            </select>
          </label>
          <label className="field">
            Volume
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
            Larger text
          </label>
        </section>
        <section>
          <h2>Gentle reminders</h2>
          <label className="check-field">
            <input
              type="checkbox"
              disabled={busy || !online}
              checked={snapshot.settings.hourlyEnabled}
              onChange={(e) => void save({ hourlyEnabled: e.target.checked })}
            />
            Hourly check-ins while Dayla is open
          </label>
          <div className="field-pair">
            {(['quietStart', 'quietEnd'] as const).map((field) => (
              <label className="field" key={field}>
                {field === 'quietStart' ? 'Quiet time starts' : 'Quiet time ends'}
                <select
                  disabled={busy || !online}
                  value={snapshot.settings[field]}
                  onChange={(e) => void save({ [field]: Number(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {hour === 0
                        ? '12 AM'
                        : hour < 12
                          ? `${hour} AM`
                          : hour === 12
                            ? '12 PM'
                            : `${hour - 12} PM`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="small muted">
            Keep Dayla open and voice enabled to hear reminders. Reminders pause when your computer
            sleeps or this tab is hidden.
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
