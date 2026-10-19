# Dayla design contract

## Current direction

The 2026-10-20 voice-first request supersedes the earlier Korean card dashboard. The interface is English. Home contains a time-of-day greeting, an original character that acts as the voice button. Tapping it starts microphone capture after any required consent; tapping again finishes the recording. Voice status below the greeting explains the current action; a smaller white text composer provides an always-available alternative. Subtle warm yellow light sits behind the interaction area; generous white space keeps the starting state quiet. Translucent white panels use backdrop blur, white edge highlights and soft amber shadows. The composer and form inputs stay white for a clear reading surface. Native system sans-serif typography keeps headings, body copy and controls clear without a font download.

The left sidebar opens Conversation, Medication, Schedule, Family, News and Settings. It starts as a compact icon rail on desktop, with a toggle to reveal labels. The panel has 24px rounded corners and a 12px inset from the viewport. On mobile it starts hidden and opens as a rounded drawer; Escape and the backdrop close it. Desktop navigation preserves the expanded state, while selecting a mobile destination closes the drawer. Secondary details should not become a dashboard above the home composer. The original Dayla SVG mark and wordmark identify the sidebar; the character is a separate original drawing, not copied Grok branding.

## Interaction

- Start microphone capture only on user action. Use a second microphone press to finish, and an explicit Stop control to cancel.
- Keep listening, thinking, speaking and error states distinct. Cloud audio uses measured level for character motion; browser speech follows speaking state.
- Show transcripts and replies as text. Voice availability must not block text input or record review.
- Request confirmation for medication self-reports, including spoken reports. Distinguish a pending choice from a saved response.
- Keep provider status and voice settings in Settings; explain fallback consent when it becomes necessary.
- Use current local time in the configured timezone for the default greeting. Presenter clock controls are opt-in through the URL.
- Do not put “demo”, “example” or “simulation” labels in the product. Explain fictional seed data, presentation controls and limitations in repository documentation and presenter narration.

## Accessibility

Use semantic labels, visible keyboard focus, sufficiently large controls and text alternatives for voice state. Do not encode status through color or animation alone. Honor reduced-motion settings. The sidebar becomes compact navigation at narrow widths, and content must reflow without horizontal scrolling. Larger text is available in Settings. Verify actual contrast, focus, reflow and device behavior rather than treating these goals as test evidence.

## Source and provenance

User-selected source: https://github.com/Atharvsinh-codez/Project-1

Reviewed revision: `7f0d2406cf7af012386ebbea0ee47e0383251cb8` (`Create LICENSE`). Its root MIT license is preserved at [licenses/Project-1-MIT.txt](licenses/Project-1-MIT.txt). The upstream README also contains proprietary wording; [the notices](../THIRD_PARTY_NOTICES.md) disclose that discrepancy.

The earlier Dayla iteration adapted the upstream canvas, sidebar and rounded cards. The current voice-first home replaces the old clock-card composition; retain provenance for the inherited sidebar/card treatment. Do not copy upstream photos, logos, trading content or fonts. The Dayla mark, character and gradient are newly authored in this repository. Typography uses locally available/system fallbacks without a remote font request.

## Evidence

Use screenshots of the current build for visual review, including desktop and narrow viewports. Provider mocks prove state handling, not natural pronunciation or a successful live account connection. Keep the separate [presenter guide](DEMO.md) aligned with implemented intents and controls.
