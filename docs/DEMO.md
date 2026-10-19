# Presenter guide: a gentle start to the day

This guide is separate from the product UI. The app does not display demo/example labels. Explain verbally that the seeded medication and visit are fictional and that a recorded medication response is a self-report.

## Before presenting

1. Build and start Dayla. Open `http://127.0.0.1:3001/?presenter=1` on the presentation PC.
2. Configure existing Composio/ElevenLabs credentials in `.env` and restart if using cloud voice. Check actual microphone transcription and listen to playback; a configured status alone does not prove a working provider.
3. Alternatively choose browser voice explicitly when offered. Verify recognition support and a local English output voice on this browser. If either fails, retain the visible error and use the composer; do not represent typed input as successful speech.
4. Keep the page foreground and the computer awake. Set volume and speaking pace in Settings. Enable hourly check-ins outside quiet hours.
5. Choose **Reset morning** and confirm only when the local records can be cleared. This resets the controlled clock to 08:59, clears its prepared check-ins and visit history, and clears family drafts and delivery cues. Live-schedule self-reports are preserved. It does not change OS time. Use a separate `DAYLA_DB_PATH` if preserving other records matters.

## Three-minute flow

1. **A quiet greeting.** Show the character and “Good morning.” Say **“What time is it?”** after tapping the cat, then tap the cat again to finish recording. Let Dayla answer. A successful user-initiated voice interaction enables subsequent foreground announcements.
2. **A timely check-in.** Choose **Advance 1 minute**. At 09:00, Dayla announces the time and the due medication check-in once. It asks what to record; it does not tell the person to take a dose.
3. **A confirmed response.** Say **“I took my medication.”** Dayla asks for confirmation. Say **“Yes”** or select **Confirm**. Open Medication to show the saved self-report and its timestamp. **“Not yet”** and **“I am not sure”** are equally valid choices.
4. **What comes next.** Return to Conversation and ask **“What is on my schedule?”** Open Schedule to show the planned 15:00 visit. A scheduled visit is not proof it happened.
5. **A little connection.** Open Family, choose a harmless topic and create a draft. Point out that it stays local and no message is sent.
6. **Continuity.** Reload and review Medication. The response persists, while the elapsed hourly cue does not replay. A correction retains the previous record.

Choose **Use current time** to return to the live clock after the walkthrough. The controlled clock mode persists across restarts until changed; removing the presenter URL alone does not resume it.

## Optional evidence

Show a cancelled confirmation, a deliberate correction, or a failed server connection without claiming a save succeeded. News is optional and should retain its real unavailable/stale state when needed. Do not substitute mock audio for live provider evidence.
