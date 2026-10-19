import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type {
  DeliveryStatus,
  DraftTopic,
  FamilyDraft,
  HourlyCue,
  MedicationOccurrence,
  NewsResult,
  ReportValue,
  ResponseRecord,
  Settings,
  Snapshot,
  Visit,
} from '../../shared/contracts.js';
import {
  DEFAULT_SETTINGS,
  DEMO_START,
  DomainError,
  isQuietHour,
  localTime,
  localDate,
  scheduledInstant,
} from '../domain/rules.js';

export function createStore(
  filename = ':memory:',
  clock: () => Date = () => new Date(),
  options: { mode?: 'demo' | 'live' } = {},
) {
  return new Store(filename, clock, options);
}

export class Store {
  private readonly db: Database.Database;
  schedulerRunning = false;
  private lastTick: number;
  constructor(
    filename: string,
    private readonly clock: () => Date,
    options: { mode?: 'demo' | 'live' } = {},
  ) {
    this.lastTick = clock().getTime();
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS medications (
        id TEXT PRIMARY KEY, scheduleId TEXT NOT NULL, label TEXT NOT NULL,
        scheduledAt TEXT NOT NULL, UNIQUE(scheduleId, scheduledAt));
      CREATE TABLE IF NOT EXISTS responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT, occurrenceId TEXT NOT NULL REFERENCES medications(id),
        value TEXT NOT NULL CHECK(value IN ('taken','not-yet','unsure')), recordedAt TEXT NOT NULL,
        supersedesId INTEGER REFERENCES responses(id));
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, responseId INTEGER NOT NULL REFERENCES responses(id));
      CREATE TABLE IF NOT EXISTS visits (
        id TEXT PRIMARY KEY, alias TEXT NOT NULL, startsAt TEXT NOT NULL, endsAt TEXT NOT NULL,
        status TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS visit_history (
        id INTEGER PRIMARY KEY, visitId TEXT NOT NULL, revision INTEGER NOT NULL,
        value TEXT NOT NULL, recordedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cues (
        id TEXT PRIMARY KEY, scheduledAt TEXT NOT NULL UNIQUE, expiresAt TEXT NOT NULL,
        delivery TEXT NOT NULL, clientId TEXT);
      CREATE TABLE IF NOT EXISTS deliveries (
        id INTEGER PRIMARY KEY, cueId TEXT NOT NULL, status TEXT NOT NULL,
        clientId TEXT, recordedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY, topic TEXT NOT NULL, text TEXT NOT NULL, createdAt TEXT NOT NULL);
    `);
    this.db.transaction(() => {
      if (!this.getState('now')) {
        this.setState('settings', JSON.stringify(DEFAULT_SETTINGS));
        this.setState('now', DEMO_START);
        this.setState('mode', options.mode ?? 'demo');
        if (this.mode === 'demo') this.seed();
      }
      if (!this.getState('mode')) this.setState('mode', options.mode ?? 'demo');
      // Translate only the known original fixtures, never user-authored labels.
      this.db
        .prepare(
          "UPDATE medications SET label='Morning medication' WHERE scheduleId='demo-med-a' AND label='예시 약 A'",
        )
        .run();
      this.db
        .prepare(
          "UPDATE visits SET alias='Sarah, your helper' WHERE id='demo-visit' AND alias='도움 선생님'",
        )
        .run();
      const previousDrafts: [string, string][] = [
        [
          '오늘은 어떻게 지내고 있니? 시간 될 때 이야기 나누고 싶어.',
          'How is your day going? I would love to chat when you have a moment.',
        ],
        [
          '다음에 만나면 함께 맛있는 밥을 먹고 싶어. 먹고 싶은 음식이 있니?',
          'I would love to share a meal next time we meet. What would you like to eat?',
        ],
        [
          '날씨가 좋은 날 함께 천천히 산책하면 좋겠어.',
          'It would be lovely to take a gentle walk together on a nice day.',
        ],
      ];
      for (const [previous, english] of previousDrafts) {
        this.db.prepare('UPDATE drafts SET text=? WHERE text=?').run(english, previous);
      }
      if (this.mode === 'live') this.ensureToday();
      // A restart cannot establish whether the browser played an earlier cue.
      this.db
        .prepare("UPDATE cues SET delivery='unknown' WHERE delivery IN ('pending','attempted')")
        .run();
    })();
  }

  private getState(key: string): string | undefined {
    return (
      this.db.prepare('SELECT value FROM state WHERE key=?').get(key) as
        { value: string } | undefined
    )?.value;
  }
  private setState(key: string, value: string) {
    this.db
      .prepare('INSERT INTO state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, value);
  }
  private seed() {
    this.setState('now', DEMO_START);
    this.setState('mode', 'demo');
    this.setState('settings', JSON.stringify(DEFAULT_SETTINGS));
    this.db
      .prepare('INSERT INTO medications VALUES (?,?,?,?)')
      .run('demo-med-0900', 'demo-med-a', 'Morning medication', '2026-10-20T00:00:00.000Z');
    this.db
      .prepare('INSERT INTO visits VALUES (?,?,?,?,?,?)')
      .run(
        'demo-visit',
        'Sarah, your helper',
        '2026-10-20T06:00:00.000Z',
        '2026-10-20T07:00:00.000Z',
        'scheduled',
        1,
      );
  }
  get settings(): Settings {
    return JSON.parse(this.getState('settings')!) as Settings;
  }
  get mode(): 'demo' | 'live' {
    return this.getState('mode') === 'live' ? 'live' : 'demo';
  }
  get now(): string {
    return this.mode === 'live' ? this.actualNow() : this.getState('now')!;
  }
  private ensureToday() {
    const zone = this.settings.timeZone;
    const day = localDate(this.now, zone);
    const suffix = `${day}:${zone}`;
    this.db
      .prepare('INSERT OR IGNORE INTO medications VALUES (?,?,?,?)')
      .run(
        `daily-med:${suffix}`,
        `daily-morning:${zone}`,
        'Morning medication',
        scheduledInstant(day, 9, zone),
      );
    this.db
      .prepare('INSERT OR IGNORE INTO visits VALUES (?,?,?,?,?,?)')
      .run(
        `daily-visit:${suffix}`,
        'Sarah, your helper',
        scheduledInstant(day, 15, zone),
        scheduledInstant(day, 16, zone),
        'scheduled',
        1,
      );
  }
  tick(): Snapshot {
    const now = this.clock().getTime();
    if (this.mode === 'live') {
      this.ensureToday();
      const instant = this.actualNow();
      const local = localTime(instant, this.settings.timeZone);
      // Detect a fresh boundary only. Booting/resuming in an hour cannot replay it.
      const localHourStart = now - (local.minute * 60_000 + (now % 60_000));
      if (
        local.minute === 0 &&
        now - localHourStart < 15_000 &&
        this.lastTick < localHourStart &&
        now - this.lastTick <= 15_000 &&
        this.settings.hourlyEnabled &&
        !isQuietHour(local.hour, this.settings.quietStart, this.settings.quietEnd)
      ) {
        this.db
          .prepare("INSERT OR IGNORE INTO cues VALUES (?,?,?,'pending',NULL)")
          .run(
            randomUUID(),
            new Date(localHourStart).toISOString(),
            new Date(localHourStart + 15_000).toISOString(),
          );
      }
    }
    this.lastTick = now;
    return this.snapshot();
  }
  resumeLive(): Snapshot {
    this.setState('mode', 'live');
    this.lastTick = this.clock().getTime();
    this.db
      .prepare("UPDATE cues SET delivery='unknown' WHERE delivery IN ('pending','attempted')")
      .run();
    return this.snapshot();
  }
  actualNow(): string {
    return this.clock().toISOString();
  }
  close() {
    this.db.close();
  }

  expireCues() {
    const now = this.actualNow();
    // The short cue deadline controls starting playback. A successful claimant gets
    // a separate bound for provider latency and narration, using the durable attempt log.
    const completionCutoff = new Date(Date.parse(now) - 150_000).toISOString();
    this.db
      .prepare(
        `UPDATE cues SET delivery='unknown'
         WHERE (delivery='pending' AND expiresAt<=?)
            OR (delivery='attempted' AND NOT EXISTS (
              SELECT 1 FROM deliveries
              WHERE deliveries.cueId=cues.id AND deliveries.status='attempted'
                AND deliveries.clientId=cues.clientId AND deliveries.recordedAt>?
            ))`,
      )
      .run(now, completionCutoff);
  }
  snapshot(): Snapshot {
    this.expireCues();
    if (this.mode === 'live') this.ensureToday();
    const today = localDate(this.now, this.settings.timeZone);
    const responses = this.db
      .prepare('SELECT * FROM responses ORDER BY id')
      .all() as ResponseRecord[];
    const medications = (
      this.db.prepare('SELECT * FROM medications ORDER BY scheduledAt').all() as Omit<
        MedicationOccurrence,
        'response'
      >[]
    )
      .filter(
        (med) =>
          localDate(med.scheduledAt, this.settings.timeZone) === today &&
          (this.mode === 'demo'
            ? med.scheduleId === 'demo-med-a'
            : med.id === `daily-med:${today}:${this.settings.timeZone}`),
      )
      .map((med) => ({
        ...med,
        response: responses.filter((r) => r.occurrenceId === med.id).at(-1) ?? null,
      }));
    return {
      mode: this.mode,
      now: this.now,
      serverTime: this.actualNow(),
      schedulerRunning: this.schedulerRunning,
      settings: this.settings,
      medications,
      visits: (this.db.prepare('SELECT * FROM visits ORDER BY startsAt').all() as Visit[]).filter(
        (visit) =>
          localDate(visit.startsAt, this.settings.timeZone) === today &&
          (this.mode === 'demo'
            ? visit.id === 'demo-visit'
            : visit.id === `daily-visit:${today}:${this.settings.timeZone}`),
      ),
      responses,
      cue:
        (this.db
          .prepare(
            'SELECT id,scheduledAt,expiresAt,delivery FROM cues ORDER BY scheduledAt DESC LIMIT 1',
          )
          .get() as HourlyCue | undefined) ?? null,
      drafts: (
        this.db.prepare('SELECT * FROM drafts ORDER BY rowid DESC LIMIT 20').all() as Omit<
          FamilyDraft,
          'sent'
        >[]
      ).map((draft) => ({ ...draft, sent: false })),
    };
  }
  updateSettings(patch: Partial<Settings>) {
    this.db.transaction(() => {
      this.setState('settings', JSON.stringify({ ...this.settings, ...patch }));
      this.db
        .prepare("UPDATE cues SET delivery='unknown' WHERE delivery IN ('pending','attempted')")
        .run();
    })();
    return this.snapshot();
  }
  advance(minutes: number) {
    if (this.mode !== 'demo')
      throw new DomainError(
        'Use the presentation controls to start the prepared timeline first.',
        409,
      );
    this.db.transaction(() => {
      const next = new Date(Date.parse(this.now) + minutes * 60_000).toISOString();
      this.setState('now', next);
      this.db
        .prepare("UPDATE cues SET delivery='unknown' WHERE delivery IN ('pending','attempted')")
        .run();
      const { hour, minute } = localTime(next, this.settings.timeZone);
      // Only the explicitly reached instant is eligible; crossed hours are never replayed.
      if (
        minute === 0 &&
        this.settings.hourlyEnabled &&
        !isQuietHour(hour, this.settings.quietStart, this.settings.quietEnd)
      ) {
        this.db
          .prepare("INSERT OR IGNORE INTO cues VALUES (?,?,?,'pending',NULL)")
          .run(randomUUID(), next, new Date(this.clock().getTime() + 15_000).toISOString());
      }
    })();
    return this.snapshot();
  }
  resetDemo() {
    this.db.transaction(() => {
      // Reset only prepared self-reports; preserve records from the live daily schedule.
      this.db.exec(
        `DELETE FROM requests WHERE responseId IN (SELECT id FROM responses WHERE occurrenceId='demo-med-0900');
         DELETE FROM responses WHERE occurrenceId='demo-med-0900';
         DELETE FROM medications WHERE scheduleId='demo-med-a';
         DELETE FROM visit_history WHERE visitId='demo-visit'; DELETE FROM visits WHERE id='demo-visit';
         DELETE FROM deliveries; DELETE FROM cues; DELETE FROM drafts;`,
      );
      this.seed();
    })();
    return this.snapshot();
  }
  respond(
    occurrenceId: string,
    input: { value: ReportValue; requestId: string; expectedResponseId: number | null },
  ) {
    this.db.transaction(() => {
      const payload = JSON.stringify({
        occurrenceId,
        value: input.value,
        expectedResponseId: input.expectedResponseId,
      });
      const request = this.db
        .prepare('SELECT payload FROM requests WHERE id=?')
        .get(input.requestId) as { payload: string } | undefined;
      if (request) {
        if (request.payload !== payload)
          throw new DomainError('This request ID has already been used.', 409);
        return;
      }
      const med = this.db
        .prepare('SELECT scheduledAt FROM medications WHERE id=?')
        .get(occurrenceId) as { scheduledAt: string } | undefined;
      if (!med) throw new DomainError('This medication schedule could not be found.', 404);
      if (med.scheduledAt > this.now)
        throw new DomainError('You can record a response after the scheduled time.', 409);
      const previous = this.db
        .prepare('SELECT * FROM responses WHERE occurrenceId=? ORDER BY id DESC LIMIT 1')
        .get(occurrenceId) as ResponseRecord | undefined;
      if ((previous?.id ?? null) !== input.expectedResponseId)
        throw new DomainError('This record has changed. Refresh and check it again.', 409);
      const responseId =
        previous?.value === input.value
          ? previous.id
          : Number(
              this.db
                .prepare(
                  'INSERT INTO responses (occurrenceId,value,recordedAt,supersedesId) VALUES (?,?,?,?)',
                )
                .run(occurrenceId, input.value, this.actualNow(), previous?.id ?? null)
                .lastInsertRowid,
            );
      this.db
        .prepare('INSERT INTO requests VALUES (?,?,?)')
        .run(input.requestId, payload, responseId);
    })();
    return this.snapshot();
  }
  updateVisit(
    id: string,
    patch: {
      status: Visit['status'];
      startsAt?: string;
      endsAt?: string;
      expectedRevision: number;
    },
  ) {
    this.db.transaction(() => {
      const visit = this.db.prepare('SELECT * FROM visits WHERE id=?').get(id) as Visit | undefined;
      if (!visit) throw new DomainError('This visit could not be found.', 404);
      if (visit.revision !== patch.expectedRevision)
        throw new DomainError('This visit has changed. Refresh and try again.', 409);
      const next = {
        ...visit,
        status: patch.status,
        startsAt: patch.startsAt ?? visit.startsAt,
        endsAt: patch.endsAt ?? visit.endsAt,
        revision: visit.revision + 1,
      };
      if (Date.parse(next.endsAt) <= Date.parse(next.startsAt))
        throw new DomainError('The visit end must be after its start.');
      this.db
        .prepare('INSERT INTO visit_history (visitId,revision,value,recordedAt) VALUES (?,?,?,?)')
        .run(id, visit.revision, JSON.stringify(visit), this.actualNow());
      this.db
        .prepare('UPDATE visits SET status=?,startsAt=?,endsAt=?,revision=? WHERE id=?')
        .run(next.status, next.startsAt, next.endsAt, next.revision, id);
    })();
    return this.snapshot();
  }
  deliver(id: string, status: Exclude<DeliveryStatus, 'pending'>, clientId: string) {
    this.db.transaction(() => {
      this.expireCues();
      const cue = this.db.prepare('SELECT * FROM cues WHERE id=?').get(id) as
        (HourlyCue & { clientId: string | null }) | undefined;
      if (!cue) throw new DomainError('This reminder could not be found.', 404);
      // Retried result reports are harmless; a claim retry must never authorize playback twice.
      if (status !== 'attempted' && cue.clientId === clientId && cue.delivery === status) return;
      if (
        status === 'attempted'
          ? cue.delivery !== 'pending'
          : cue.delivery !== 'attempted' || cue.clientId !== clientId
      ) {
        throw new DomainError('This reminder expired or was handled on another screen.', 409);
      }
      this.db.prepare('UPDATE cues SET delivery=?,clientId=? WHERE id=?').run(status, clientId, id);
      this.db
        .prepare('INSERT INTO deliveries (cueId,status,clientId,recordedAt) VALUES (?,?,?,?)')
        .run(id, status, clientId, this.actualNow());
    })();
    return this.snapshot();
  }
  createDraft(topic: DraftTopic): FamilyDraft {
    const sentences: Record<DraftTopic, string> = {
      hello: 'How is your day going? I would love to chat when you have a moment.',
      meal: 'I would love to share a meal next time we meet. What would you like to eat?',
      walk: 'It would be lovely to take a gentle walk together on a nice day.',
    };
    const draft: FamilyDraft = {
      id: randomUUID(),
      topic,
      text: sentences[topic],
      createdAt: this.actualNow(),
      sent: false,
    };
    this.db
      .prepare('INSERT INTO drafts VALUES (?,?,?,?)')
      .run(draft.id, draft.topic, draft.text, draft.createdAt);
    return draft;
  }
  readNewsCache(): NewsResult | null {
    const value = this.getState('news');
    return value ? (JSON.parse(value) as NewsResult) : null;
  }
  saveNewsCache(result: NewsResult) {
    this.setState('news', JSON.stringify(result));
  }
}
