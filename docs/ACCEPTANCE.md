# Dayla verification evidence

Verified on 2026-10-20 (Asia/Seoul), macOS arm64, Node22.13.0, Playwright1.64.1 / Chromium156.0.8078.4. Cline authentication is deferred by the user; it is not required to run or verify Dayla.

## Automated checks

| Check                                             | Evidence                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Formatting, lint, TypeScript and production build | `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`                                                                                                         |
| 19 unit/integration tests                         | `npm test`:6 store/domain,6 RSS,2 HTTP,5 speech tests                                                                                                                                |
| 8 browser scenarios                               | `npm run test:e2e`; isolated port3101 and `var/e2e.sqlite`                                                                                                                           |
| Response durability and corrections               | SQLite close/reopen preserves records; duplicate request IDs are idempotent; stale edits reject; correction retains its predecessor                                                  |
| Cue separation and expiry                         | One atomic claim, wall-clock expiry, restart invalidation, quiet hours; no claim replay on reload                                                                                    |
| Voice lifecycle                                   | Remote/non-Korean voices rejected; fallback cannot inherit another voice's confirmation; delayed claim cancelled by Stop before utterance                                            |
| Failure states                                    | Failed response save keeps confirmation open without saved claim; slow polling still updates; disconnect disables mutations and recovery reconnects                                  |
| Main flow                                         | 08:59→09:00→self-report→correction→reload→visit change/cancel→family draft; zero external browser requests in this flow                                                              |
| Accessibility                                     | Axe WCAG2 AA scan on Today, medication and family screens: zero detected violations; keyboard dialog activation/focus; main action28px and at least72px high; large-text setting32px |
| Reflow                                            | Desktop1440px,720px (equivalent CSS width for200% zoom on1440px),390px: no horizontal overflow; screenshots manually reviewed                                                        |
| News                                              | Fixed HTTPS source, redirect/host/size/timeout bounds, decoded inert text, source/URL/time, cache and stale/unavailable paths                                                        |

Speech mocks test logic, not real Korean pronunciation or offline audio. Automated Axe scans do not prove complete screen-reader usability. Reflow uses an equivalent viewport width, not the browser's native zoom control.

## Live external check

A real request to `/api/news` returned three attributed KBS WORLD Korean entertainment titles with `fresh` status. This is a point-in-time connectivity check, not an availability guarantee. Network and old-cache failures remain explicit. No model API or messaging service was called by the application.

## Manual device checks still required before an audio presentation

- Select an actual Korean local voice, disconnect the Internet, play the harmless test phrase, listen, and explicitly confirm in Settings. No human listening/offline verification was performed during implementation.
- Listen to time, schedule and fictional medication pronunciation on the presentation PC.
- Check the complete flow with the presenter's screen reader and native200% browser zoom.
- Sleep/lock behavior is not guaranteed or inferred. Keep existing phone reminders. The supported demo is an awake PC with the page foreground and local server running.

These checks do not block the complete button-based demo.

## Open-source handoff

- MIT root license and exact Project-1 license/provenance retained; no upstream photos, logos or fonts copied.
- Client/server/shared boundaries, one package/lockfile, readable formatting and feature modules.
- SQLite, secrets, recordings, raw agent sessions and browser traces excluded by `.gitignore`.
- README covers run commands, fictional data, demo flow, system boundaries and optional later Cline work.
- GitHub upload outcome is verified against the remote after committing; see the task delivery message for the commit reference.
