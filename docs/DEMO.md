# One demo: a gentle start to the day

Aim for three minutes. Every schedule and label is fictional. The DEMO indicator stays visible throughout. Narration below describes intended actions; record only behavior actually observed.

1. **08:59 — understand the day.** Open Today. Show the large clock and the next fictional medication entry. Explain that the demonstration clock can advance without changing the computer clock. If a local Korean voice has been manually verified, use Time Listen; otherwise show Voice Setup Required.
2. **09:00 — record a response.** Advance the demo one minute. A single hourly occurrence is created. Open the exact `예시 약 A` occurrence, choose `복용했다고 기록`, and confirm. Point to the stored response time. This is self-report, not verified ingestion.
3. **Know what comes next.** Continue to the helper schedule at 15:00. Its state is Scheduled; the app does not infer that a visit happened.
4. **Start a conversation.** Pick a harmless topic such as lunch and generate a local family sentence draft. Show `아직 보내지 않았어요`. No message leaves the device and no medication record is attached.
5. **Prove continuity.** Reload. The same medication response is still present, and the old hourly cue is not read again. Optionally open Records to show a deliberate correction and its earlier history.

For the failure clip, stop the local server after the page loads: the page must display connection failure and must not claim a new save succeeded. Do not treat simulated speech or a mocked API as actual device evidence.

News is an optional side flow. If the feed is unavailable, retain its error state rather than replacing it with unlabelled sample news.
