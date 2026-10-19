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
} from '../domain/rules.js';

export function createStore(filename = ':memory:', clock: () => Date = () => new Date()) {
  return new Store(filename, clock);
}

export class Store {
  private readonly db: Database.Database;
  schedulerRunning = false;
  constructor(
    filename: string,
    private readonly clock: () => Date,
  ) {
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
      if (!this.getState('now')) this.seed();
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
    this.setState('settings', JSON.stringify(DEFAULT_SETTINGS));
    this.db
      .prepare('INSERT INTO medications VALUES (?,?,?,?)')
      .run('demo-med-0900', 'demo-med-a', '예시 약 A', '2026-10-20T00:00:00.000Z');
    this.db
      .prepare('INSERT INTO visits VALUES (?,?,?,?,?,?)')
      .run(
        'demo-visit',
        '도움 선생님',
        '2026-10-20T06:00:00.000Z',
        '2026-10-20T07:00:00.000Z',
        'scheduled',
        1,
      );
  }
  get settings(): Settings {
    return JSON.parse(this.getState('settings')!) as Settings;
  }
  get now(): string {
    return this.getState('now')!;
  }
  actualNow(): string {
    return this.clock().toISOString();
  }
  close() {
    this.db.close();
  }

  expireCues() {
    this.db
      .prepare(
        "UPDATE cues SET delivery='unknown' WHERE delivery IN ('pending','attempted') AND expiresAt<=?",
      )
      .run(this.actualNow());
  }
  snapshot(): Snapshot {
    this.expireCues();
    const responses = this.db
      .prepare('SELECT * FROM responses ORDER BY id')
      .all() as ResponseRecord[];
    const medications = (
      this.db.prepare('SELECT * FROM medications ORDER BY scheduledAt').all() as Omit<
        MedicationOccurrence,
        'response'
      >[]
    ).map((med) => ({
      ...med,
      response: responses.filter((r) => r.occurrenceId === med.id).at(-1) ?? null,
    }));
    return {
      mode: 'demo',
      now: this.now,
      serverTime: this.actualNow(),
      schedulerRunning: this.schedulerRunning,
      settings: this.settings,
      medications,
      visits: this.db.prepare('SELECT * FROM visits ORDER BY startsAt').all() as Visit[],
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
      // This database contains only this demo dataset; no real-data import exists.
      this.db.exec(
        'DELETE FROM requests; DELETE FROM responses; DELETE FROM medications; DELETE FROM visit_history; DELETE FROM visits; DELETE FROM deliveries; DELETE FROM cues; DELETE FROM drafts;',
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
        if (request.payload !== payload) throw new DomainError('이미 사용한 요청 ID입니다.', 409);
        return;
      }
      const med = this.db
        .prepare('SELECT scheduledAt FROM medications WHERE id=?')
        .get(occurrenceId) as { scheduledAt: string } | undefined;
      if (!med) throw new DomainError('일정을 찾을 수 없어요.', 404);
      if (med.scheduledAt > this.now)
        throw new DomainError('예정 시간이 지난 뒤 응답을 기록할 수 있어요.', 409);
      const previous = this.db
        .prepare('SELECT * FROM responses WHERE occurrenceId=? ORDER BY id DESC LIMIT 1')
        .get(occurrenceId) as ResponseRecord | undefined;
      if ((previous?.id ?? null) !== input.expectedResponseId)
        throw new DomainError('기록이 변경되었어요. 새로고침 후 확인해주세요.', 409);
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
      if (!visit) throw new DomainError('방문 일정을 찾을 수 없어요.', 404);
      if (visit.revision !== patch.expectedRevision)
        throw new DomainError('방문 일정이 변경되었어요. 새로고침해주세요.', 409);
      const next = {
        ...visit,
        status: patch.status,
        startsAt: patch.startsAt ?? visit.startsAt,
        endsAt: patch.endsAt ?? visit.endsAt,
        revision: visit.revision + 1,
      };
      if (Date.parse(next.endsAt) <= Date.parse(next.startsAt))
        throw new DomainError('방문 종료 시간은 시작 시간보다 늦어야 해요.');
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
      if (!cue) throw new DomainError('알림을 찾을 수 없어요.', 404);
      // Retried result reports are harmless; a claim retry must never authorize playback twice.
      if (status !== 'attempted' && cue.clientId === clientId && cue.delivery === status) return;
      if (
        status === 'attempted'
          ? cue.delivery !== 'pending'
          : cue.delivery !== 'attempted' || cue.clientId !== clientId
      ) {
        throw new DomainError('이 알림은 만료되었거나 다른 화면에서 처리했어요.', 409);
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
      hello: '오늘은 어떻게 지내고 있니? 시간 될 때 이야기 나누고 싶어.',
      meal: '다음에 만나면 함께 맛있는 밥을 먹고 싶어. 먹고 싶은 음식이 있니?',
      walk: '날씨가 좋은 날 함께 천천히 산책하면 좋겠어.',
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
