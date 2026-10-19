import { expect, test, type Page } from '@playwright/test';

test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

type Probe = {
  microphoneRequests: number;
  playbackStarts: number;
  contexts: AudioContext[];
  tracks: MediaStreamTrack[];
};
type ProbedWindow = Window & { __voiceProbe: Probe };

// A quiet, deterministic tone exercises Chromium's real decoder, analyser and playback.
function tone(seconds = 1.2) {
  const sampleRate = 16_000;
  const samples = Math.floor(sampleRate * seconds);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    buffer.writeInt16LE(
      Math.round(Math.sin((index * Math.PI * 2 * 220) / sampleRate) * 5000),
      44 + index * 2,
    );
  }
  return buffer;
}

async function resources(page: Page) {
  return page.evaluate(() => {
    const probe = (window as unknown as ProbedWindow).__voiceProbe;
    return {
      microphoneRequests: probe.microphoneRequests,
      playbackStarts: probe.playbackStarts,
      contexts: probe.contexts.map((context) => context.state),
      tracks: probe.tracks.map((track) => track.readyState),
    };
  });
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.post('/api/demo/reset', { data: { confirm: true } })).ok()).toBe(true);
  await page.route('**/api/voice/status', (route) =>
    route.fulfill({
      json: { provider: 'elevenlabs', configured: true, message: 'Voice is configured.' },
    }),
  );
  await page.addInitScript(() => {
    const probe: Probe = { microphoneRequests: 0, playbackStarts: 0, contexts: [], tracks: [] };
    (window as unknown as ProbedWindow).__voiceProbe = probe;
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.contexts.push(this);
      }
    };
    const originalStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      this: AudioBufferSourceNode,
      ...args: Parameters<typeof originalStart>
    ) {
      probe.playbackStarts++;
      return originalStart.apply(this, args);
    };
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      probe.microphoneRequests++;
      const stream = await originalGetUserMedia(constraints);
      probe.tracks.push(...stream.getTracks());
      return stream;
    };
  });
});

test('captures only after the microphone click, transcribes, replies and releases real audio resources', async ({
  page,
}) => {
  let transcription: { audio: string; mime: string } | undefined;
  let spokenText = '';
  await page.route('**/api/voice/transcribe', async (route) => {
    transcription = route.request().postDataJSON();
    await route.fulfill({ json: { text: 'What time is it?' } });
  });
  await page.route('**/api/voice/speak', async (route) => {
    spokenText = route.request().postDataJSON().text;
    await route.fulfill({ contentType: 'audio/wav', body: tone() });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start speaking', exact: true })).toBeEnabled();
  expect(await resources(page)).toMatchObject({
    microphoneRequests: 0,
    playbackStarts: 0,
    contexts: [],
    tracks: [],
  });

  await page.getByRole('button', { name: 'Start speaking', exact: true }).click();
  await expect(page.locator('.character-listening')).toBeVisible();
  expect((await resources(page)).microphoneRequests).toBe(1);
  // Record actual fake-device samples across multiple MediaRecorder chunks.
  await page.waitForTimeout(700);
  expect(transcription).toBeUndefined();
  await page.getByRole('button', { name: 'Finish speaking', exact: true }).click();
  await expect(page.locator('.conversation-history')).toContainText('What time is it?');
  await expect(page.locator('.conversation-history')).toContainText('It is 8:59 AM');
  await expect(page.locator('.character-speaking')).toBeVisible();
  expect(spokenText).toContain('It is 8:59 AM');
  expect(transcription!.mime).toMatch(/^audio\//);
  const recorded = Buffer.from(transcription!.audio, 'base64');
  expect(recorded.length).toBeGreaterThan(0);
  expect(recorded.length).toBeLessThanOrEqual(4 * 1024 * 1024);
  expect(recorded.toString('base64')).toBe(transcription!.audio);
  await expect(page.locator('.character-idle')).toBeVisible();
  await expect
    .poll(async () => (await resources(page)).contexts.every((state) => state === 'closed'))
    .toBe(true);
  expect(await resources(page)).toMatchObject({
    microphoneRequests: 1,
    playbackStarts: 1,
    tracks: ['ended'],
  });
  expect(errors).toEqual([]);
});

test('Stop cancels a pending cloud response before any delayed audio can play', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const received = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let completed!: () => void;
  const settled = new Promise<void>((resolve) => {
    completed = resolve;
  });
  await page.route('**/api/voice/speak', async (route) => {
    requested();
    await gate;
    try {
      await route.fulfill({ contentType: 'audio/wav', body: tone() });
    } catch {
      /* Cancelling fetch can dispose the intercepted request. */
    } finally {
      completed();
    }
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start speaking', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Message Dayla' }).fill('What time is it?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await received;
  await expect(page.locator('.character-thinking')).toBeVisible();
  await page.getByRole('button', { name: /^Stop/ }).click();
  await expect(page.locator('.character-idle')).toBeVisible();
  release();
  await settled;
  await expect
    .poll(async () => (await resources(page)).contexts.every((state) => state === 'closed'))
    .toBe(true);
  expect(await resources(page)).toMatchObject({
    microphoneRequests: 0,
    playbackStarts: 0,
    tracks: [],
  });
  await expect(page.locator('.character-speaking')).toHaveCount(0);
});
