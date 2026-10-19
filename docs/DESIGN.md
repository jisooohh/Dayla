# Dayla design and demo contract

## Source and provenance

User-selected source: https://github.com/Atharvsinh-codez/Project-1
Reviewed revision: 7f0d2406cf7af012386ebbea0ee47e0383251cb8 (Create LICENSE).
Root LICENSE: MIT, Copyright (c) 2026 Project-1 By Atharvsinh Jadav.
Preserved text: docs/licenses/Project-1-MIT.txt.
README still says proprietary / all rights reserved. This mismatch is recorded, not concealed. Root LICENSE is the explicit permission document at this revision. Do not claim every bundled image or font is cleared by that document.

Implemented code adaptation sources:

- app/globals.css: cream background #f9efe3.
- app/(protected)/layout.tsx: sidebar and white content-panel composition.
- components/dashboard/StatCard.tsx: orange primary / cream secondary cards and rounded treatment.

Codex is authorized to implement now. Record actual adaptation destinations and transformations in THIRD_PARTY_NOTICES.md; Cline can later work on the same files without being required at runtime.

Do not copy photos, logos, trading screenshots, social brand illustrations or externally hosted fonts. The source dashboard image includes an Obsidianui. logo; asset provenance is not established. Use a text Dayla wordmark, CSS geometry, and system fonts supporting Korean.

## Visual system

The implementation uses this cream/orange palette throughout.

- Canvas: #f9efe3.
- Content panels: white, quiet borders, rounded corners, ample whitespace.
- Highlight surface: #F2723B with #18181b text (approximately 6.11:1).
- Primary action: #a43f1e with white text (approximately 6.35:1).
- Do not reuse white text on #F2723B (approximately 2.90:1).
- Korean body: 28px; clock: 64px or larger; primary targets: at least 72px high.
- Text-first controls, clear focus rings, non-color status descriptions.
- At narrower widths/200% zoom, collapse sidebar into a top navigation and stack cards vertically.
- Avoid heavy animation; honor reduced-motion settings.
- Primary navigation: Today, Records, Settings. Keep time, medication, schedule, news and family controls within two levels.

## One demo: start the day at 9 AM

All names, schedules and medication labels are fictional. Display DEMO and the simulated date/time persistently. Use an isolated demo dataset and injected clock; never change OS time or real reminders.

1. Home shows 08:59 and a large friendly clock card. The presenter starts a clearly labeled demo clock; a direct time-listen button is always available.
2. Advance to 09:00 while the app is foreground: one hourly cue and the due fictional medication occurrence appear. If Korean speech cannot run, explicitly show voice setup/failure rather than substituting a fake success.
3. Select self-reported response for the exact occurrence. Show saved-at time only after durable server acknowledgement. Unknown and not-yet options remain equally accessible.
4. Continue to the day schedule: helper alias arriving at 15:00, explicitly scheduled, not confirmed visited.
5. Continue to family conversation: choose a harmless topic and create a local sentence draft. Show that no message was sent; exclude medication information.
6. Reload and verify the earlier response persists. The elapsed 09:00 cue must not replay.

Secondary news is reachable without interrupting this flow and is not needed to finish it. Failed news fetch does not block time, response storage or family draft functionality.

## Demo evidence

Target a roughly three-minute recording with one successful flow and a short restart proof. Capture actual application behavior. Show missing integrations honestly. A simulation badge covers only time/data simulation, never unimplemented storage or speech.
