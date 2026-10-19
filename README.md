# Dayla

**A little help, every day.**

Dayla is a Korean daily companion demo for older adults: a clear clock, self-reported medication responses, planned visits, and a kind sentence to share with family. It runs on one PC and stores its fictional records locally.

데일라는 **시간 확인 → 내 응답 기록 → 오늘 방문 일정 → 가족 이야기 초안**으로 이어지는 해커톤 시연 서비스입니다.

![Dayla desktop demo with a clock, next response and daily visit](docs/assets/dayla-home.png)

## Run locally

Use Node.js **22 LTS, 22.12 or newer** and npm. SQLite uses a native module; use an actively supported Node 22 release if installation fails.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3001**. Development with hot reload: `npm run dev`, then http://127.0.0.1:5173. Stop with Ctrl+C.

No account, API key, cloud model, Cline installation or paid service is needed. Cline can be added later as a development tool; see [the handoff](docs/CLINE_TASK.md).

## Three-minute demo

1. The clock starts at **08:59 on October 20, 2026, Asia/Seoul**. It stays paused until you choose **시연 시간 1분 앞으로**.
2. At **09:00**, select **내 응답 남기기**, choose a response for fictional **예시 약 A**, and confirm. A saved state appears only after the server acknowledges the write.
3. Continue to **오늘 일정 살펴보기**. The helper's **15:00 planned visit** can be delayed or cancelled.
4. Continue to **가족과 나눌 이야기 만들기**, choose a topic, and read the local draft. No message is sent.
5. Reload and open **내 기록**: the response and corrections remain. Old hourly announcements do not replay.

Use the labelled reset action to erase **demo records only**. Details: [demo script](docs/DEMO.md).

## Voice and news

- Buttons complete the entire demo. No microphone or speech recognition is enabled.
- Optional speech accepts only browser-reported local Korean voices. In Settings, play the harmless test sentence **offline**, then confirm that you heard Korean. Availability depends on the PC/browser. Playback completion is never treated as proof of hearing or taking medication.
- Hourly cues require the page to remain foreground, a running server, and verified voice setup. Sleep, lock and closed tabs cannot provide reliable reminders. Keep existing phone alarms.
- The optional news panel fetches up to three titles from a fixed KBS WORLD Korean RSS feed, with original links and timestamps. Network failures and stale articles are labelled. News is not needed for the demo.

## Structure

```text
src/
  client/
    App.tsx             # navigation, snapshot lifecycle, foreground cues
    components.tsx      # shared headings and confirmation dialog
    features/           # responses, visits, family, news, settings
    lib/                # HTTP client and local speech adapter
    styles.css          # responsive visual system
  server/
    domain/             # time and validation rules
    http/               # localhost API and request validation
    services/           # bounded RSS retrieval
    storage/            # SQLite schema, transactions, demo state
    index.ts            # server and expiry scheduler lifecycle
  shared/contracts.ts   # transport types, no server code in client
tests/                  # domain, API, speech and browser tests
docs/                   # design, demo, provenance, verification, Cline handoff
var/                    # local SQLite files, ignored by Git
```

One package and one lockfile keep setup small. React + Vite serve the UI; Express + Zod validate requests; SQLite persists responses and correction history. `node-cron` expires announcements. There is no LLM runtime or messaging provider to configure.

## Verification

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests start a separate server on port 3101 with `var/e2e.sqlite`. They never reset the normal demo database. They require permission to bind loopback ports. See [acceptance evidence and remaining manual checks](docs/ACCEPTANCE.md).

## Data and scope

All seeded names and schedules are fictional. The clock and schedules are simulated; database writes are real. Response timestamps use the actual PC clock. `DAYLA_DB_PATH` can select another **demo-only** database; default: `var/dayla-demo.sqlite`. `PORT` defaults to 3001. The server binds only to `127.0.0.1`.

This is a hackathon prototype, not a medical device or production care service. It does not verify doses or visits, prescribe actions, contact family, or promise background delivery. Local storage is not encrypted. Authentication, real schedule editing, notifications while closed, remote access, and production deployment are outside this demo.

## Open source

Dayla code is [MIT licensed](LICENSE). The cream canvas, sidebar composition and rounded orange cards adapt the user-selected [Project-1](https://github.com/Atharvsinh-codez/Project-1) source under its root MIT license. Original images, logos and fonts are not included. See [third-party notices](THIRD_PARTY_NOTICES.md) for the exact revision, license mismatch in its README, and dependency licenses.

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). Security boundary: [SECURITY.md](SECURITY.md).
