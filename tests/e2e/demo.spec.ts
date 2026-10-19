import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ request, page }) => {
  const reset = await request.post('/api/demo/reset', { data: { confirm: true } });
  expect(reset.ok()).toBe(true);
  // No machine-specific voice assumptions: the core flow works without TTS.
  await page.addInitScript(() => {
    Object.defineProperty(window.speechSynthesis, 'getVoices', {
      value: () => [],
      configurable: true,
    });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '좋은 하루예요' })).toBeVisible();
});

test('voice changes never transfer confirmation to an untested fallback', async ({ page }) => {
  await page.evaluate(() => {
    const fallback = { voiceURI: 'B', name: 'Fallback', lang: 'ko-KR', localService: true };
    localStorage.setItem(
      'dayla.local-voice.v1',
      JSON.stringify({ uri: 'A', name: 'Verified', verified: true }),
    );
    Object.defineProperty(speechSynthesis, 'getVoices', {
      value: () => [fallback],
      configurable: true,
    });
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '목소리' })).toHaveValue('B');
  await expect(
    page.getByRole('checkbox', { name: '인터넷 없이 한국어 재생을 직접 확인했어요' }),
  ).not.toBeChecked();
  await page.evaluate(() => {
    const voices = [
      { voiceURI: 'A', name: 'Verified', lang: 'ko-KR', localService: true },
      { voiceURI: 'B', name: 'Fallback', lang: 'ko-KR', localService: true },
    ];
    Object.defineProperty(speechSynthesis, 'getVoices', {
      value: () => voices,
      configurable: true,
    });
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await expect(page.getByRole('combobox', { name: '목소리' })).toHaveValue('A');
  await expect(
    page.getByRole('checkbox', { name: '인터넷 없이 한국어 재생을 직접 확인했어요' }),
  ).toBeChecked();
});

test('stop cancels a delayed playback claim before any utterance starts', async ({
  page,
  request,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'dayla.local-voice.v1',
      JSON.stringify({ uri: 'A', name: 'Verified', verified: true }),
    );
    Object.defineProperty(speechSynthesis, 'getVoices', {
      configurable: true,
      value: () => [{ voiceURI: 'A', name: 'Verified', lang: 'ko-KR', localService: true }],
    });
    speechSynthesis.speak = () => {
      document.body.dataset.spoken = 'true';
    };
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await expect(page.locator('.voice-status')).toContainText('직접 확인한');
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let claimed = false;
  await page.route('**/api/cues/*/delivery', async (route) => {
    if (route.request().postDataJSON().status !== 'attempted') return route.continue();
    const response = await route.fetch();
    claimed = true;
    await gate;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: '시연 시간 1분 앞으로' }).click();
  await expect.poll(() => claimed).toBe(true);
  await page.getByRole('button', { name: '그만 듣기', exact: true }).click();
  release();
  await expect
    .poll(async () => (await (await request.get('/api/today')).json()).cue.delivery)
    .toBe('unknown');
  expect(await page.locator('body').getAttribute('data-spoken')).toBeNull();
});

test('poll responses slower than the interval still update the screen', async ({
  page,
  request,
}) => {
  await page.route('**/api/today', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  await request.post('/api/demo/advance', { data: { minutes: 1 } });
  await expect(page.locator('.demo-time')).toContainText('09:00', { timeout: 8000 });
});

test('one demo flow saves, corrects, reloads, changes a visit and creates a local draft', async ({
  page,
  request,
}) => {
  const external: string[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith('http://127.0.0.1:3101')) external.push(req.url());
  });
  await page.getByRole('button', { name: '시연 시간 1분 앞으로' }).click();
  await page.getByRole('button', { name: '내 응답 남기기' }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.getByRole('button', { name: '아직 복용하지 않았다고 기록', exact: true }).click();
  await page.getByRole('button', { name: '이대로 기록하기' }).click();
  await expect(page.getByText('저장된 응답: 아직 복용하지 않았다고 기록')).toBeVisible();
  await page.getByRole('button', { name: '잘 모르겠어요', exact: true }).click();
  await page.getByRole('button', { name: '이대로 기록하기' }).click();
  await expect(page.getByText('저장된 응답: 잘 모르겠어요')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '내 기록', exact: true }).click();
  await expect(page.getByRole('heading', { name: '잘 모르겠어요', exact: true })).toBeVisible();
  await expect(page.getByText('정정된 응답')).toBeVisible();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByRole('button', { name: '오늘 일정', exact: true }).click();
  await page.getByRole('button', { name: '시연 일정 변경' }).click();
  await page.getByRole('button', { name: '30분 늦추기' }).click();
  await expect(page.getByText('시간 변경 · 방문 예정', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '시연 일정 변경' }).click();
  await page.getByRole('button', { name: '방문 취소하기' }).click();
  await expect(page.getByText('취소된 일정', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '가족과 나눌 이야기 만들기' }).click();
  await page.getByRole('button', { name: /함께 밥 먹고 싶어요/ }).click();
  await expect(page.getByText('초안 · 아직 보내지 않았어요')).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  const snapshot = await (await request.get('/api/today')).json();
  expect(snapshot.responses).toHaveLength(2);
  expect(snapshot.drafts).toHaveLength(1);
  expect(snapshot.drafts[0].sent).toBe(false);
  expect(external).toEqual([]);
});

test('keyboard confirmation, larger text and offline recovery remain usable', async ({ page }) => {
  await page.getByRole('button', { name: '시연 시간 1분 앞으로' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '내 응답 남기기' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '지금의 응답을 남겨주세요' })).toBeFocused();
  await page.getByRole('button', { name: '복용했다고 기록', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '돌아가기', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '이대로 기록하기' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('저장된 응답: 복용했다고 기록')).toBeVisible();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('checkbox', { name: '글자를 더 크게 보기' }).click();
  await expect(page.getByRole('checkbox', { name: '글자를 더 크게 보기' })).toBeChecked();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  const action = page.getByRole('button', { name: '약 알림 확인하기' });
  expect(await action.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(32);
  await page.route('**/api/today', (route) => route.abort());
  await expect(page.getByText('서버 연결 확인 필요', { exact: true })).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByRole('button', { name: '시연 시간 1분 앞으로' })).toBeDisabled();
  await page.unroute('**/api/today');
  await expect(page.getByText('로컬 서버 연결됨', { exact: true })).toBeVisible({ timeout: 5000 });
});

test('failed save keeps the confirmation open without claiming success', async ({
  page,
  request,
}) => {
  await page.getByRole('button', { name: '시연 시간 1분 앞으로' }).click();
  await page.getByRole('button', { name: '내 응답 남기기' }).click();
  await page.route('**/api/occurrences/*/responses', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: '테스트: 저장 실패' }),
    }),
  );
  await page.getByRole('button', { name: '복용했다고 기록', exact: true }).click();
  await page.getByRole('button', { name: '이대로 기록하기' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('저장 실패');
  await expect(page.getByText('본인 응답을 저장했어요.', { exact: false })).toHaveCount(0);
  expect((await (await request.get('/api/today')).json()).responses).toHaveLength(0);
});

test('initial load never claims an old hourly cue; missing voice stays explicit', async ({
  page,
  request,
}) => {
  await request.post('/api/demo/advance', { data: { minutes: 1 } });
  const claims: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/delivery')) claims.push(req.url());
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '좋은 하루예요' })).toBeVisible();
  await page.getByRole('button', { name: '시간 듣기', exact: true }).click();
  await expect(page.locator('.voice-status')).toContainText(/음성|목소리/);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByText(/사용 가능한 한국어 로컬 음성이 없어요/)).toBeVisible();
  expect(claims).toEqual([]);
});

test('keyboard, accessibility scan and 200 percent reflow', async ({ page }, testInfo) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '본문으로 바로가기' })).toBeFocused();
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await page.getByRole('heading', { name: '좋은 하루예요' }).focus();
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
  expect(audit.violations).toEqual([]);
  const mainAction = page.getByRole('button', { name: '약 알림 확인하기' });
  expect(
    await mainAction.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(28);
  expect((await mainAction.boundingBox())?.height).toBeGreaterThanOrEqual(72);
  // A 720 CSS-pixel viewport exercises the reflow of a 1440px screen at 200%.
  await page.setViewportSize({ width: 720, height: 550 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole('button', { name: '약 알림 확인하기' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reflow-200.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});
