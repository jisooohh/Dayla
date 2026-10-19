import type { VoiceStatus } from '../../shared/contracts.js';
import { DomainError } from '../domain/rules.js';

const ELEVENLABS = 'https://api.elevenlabs.io/v1';
const COMPOSIO = 'https://backend.composio.dev/api/v3.1/tools/execute/proxy';
const MAX_AUDIO = 4 * 1024 * 1024;
const MAX_RESPONSE = 8 * 1024 * 1024;
const AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg']);
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';

// https://elevenlabs.io/docs/api-reference/text-to-speech/convert
// https://elevenlabs.io/docs/api-reference/speech-to-text/convert
// https://elevenlabs.io/docs/api-reference/tokens/create
// https://docs.composio.dev/reference/api-reference/tools/postToolsExecuteProxy
// https://ui.elevenlabs.io/docs/components/voice-picker (Rachel default)
// Composio returns signed files, not a transparent streaming audio response.
export function createVoiceService(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  const composioKey = env.COMPOSIO_API_KEY?.trim();
  const accountId = env.COMPOSIO_ELEVENLABS_ACCOUNT_ID?.trim();
  const elevenKey = env.ELEVENLABS_API_KEY?.trim();
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE;
  const provider: VoiceStatus['provider'] =
    composioKey && accountId ? 'composio' : elevenKey ? 'elevenlabs' : 'browser';

  function status(): VoiceStatus {
    return {
      provider,
      configured: provider !== 'browser',
      message:
        provider === 'composio'
          ? 'ElevenLabs through Composio is configured.'
          : provider === 'elevenlabs'
            ? 'ElevenLabs voice is configured.'
            : 'Cloud voice is not connected. Your browser voice is available when supported.',
    };
  }

  function requireProvider() {
    if (provider === 'browser')
      throw new DomainError('Cloud voice is not connected. You can still type your message.', 503);
  }

  async function request(url: string, init: RequestInit, limit = MAX_RESPONSE) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetcher(url, {
        ...init,
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw upstreamError(response.status);
      }
      if (Number(response.headers.get('content-length')) > limit) {
        await response.body?.cancel();
        throw new DomainError(
          'The voice response was too large. Please try a shorter message.',
          502,
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new DomainError('The voice service returned an empty response.', 502);
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > limit) {
            await reader.cancel();
            throw new DomainError(
              'The voice response was too large. Please try a shorter message.',
              502,
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { bytes, type: response.headers.get('content-type')?.split(';')[0] ?? '' };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      // Never forward an upstream body or URL: both can contain credentials or transcripts.
      throw new DomainError(
        controller.signal.aborted
          ? 'The voice service took too long. Please try again.'
          : 'The voice service is unavailable. Please try again or type your message.',
        502,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function proxy(endpoint: string, body?: Record<string, unknown>) {
    const result = await request(
      COMPOSIO,
      {
        method: 'POST',
        headers: { 'x-api-key': composioKey!, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connected_account_id: accountId,
          endpoint,
          method: 'POST',
          ...(body ? { body } : {}),
        }),
      },
      1024 * 1024,
    );
    const value = jsonObject(result.bytes);
    if (typeof value.status !== 'number' || value.status < 200 || value.status >= 300) {
      throw upstreamError(typeof value.status === 'number' ? value.status : 502);
    }
    return value;
  }

  async function synthesize(text: string): Promise<Uint8Array> {
    requireProvider();
    if (!text.trim() || text.length > 1500)
      throw new DomainError('Please use a message between 1 and 1,500 characters.');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(voiceId))
      throw new DomainError('The voice configuration needs attention.', 503);
    const endpoint = `/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
    const body = { text, model_id: 'eleven_flash_v2_5', language_code: 'en' };
    let result: { bytes: Uint8Array; type: string };
    if (provider === 'composio') {
      const response = await proxy(endpoint, body);
      const file = record(response.binary_data);
      if (typeof file.size === 'number' && file.size > MAX_RESPONSE)
        throw new DomainError('The voice response was too large.', 502);
      const url = signedAudioUrl(file.url);
      result = await request(url, {});
    } else {
      result = await request(`https://api.elevenlabs.io${endpoint}`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey!, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    if (
      !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(result.type) ||
      !result.bytes.length
    ) {
      throw new DomainError('The voice service did not return playable audio.', 502);
    }
    return result.bytes;
  }

  async function transcribe(audio: Uint8Array, mime: string): Promise<string> {
    requireProvider();
    const type = mime.split(';')[0].trim().toLowerCase();
    if (!audio.length || audio.length > MAX_AUDIO)
      throw new DomainError('Please record a shorter message, up to 4 MB.');
    if (!AUDIO_TYPES.has(type))
      throw new DomainError('This recording format is not supported. Please try another browser.');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type }), 'recording');
    form.append('model_id', 'scribe_v2');
    form.append('language_code', 'eng');
    form.append('tag_audio_events', 'false');
    form.append('diarize', 'false');
    let url = `${ELEVENLABS}/speech-to-text`;
    let headers: Record<string, string> | undefined;
    if (provider === 'composio') {
      const response = await proxy('/v1/single-use-token/batch_scribe');
      const token = record(response.data).token;
      if (typeof token !== 'string' || !token || token.length > 8192)
        throw new DomainError('The voice connection could not start. Please try again.', 502);
      url += `?token=${encodeURIComponent(token)}`;
    } else headers = { 'xi-api-key': elevenKey! };
    const result = await request(url, { method: 'POST', headers, body: form }, 1024 * 1024);
    const transcript = jsonObject(result.bytes).text;
    if (typeof transcript !== 'string' || !transcript.trim())
      throw new DomainError('I could not hear any words. Please try again.', 422);
    if (transcript.length > 1500) throw new DomainError('Please record a shorter message.', 422);
    return transcript.trim();
  }

  return { status, synthesize, transcribe };
}

function upstreamError(status: number) {
  if (status === 401 || status === 403)
    return new DomainError(
      'The voice connection needs attention. Please check the provider credentials.',
      503,
    );
  if (status === 429 || status === 402)
    return new DomainError(
      'The voice service is at its usage limit. Please try later or type your message.',
      503,
    );
  return new DomainError(
    'The voice service could not complete the request. Please try again.',
    502,
  );
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonObject(bytes: Uint8Array): Record<string, unknown> {
  try {
    return record(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new DomainError('The voice service returned an invalid response.', 502);
  }
}

function signedAudioUrl(value: unknown) {
  try {
    if (typeof value !== 'string') throw new Error();
    const url = new URL(value);
    // Composio documents S3-backed temporary files. Reject all other destinations,
    // including private hosts/IPs, arbitrary ports, credentials and redirects.
    // https://docs.composio.dev/reference/api-reference/files
    const s3 = /^(?:[a-z0-9][a-z0-9.-]*\.)?s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/;
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !s3.test(url.hostname)
    )
      throw new Error();
    return url.href;
  } catch {
    throw new DomainError('The voice service returned an unsupported audio location.', 502);
  }
}
