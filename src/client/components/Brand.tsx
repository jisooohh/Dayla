import { useId } from 'react';
import type { VoicePhase } from '../../shared/contracts';

/** Original Dayla mark: a sunrise folded into a friendly lowercase d. */
export function DaylaLogo() {
  const id = useId();
  return (
    <span className="dayla-logo">
      <svg width="38" height="38" viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#ef946d" />
            <stop offset="1" stopColor="#d46145" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="17" fill={`url(#${id})`} />
        <path d="M31 11v15a9 9 0 1 1-4-7.5V11" fill="#fff8ed" />
        <circle cx="21" cy="27" r="1.3" fill="#79462e" />
        <circle cx="27" cy="27" r="1.3" fill="#79462e" />
        <path
          d="M22 31q2 2 4 0"
          fill="none"
          stroke="#79462e"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span>
        dayla<span className="wordmark-dot">.</span>
      </span>
    </span>
  );
}

/** Audio amplitude drives the mouth and body; no video or character service. */
export function DaylaCharacter({ phase, level }: { phase: VoicePhase; level: number }) {
  const id = useId();
  const amount = Math.min(1, Math.max(0, level));
  return (
    <div className={`dayla-character character-${phase}`} aria-hidden="true">
      <svg
        viewBox="0 0 180 180"
        width="142"
        height="142"
        style={{ transform: `translateY(${-amount * 5}px) scale(${1 + amount * 0.035})` }}
      >
        <defs>
          <linearGradient id={id} x1=".1" y1="0" x2=".8" y2="1">
            <stop stopColor="#fff1ce" />
            <stop offset="1" stopColor="#efb885" />
          </linearGradient>
        </defs>
        <ellipse cx="90" cy="154" rx="38" ry="6" fill="#b99984" opacity=".12" />
        <path
          d="M55 72Q42 51 57 48Q70 45 76 59Q98 48 119 63Q144 76 137 107Q133 137 105 144Q70 153 50 129Q30 109 42 86Z"
          fill={`url(#${id})`}
          stroke="#d2a278"
          strokeWidth="1.2"
        />
        <ellipse className="character-eye" cx="73" cy="93" rx="4" ry="6" fill="#594b40" />
        <ellipse className="character-eye" cx="108" cy="93" rx="4" ry="6" fill="#594b40" />
        <ellipse cx="61" cy="106" rx="7" ry="4" fill="#e89c87" opacity=".45" />
        <ellipse cx="120" cy="106" rx="7" ry="4" fill="#e89c87" opacity=".45" />
        {phase === 'speaking' ? (
          <ellipse cx="91" cy="111" rx={5 + amount * 3} ry={2 + amount * 10} fill="#795040" />
        ) : (
          <path
            d="M83 108q8 9 16 0"
            fill="none"
            stroke="#795040"
            strokeWidth="3"
            strokeLinecap="round"
          />
        )}
        <path
          d="M47 112q-11 0-13-9M136 110q12-2 13-12"
          fill="none"
          stroke="#d2a278"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
