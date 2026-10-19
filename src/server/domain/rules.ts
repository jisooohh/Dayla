import type { Settings } from '../../shared/contracts.js';

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export const DEMO_START = '2026-10-19T23:59:00.000Z';
export const DEFAULT_SETTINGS: Settings = {
  timeZone: 'Asia/Seoul',
  hourlyEnabled: true,
  quietStart: 22,
  quietEnd: 7,
  speechRate: 0.9,
  speechVolume: 1,
  largeText: false,
};

export function localTime(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  return {
    hour: Number(parts.find((p) => p.type === 'hour')?.value),
    minute: Number(parts.find((p) => p.type === 'minute')?.value),
  };
}

export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function supportsTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/** Calendar fields in the configured zone, independent of the host timezone. */
export function localDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Resolve a local daytime schedule using the zone's offset on that date (including DST). */
export function scheduledInstant(date: string, hour: number, timeZone: string): string {
  const target = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const iso = new Date(guess).toISOString();
    const time = localTime(iso, timeZone);
    const represented = Date.parse(
      `${localDate(iso, timeZone)}T${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:00Z`,
    );
    if (represented === target) return iso;
    guess += target - represented;
  }
  throw new DomainError('This local schedule time is unavailable in the selected time zone.');
}
