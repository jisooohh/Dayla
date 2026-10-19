import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVoiceService } from '../../src/server/services/voice.js';

const direct = { ELEVENLABS_API_KEY: 'test-eleven-key' };
const connected = {
  ...direct,
  COMPOSIO_API_KEY: 'test-composio-key',
  COMPOSIO_ELEVENLABS_ACCOUNT_ID: 'ca_test',
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const audio = () =>
  new Response(new Uint8Array([73, 68, 51]), { headers: { 'Content-Type': 'audio/mpeg' } });
afterEach(() => vi.useRealTimers());

describe('bounded server voice providers', () => {
  it('selects only complete Composio credentials, then direct credentials, then browser', () => {
    expect(createVoiceService(connected).status()).toMatchObject({
      provider: 'composio',
      configured: true,
    });
    expect(createVoiceService({ ...direct, COMPOSIO_API_KEY: 'partial' }).status().provider).toBe(
      'elevenlabs',
    );
    expect(createVoiceService({ COMPOSIO_API_KEY: 'partial' }).status()).toMatchObject({
      provider: 'browser',
      configured: false,
    });
    expect(JSON.stringify(createVoiceService(connected).status())).not.toContain('test-');
  });

  it('sends fixed English TTS configuration and keeps the secret in the server header', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(audio());
    expect(await createVoiceService(direct, fetcher).synthesize('Good morning.')).toEqual(
      new Uint8Array([73, 68, 51]),
    );
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=mp3_44100_128',
    );
    expect(options).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { 'xi-api-key': direct.ELEVENLABS_API_KEY },
    });
    expect(JSON.parse(options!.body as string)).toEqual({
      text: 'Good morning.',
      model_id: 'eleven_flash_v2_5',
      language_code: 'en',
    });
  });

  it('uses Composio authenticated TTS then downloads only the signed audio, without credentials', async () => {
    const signedUrl = 'https://files.s3.us-west-2.amazonaws.com/audio.mp3?signature=example';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ status: 200, binary_data: { url: signedUrl, size: 3 } }))
      .mockResolvedValueOnce(audio());
    await createVoiceService(connected, fetcher).synthesize('Hello.');
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://backend.composio.dev/api/v3.1/tools/execute/proxy',
    );
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({
      connected_account_id: 'ca_test',
      method: 'POST',
      body: { text: 'Hello.' },
    });
    expect(fetcher.mock.calls[0][1]!.headers).toMatchObject({ 'x-api-key': 'test-composio-key' });
    expect(fetcher.mock.calls[1]).toEqual([
      signedUrl,
      expect.objectContaining({ redirect: 'error' }),
    ]);
    expect(fetcher.mock.calls[1][1]!.headers).toBeUndefined();
  });

  it('creates one-use STT tokens through Composio and uses multipart directly with ElevenLabs', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ status: 200, data: { token: 'sutkn_test' } }))
      .mockResolvedValueOnce(json({ text: ' My visit today? ' }));
    expect(
      await createVoiceService(connected, fetcher).transcribe(
        new Uint8Array([1, 2]),
        'audio/webm;codecs=opus',
      ),
    ).toBe('My visit today?');
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({
      connected_account_id: 'ca_test',
      endpoint: '/v1/single-use-token/batch_scribe',
      method: 'POST',
    });
    const [url, options] = fetcher.mock.calls[1];
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text?token=sutkn_test');
    expect(options!.headers).toBeUndefined();
    const form = options!.body as FormData;
    expect(form.get('model_id')).toBe('scribe_v2');
    expect(form.get('language_code')).toBe('eng');
    expect(form.get('diarize')).toBe('false');
    expect((form.get('file') as File).size).toBe(2);
  });

  it('uses direct multipart STT without exposing API keys in its URL or returned transcript', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ text: 'Hello' }));
    expect(
      await createVoiceService(direct, fetcher).transcribe(new Uint8Array([1]), 'audio/mp4'),
    ).toBe('Hello');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect(fetcher.mock.calls[0][1]!.headers).toEqual({ 'xi-api-key': 'test-eleven-key' });
  });

  it('rejects oversized or unsupported input before any network request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const service = createVoiceService(direct, fetcher);
    await expect(service.synthesize(' ')).rejects.toThrow('between');
    await expect(service.synthesize('x'.repeat(1501))).rejects.toThrow('between');
    await expect(
      service.transcribe(new Uint8Array(4 * 1024 * 1024 + 1), 'audio/webm'),
    ).rejects.toThrow('4 MB');
    await expect(service.transcribe(new Uint8Array([1]), 'text/html')).rejects.toThrow('format');
    await expect(createVoiceService({}, fetcher).synthesize('Hello')).rejects.toThrow(
      'not connected',
    );
    await expect(
      createVoiceService({ ...direct, ELEVENLABS_VOICE_ID: '../other' }, fetcher).synthesize(
        'Hello',
      ),
    ).rejects.toThrow('configuration');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not retry or switch providers on authentication failures, and redacts upstream errors', async () => {
    for (const response of [
      new Response('test-eleven-key confidential', { status: 401 }),
      json({ status: 403, data: { error: 'test-composio-key' } }),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(createVoiceService(connected, fetcher).synthesize('Hello')).rejects.toThrow(
        'credentials',
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('https://secret.invalid?key=test-eleven-key'));
    await expect(createVoiceService(direct, fetcher).synthesize('Hello')).rejects.toThrow(
      'unavailable',
    );
  });

  it('rejects arbitrary, private, credential-bearing, port or non-HTTPS audio destinations', async () => {
    for (const url of [
      'http://files.s3.amazonaws.com/a',
      'https://127.0.0.1/a',
      'https://[::1]/a',
      'https://localhost/a',
      'https://internal.local/a',
      'https://evil.example/a',
      'https://files.s3.amazonaws.com.evil.example/a',
      'https://user:password@files.s3.amazonaws.com/a',
      'https://files.s3.amazonaws.com:444/a',
    ]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ status: 200, binary_data: { url } }));
      await expect(createVoiceService(connected, fetcher).synthesize('Hello')).rejects.toThrow(
        'unsupported audio location',
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('bounds downloaded response headers and streamed bytes, rejects non-audio content', async () => {
    for (const response of [
      new Response('x', { headers: { 'Content-Length': String(8 * 1024 * 1024 + 1) } }),
      new Response(new Uint8Array(8 * 1024 * 1024 + 1), {
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    ]) {
      await expect(
        createVoiceService(direct, vi.fn<typeof fetch>().mockResolvedValue(response)).synthesize(
          'Hello',
        ),
      ).rejects.toThrow('too large');
    }
    await expect(
      createVoiceService(
        direct,
        vi.fn<typeof fetch>().mockResolvedValue(json({ error: 'not audio' })),
      ).synthesize('Hello'),
    ).rejects.toThrow('playable audio');
  });

  it('rejects missing or excessive transcripts and malformed provider JSON', async () => {
    for (const response of [
      json({ text: '' }),
      json({ text: 'x'.repeat(1501) }),
      new Response('not-json'),
    ]) {
      await expect(
        createVoiceService(direct, vi.fn<typeof fetch>().mockResolvedValue(response)).transcribe(
          new Uint8Array([1]),
          'audio/webm',
        ),
      ).rejects.toThrow();
    }
  });

  it('aborts a stalled request after twenty seconds', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const assertion = expect(
      createVoiceService(direct, fetcher).synthesize('Hello'),
    ).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(20_001);
    await assertion;
    expect(fetcher.mock.calls[0][1]!.signal!.aborted).toBe(true);
  });
});
