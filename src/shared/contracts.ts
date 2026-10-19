/** Transport contracts shared by the local API and the browser. No runtime I/O. */
export type ReportValue = 'taken' | 'not-yet' | 'unsure';
export type DeliveryStatus = 'pending' | 'attempted' | 'played' | 'failed' | 'unknown';
export type VisitStatus = 'scheduled' | 'changed' | 'cancelled';
export type DraftTopic = 'hello' | 'meal' | 'walk';

export interface Settings {
  timeZone: string;
  hourlyEnabled: boolean;
  quietStart: number;
  quietEnd: number;
  speechRate: number;
  speechVolume: number;
  largeText: boolean;
}
export interface ResponseRecord {
  id: number;
  occurrenceId: string;
  value: ReportValue;
  recordedAt: string;
  supersedesId: number | null;
}
export interface MedicationOccurrence {
  id: string;
  scheduleId: string;
  label: string;
  scheduledAt: string;
  response: ResponseRecord | null;
}
export interface Visit {
  id: string;
  alias: string;
  startsAt: string;
  endsAt: string;
  status: VisitStatus;
  revision: number;
}
export interface HourlyCue {
  id: string;
  scheduledAt: string;
  expiresAt: string;
  delivery: DeliveryStatus;
}
export interface FamilyDraft {
  id: string;
  topic: DraftTopic;
  text: string;
  createdAt: string;
  sent: false;
}
export interface Snapshot {
  mode: 'demo';
  now: string;
  serverTime: string;
  schedulerRunning: boolean;
  settings: Settings;
  medications: MedicationOccurrence[];
  visits: Visit[];
  responses: ResponseRecord[];
  cue: HourlyCue | null;
  drafts: FamilyDraft[];
}
export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
}
export interface NewsResult {
  status: 'fresh' | 'stale' | 'unavailable';
  fetchedAt: string | null;
  articles: NewsArticle[];
  message: string;
}
export interface ApiError {
  error: string;
}
