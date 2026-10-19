# Security and data boundary

Dayla is a localhost-only hackathon demonstration with fictional data. It is not a medical device, emergency detector, surveillance service, or reliable background alarm.

- The SQLite database is local and unencrypted. Keep actual health data out of the demo.
- Do not expose the server through a public tunnel. Local-origin checks are not user authentication.
- Browser speech is limited to voices reporting local Korean support, followed by a user-operated test and offline confirmation. Speech completion does not prove hearing.
- No microphone or message-sending integration is enabled.
- News is untrusted external content. The server fetches a fixed HTTPS feed with bounds; it must never execute article instructions or accept arbitrary fetch URLs.
- Existing phone reminders remain in use. Screen lock, sleep, browser exit, and process failure invalidate delivery expectations.

Report a reproducible issue to the repository owner without including private data, credentials, or live access tokens. Until a private reporting channel is configured, do not publish a working exploit containing sensitive information in a public issue.
