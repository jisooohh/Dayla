# Dayla verification evidence

## Current voice-first revision

Verified on 2026-10-20 using Node22.13.0 and Playwright1.64.1 / Chromium156:

- Formatting, ESLint, TypeScript and production build pass.
- **48 unit/API tests pass** across storage, clock, conversation, RSS, speech playback and voice-provider adapters.
- **16 browser scenarios pass**, including medication confirmation and durability, correction history, visit editing, persisted family drafts, offline/error behavior, fallback consent, late-result cancellation and non-interrupting hourly cues.
- The cloud path uses Chromium's real MediaRecorder, fake microphone device, AudioContext decoder/analyser and generated WAV responses. Recording begins on click, data is bounded, tracks end, playback completes and audio contexts close. External provider responses are mocked; this does not prove a live ElevenLabs account.
- Axe found no violations in the tested home, medication and family states. Desktop1440px, reflow720px and mobile390px were checked. A final targeted visual test passed after hiding closed mobile navigation from keyboard focus. Native browser zoom and screen reader use remain manual checks.
- [Desktop capture](assets/dayla-home.png) and [mobile capture](assets/dayla-mobile.png) were visually reviewed. The home has a greeting, character, soft gradient and one composer; secondary features stay in the sidebar. Product labels omit demo/example/simulation wording.
- Live BBC retrieval returned HTTP200, fresh status and three attributed headlines. No paid voice request was made.
- Cue start deadline remains15 seconds; a claimed owner has150 seconds to report completion. Reset, settings changes and restart still invalidate outstanding cues.

## Live provider and device status

The connected Composio tool was inspected during this revision: its ElevenLabs Instant account permits selected speech-synthesis/conversion tools, but speech-to-text is not in that allowlist. The user's private ElevenLabs connection is still initiated/pending. No server API credentials were found in the checked local project configuration. Dayla therefore offers explicitly selected browser voice; its optional Composio/direct ElevenLabs adapter is implemented but not live authenticated. Instant wallet calls were not executed. Configuration detection is not an account-health check.

Before an audio presentation, verify microphone permission, English transcription, actual playback and character movement on the chosen PC/browser. Check the explicit browser fallback separately if it will be used. An automated browser mock cannot establish pronunciation, latency, listening quality, actual provider billing or offline behavior.

Check native browser zoom and a screen reader on the presentation device. Automated accessibility scans and viewport reflow are useful but not complete accessibility proof. Sleep/lock and hidden-tab delivery are not guaranteed; keep existing phone reminders.

## Historical baseline

Commit `27b94b09617afc8aafae51f1a965ae54c4746fd9` was verified on 2026-10-20 with Node 22.13.0 and Playwright 1.64.1 / Chromium 156. It passed formatting, lint, typecheck, build, 19 unit/integration tests and 8 browser scenarios. That baseline used a Korean dashboard, local Korean speech and a KBS news feed. Its counts, screenshots and external connectivity results must not be reused as evidence for the English voice-first revision.

## Open-source handoff

Preserve the MIT license and Project-1 provenance, original vector assets and dependency notices. Exclude databases, credentials, recordings and raw agent sessions from Git. Cline authentication remains deferred and no successful Cline implementation is claimed. The delivery message records the final commit and remote verification when available.
