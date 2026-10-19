# Security and data boundary

Dayla is a localhost-only hackathon prototype with fictional seed data. It is not a medical device, emergency detector, surveillance service, or reliable background alarm.

- The SQLite database is local and unencrypted. Keep actual health data out of presentations.
- Do not expose the server through a public tunnel. Host/origin checks are not user authentication.
- Keep `.env` and API credentials on the server. Composio and ElevenLabs credentials must never enter browser bundles, public logs or Git.
- Microphone recording begins only after user action. Cloud recognition sends a short recording to ElevenLabs, directly or using an authorization token obtained through Composio. Text-to-speech sends response text to the selected provider. Provider retention and billing are governed by those accounts; Dayla does not create accounts or purchase credits.
- Browser recognition is a separate explicit choice and may use the browser vendor's remote speech service. Browser output accepts voices reported as local and English; that browser flag is not a device-level offline audit.
- Recordings are handled in memory, not persisted locally. Stop cancels the local session; it cannot retract a request already received by a provider.
- Cloud voice requests have payload, response and time bounds. The server accepts fixed provider endpoints and validates signed audio URLs; it does not offer a general URL proxy.
- Medication responses require confirmation. A saved self-report does not prove ingestion, and speech completion does not prove hearing. No medication instruction is inferred from silence.
- Family drafts are local text. There is no message-sending integration.
- News is untrusted external text. A fixed HTTPS feed is fetched with host, size, redirect and timeout bounds. Article text is never an executable instruction.
- Keep existing phone reminders. Screen lock, sleep, a hidden tab, browser exit and process failure can prevent announcements.

Report a reproducible issue to the repository owner without private data, credentials or live access tokens. Until a private reporting channel is configured, do not publish a working exploit containing sensitive information in a public issue.
