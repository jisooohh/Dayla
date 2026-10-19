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
