import { useState, type CSSProperties, type PointerEvent } from 'react';
import type { VoicePhase } from '../../shared/contracts';

/** Vector interpretation of the user's yellow cat reference, shared by logo and companion. */
function CatArtwork({ speaking = false }: { speaking?: boolean }) {
  return (
    <svg className="cat-art" viewBox="0 0 220 180" aria-hidden="true">
      <g className="cat-body">
        <path
          className="cat-silhouette"
          d="M25 72C21 49 24 13 40 10C54 7 70 24 81 39C99 35 119 36 135 39C150 24 169 10 183 15C196 20 198 48 196 70C211 90 216 119 202 137C188 156 152 162 113 162C74 162 39 159 22 145C2 129 7 96 25 72Z"
          fill="#ffdf68"
        />
        <g className="cat-face">
          <g className="cat-eyes" fill="#3b2919">
            <circle className="cat-eye" cx="68" cy="110" r="8" />
            <circle className="cat-eye" cx="147" cy="112" r="8" />
          </g>
          {speaking ? (
            <ellipse
              className="cat-mouth-speaking"
              cx="105"
              cy="124"
              rx="9"
              ry="10"
              fill="#3b2919"
            />
          ) : (
            <path
              d="M88 121C92 130 99 129 105 121C111 129 119 130 123 121"
              fill="none"
              stroke="#3b2919"
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>
      </g>
    </svg>
  );
}

export function DaylaLogo() {
  return (
    <span className="dayla-logo">
      <CatArtwork />
      <span>
        dayla<span className="wordmark-dot">.</span>
      </span>
    </span>
  );
}

/** CSS handles gentle state motion; measured audio level drives speaking movement. */
export function DaylaCharacter({ phase, level }: { phase: VoicePhase; level: number }) {
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const amount = Math.min(1, Math.max(0, level));
  const followPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setGaze({
      x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 6,
      y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 4,
    });
  };
  return (
    <div
      className={`dayla-character character-${phase} ${amount > 0.01 ? 'has-audio' : ''}`}
      aria-hidden="true"
      onPointerMove={followPointer}
      onPointerLeave={() => setGaze({ x: 0, y: 0 })}
      style={
        {
          '--gaze-x': `${gaze.x}px`,
          '--gaze-y': `${gaze.y}px`,
          '--voice-lift': `${-amount * 4}px`,
          '--mouth-open': 0.25 + amount,
        } as CSSProperties
      }
    >
      <CatArtwork speaking={phase === 'speaking'} />
    </div>
  );
}
