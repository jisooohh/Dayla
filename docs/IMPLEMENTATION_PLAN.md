# Dayla implementation contract

The 2026-10-20 update changes Dayla from a Korean dashboard to an English voice-first companion. Codex implementation is authorized independently of Cline authentication. Cline remains an optional future development workflow. Current verification is tracked in [ACCEPTANCE.md](ACCEPTANCE.md).

## Product boundary

A minimal conversation home supports time, medication self-reports, visits and family drafts. Additional features live in sidebar tabs. The dialogue is a bounded rule-based service; there is no general-purpose LLM runtime. Existing accounts may provide ElevenLabs speech through Composio or a direct key. Browser recognition requires a separate explicit choice. No ambient microphone, message sending, medical advice, public deployment or background-delivery guarantee.

## Structure

- `src/client/App.tsx`: navigation, conversation, snapshot polling and foreground cue lifecycle.
- `src/client/components/Brand.tsx`: original SVG logo and character.
- `src/client/features/`: medication/history, visits, family drafts, news and settings.
- `src/client/lib/`: HTTP and voice lifecycle, cancellation and browser fallback.
- `src/server/domain/`: time rules and defaults.
- `src/server/http/`: localhost routes, payload validation and error mapping.
- `src/server/storage/`: SQLite transactions, schedules, clock modes and correction history.
- `src/server/services/`: conversation rules, bounded voice providers and fixed-source RSS.
- `src/shared/`: transport types and finite status values.
- `tests/`: persistence, conversation, provider, API and browser scenarios.

Use one package/lockfile and existing utilities. Avoid generic repository layers, unused adapters and monorepo scaffolding.

## Invariants

- Separate occurrence creation, delivery claims, playback reports and self-reported responses.
- Only an explicit confirmation saves a spoken medication report. Ambiguous, negative and historical phrasing must not be interpreted as a positive report.
- Retain idempotent requests, stale-write checks and correction history.
- Live time is the startup default for a new database. Controlled presentation time is opt-in and persisted. Response timestamps still use actual server time.
- Expired cues do not replay on startup or reconnect. Quiet hours and foreground state constrain delivery.
- A saved self-report does not prove ingestion. Playback completion does not prove hearing.
- Stop and visibility changes invalidate pending voice callbacks. No automatic microphone restart.
- Provider credentials stay server-side. Bound text, recordings, response bytes and time. Sanitize upstream errors.
- Composio is preferred when fully configured; provider errors do not trigger an undisclosed switch to another account.
- Recordings are not persisted. Family drafts cause no outbound send. News is untrusted inert text.
- Product UI contains no demo/example/simulation labeling; documentation explains the actual prototype and seed-data boundary.

## Completion evidence

Run relevant behavior tests, lint, typecheck and build. Review desktop and narrow screenshots, keyboard flow and accessibility results. Separately report actual provider/device checks; do not infer live speech success from mocks. Preserve original Project-1 license notices and accurate current adaptation paths. Keep credentials, databases, recordings and raw agent histories out of Git.
