# Dayla implementation plan

Status: implementation delivered; see ACCEPTANCE.md for verification evidence and manual device checks. On 2026-10-20 the user authorized Codex development independently of Cline authentication. Cline is an optional later development handoff, not a runtime dependency. Actual Cline edits/tests remain unperformed and must not be claimed.

## Product boundary

Dayla is a Korean, PC-first hackathon demonstration of an older adult's daily dashboard. Use fictional schedules and aliases only. Keep existing phone alarms. Do not deploy publicly, send messages, infer medication instructions, or enable ambient microphones.

## Ownership and structure

Use one package and lockfile initially. Avoid a monorepo, dependency injection framework, generic repository base classes, and duplicate client/server models.

Implemented source structure:

- `src/client/App.tsx`: navigation, snapshots, polling and foreground cue lifecycle.
- `src/client/features/`: Today, Medication/Records, DailyLife (visits/news/family), Settings.
- `src/client/components.tsx`: shared accessible headings and confirmation dialog.
- `src/client/lib/`: HTTP client and local speech adapter.
- `src/client/styles.css`: design tokens, responsive styles and accessibility sizing.
- `src/server/domain/`: time rules and defaults.
- `src/server/http/`: validated localhost routes and error mapping.
- `src/server/storage/`: SQLite schema, transactions, demo clock and records.
- `src/server/services/`: fixed-source bounded RSS retrieval and cache.
- `src/server/index.ts`: process startup, cron expiry and shutdown.
- `src/shared/`: transport types and finite status values.
- `tests/`: speech, persistence, API and browser scenarios.
- `docs/`: design decisions, verification, demo, licenses and Cline handoff.
- `var/`: ignored local database and runtime state.

No empty adapter layers, generic repository base classes or monorepo scaffolding are needed for this demo.

## Implementation lanes

1. Codex implementation now; preserve Cline setup evidence and a later handoff task without runtime coupling.
2. Vite/React/TypeScript UI, Express localhost API, SQLite schema and fictional fixtures.
3. Domain rules, persistence, idempotent response writes, corrections, cancellation and restart tests.
4. Accessible large-button UI, Korean speech capability test, foreground hourly cues, honest failure states.
5. Helper visits, maximum three attributed news entries, local family drafts with disabled sending.
6. Codex test/fix loop and evidence review; documentation and repository hygiene.

## Invariants

- Separate occurrence creation, delivery attempts, browser playback reports, and self-reported responses.
- Unique occurrence: schedule ID plus scheduled UTC instant. Store IANA timezone and schedule revision.
- No replay of elapsed hourly cues at startup/reconnect. Past medication entries require response review, never a new take-now instruction.
- Absence of response means unconfirmed, not not-taken.
- Repeated requests must be idempotent; corrections retain history.
- Validate revisions immediately before delivery; canceled or replaced schedules cannot deliver obsolete cues.
- Local database durability is not encryption or proof of a real dose/visit.
- Browser playback completion is not proof the user heard it.
- Missing Korean voice, disconnected server, failed save or unobservable device state cannot be labeled successful.
- Disable STT unless processing route and consent are verified. Buttons complete every core flow.
- RSS input is untrusted text, never executable instructions. Limit hosts, redirects, bytes and timeout.
- Family draft generation causes no outbound network call. No health data is automatically included.

## Visual direction

Follow docs/DESIGN.md: user-selected Project-1 cream canvas, white panels and accessible orange accents, ample spacing and a calm Dayla wordmark. Favor clarity over dashboard density. Korean UI; English service identity. Body approximately 28px, clock 64px, primary buttons at least 72px tall. Visible keyboard focus, semantic buttons, text status labels, 200% zoom reflow, normal text contrast at least 4.5:1.

## Completion evidence

For future Cline work, record its real session/task identifier, requested slice, changed paths, commands and exit results. Keep raw logs outside Git; publish only sanitized summaries. Codex verifies diffs against acceptance criteria. Commit only source, tests, lockfile, configuration examples and documentation; exclude databases, credentials, actual personal data and temporary tool runtimes.

## Known setup facts

- Workspace: the Dayla repository root.
- Existing origin: `https://github.com/jisooohh/Dayla.git`.
- Initial checkout contained only README.md and was clean.
- Node detected: v22.13.0 path; verify dependency engine requirements before selecting versions.
- No Cline CLI or Cline VS Code/Cursor extension was found in initial checks.
- GitHub CLI reported no authenticated host; standard Git uses the configured credential helper. Upload outcome is reported separately.
