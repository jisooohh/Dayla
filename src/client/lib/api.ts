import type { Snapshot } from '../../shared/contracts';

export async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || 'Couldn’t complete your request. Please try again.');
  return result as T;
}
export type Mutate = (path: string, body: unknown, method?: string) => Promise<Snapshot>;
export function time(value: string, zone: string, hour12 = true) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
    timeZone: zone,
  }).format(new Date(value));
}
export function date(value: string, zone: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: zone,
  }).format(new Date(value));
}
export const reportLabels = {
  taken: 'I’ve taken it',
  'not-yet': 'Not yet',
  unsure: 'I’m not sure',
};
