import { expect, test, type Page } from '@playwright/test';

type VoiceHarness = {
  starts: number;
  aborts: number;
  spoken: string[];
  emit: (text: string) => void;
  emitLate: (text: string) => void;
  endPlayback: () => void;
};
type HarnessWindow = Window & { __voiceHarness: VoiceHarness };

async function browserVoices(page: Page) {
  await page.route('**/api/voice/status', (route) =>
    route.fulfill({
      json: {
        provider: 'browser',
        configured: false,
        message: 'Browser voice is available with your permission.',
      },
    }),
  );
  await page.addInitScript(() => {
    type Result = { results: { transcript: string }[][] };
    let emitCurrent: ((text: string) => void) | null = null;
    let lateResult: ((event: Result) => void) | null = null;
    let currentUtterance: { onend: (() => void) | null } | null = null;
    const harness = {
      starts: 0,
      aborts: 0,
      spoken: [] as string[],
      emit(text: string) {
        emitCurrent?.(text);
      },
      emitLate(text: string) {
        lateResult?.({ results: [[{ transcript: text }]] });
      },
      endPlayback() {
        currentUtterance?.onend?.();
      },
    };
    class MockRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: Result) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        emitCurrent = (text) => this.onresult?.({ results: [[{ transcript: text }]] });
        lateResult = this.onresult;
        harness.starts += 1;
      }
      stop() {
        this.onend?.();
      }
      abort() {
        harness.aborts += 1;
      }
    }
    class MockUtterance {
      text: string;
      voice = null;
      lang = '';
      rate = 1;
      volume = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, '__voiceHarness', { value: harness });
    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockUtterance,
      configurable: true,
    });
    Object.defineProperty(window.speechSynthesis, 'getVoices', {
      value: () => [
        {
          name: 'Local English test voice',
          voiceURI: 'test-en',
          localService: true,
          lang: 'en-US',
          default: true,
        },
      ],
      configurable: true,
    });
    Object.defineProperty(window.speechSynthesis, 'speak', {
      value: (utterance: MockUtterance) => {
        harness.spoken.push(utterance.text);
        currentUtterance = utterance;
      },
      configurable: true,
    });
    Object.defineProperty(window.speechSynthesis, 'cancel', {
      value: () => {},
      configurable: true,
    });
  });
}

async function startListening(page: Page) {
  await page.getByRole('button', { name: 'Start speaking' }).click();
  await page.getByRole('button', { name: 'Use browser voice' }).click();
  await expect(page.getByRole('button', { name: 'Finish speaking' })).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/demo/reset', { data: { confirm: true } })).ok()).toBe(true);
});

test('microphone requires explicit browser consent, then a transcript receives a spoken answer', async ({
  page,
}) => {
  await browserVoices(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start speaking' })).toBeEnabled();
  expect(
    await page.evaluate(() => (window as unknown as HarnessWindow).__voiceHarness.starts),
  ).toBe(0);
  await page.getByRole('button', { name: 'Start speaking' }).click();
  await expect(
    page.getByText(/browser’s speech service will process microphone audio/),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as HarnessWindow).__voiceHarness.starts),
  ).toBe(0);
  await page.getByRole('button', { name: 'Use browser voice' }).click();
  await expect(page.getByRole('button', { name: 'Finish speaking' })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as HarnessWindow).__voiceHarness.starts),
  ).toBe(1);
  await page.evaluate(() =>
    (window as unknown as HarnessWindow).__voiceHarness.emit('Who is visiting today?'),
  );
  await expect(page.locator('.conversation-turn.user')).toContainText('Who is visiting today?');
  await expect(page.locator('.conversation-turn.assistant')).toContainText('scheduled today');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as HarnessWindow).__voiceHarness.spoken))
    .toContainEqual(expect.stringContaining('scheduled today'));
  await expect(page.locator('.character-speaking')).toBeVisible();
  await page.evaluate(() => (window as unknown as HarnessWindow).__voiceHarness.endPlayback());
  await expect(page.locator('.character-idle')).toBeVisible();
});

test('stopping the microphone discards even a previously queued recognition callback', async ({
  page,
}) => {
  await browserVoices(page);
  await page.goto('/');
  await startListening(page);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/conversation')) requests.push(request.url());
  });
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  await expect(page.locator('.character-idle')).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as HarnessWindow).__voiceHarness.emitLate('I took my medication'),
  );
  await expect(page.locator('.conversation-turn')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as HarnessWindow).__voiceHarness.aborts),
  ).toBeGreaterThan(0);
  expect(requests).toEqual([]);
});

test('an hourly reminder never interrupts an active listening session', async ({
  page,
  request,
}) => {
  await browserVoices(page);
  await page.goto('/?presenter=1');
  await startListening(page);
  const aborts = await page.evaluate(
    () => (window as unknown as HarnessWindow).__voiceHarness.aborts,
  );
  await page.getByRole('button', { name: 'Advance 1 minute' }).click();
  await expect
    .poll(async () => (await (await request.get('/api/today')).json()).cue.delivery)
    .toBe('unknown');
  await expect(page.getByRole('button', { name: 'Finish speaking' })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as HarnessWindow).__voiceHarness.spoken),
  ).toEqual([]);
  expect(
    await page.evaluate(() => (window as unknown as HarnessWindow).__voiceHarness.aborts),
  ).toBe(aborts);
  await page.evaluate(() =>
    (window as unknown as HarnessWindow).__voiceHarness.emit('What time is it?'),
  );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as HarnessWindow).__voiceHarness.spoken))
    .toContainEqual(expect.stringContaining('9:00'));
});

test('a delayed conversational reply cannot resume speech after hiding and returning', async ({
  page,
}) => {
  await browserVoices(page);
  await page.goto('/');
  await startListening(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waiting = false;
  await page.route('**/api/conversation', async (route) => {
    const response = await route.fetch();
    waiting = true;
    await gate;
    await route.fulfill({ response });
  });
  await page.evaluate(() =>
    (window as unknown as HarnessWindow).__voiceHarness.emit('What time is it?'),
  );
  await expect.poll(() => waiting).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  release();
  await expect(page.getByRole('textbox', { name: 'Message Dayla' })).toBeEnabled();
  await expect(page.locator('.character-idle')).toBeVisible();
  await expect(page.locator('.conversation-turn.assistant')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as HarnessWindow).__voiceHarness.spoken),
  ).toEqual([]);
});

function toneWav() {
  const rate = 8000;
  const samples = rate * 3;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1)
    wav.writeInt16LE(
      Math.round(Math.sin((index * 2 * Math.PI * 220) / rate) * 8000),
      44 + index * 2,
    );
  return wav;
}

test('configured voice plays decoded provider audio and can be stopped', async ({ page }) => {
  await page.route('**/api/voice/status', (route) =>
    route.fulfill({
      json: { provider: 'elevenlabs', configured: true, message: 'ElevenLabs is configured.' },
    }),
  );
  const requests: string[] = [];
  await page.route('**/api/voice/speak', (route) => {
    requests.push(route.request().postDataJSON().text);
    return route.fulfill({ contentType: 'audio/wav', body: toneWav() });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start speaking' })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Message Dayla' }).fill('What time is it?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.character-speaking')).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain('8:59');
  await page.getByRole('button', { name: 'Stop speaking', exact: true }).click();
  await expect(page.locator('.character-idle')).toBeVisible();
});
