import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ request, page }) => {
  expect((await request.post('/api/demo/reset', { data: { confirm: true } })).ok()).toBe(true);
  // Never depend on an installed voice, microphone permission, or paid service in CI.
  await page.route('**/api/voice/status', (route) =>
    route.fulfill({
      json: {
        provider: 'browser',
        configured: false,
        message: 'Use browser voice or type your message.',
      },
    }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(window.speechSynthesis, 'getVoices', {
      value: () => [],
      configurable: true,
    });
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto('/?presenter=1');
  await expect(page.getByRole('heading', { name: 'Good morning.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Advance 1 minute' })).toBeEnabled();
});

test('conversation confirms a medication response before saving and preserves it on reload', async ({
  page,
  request,
}) => {
  await page.getByRole('button', { name: 'Advance 1 minute' }).click();
  await page.getByRole('textbox', { name: 'Message Dayla' }).fill('I took it');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
  expect((await (await request.get('/api/today')).json()).responses).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.conversation-history')).toContainText('Saved.');
  expect((await (await request.get('/api/today')).json()).responses).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: 'Medication', exact: true }).click();
  await expect(page.getByText('Your response: I’ve taken it', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/\b(demo|example|simulation)\b/i);
});

test('one flow saves, corrects, reloads, changes a visit and prepares a private family draft', async ({
  page,
  request,
}) => {
  const external: string[] = [];
  page.on('request', (req) => {
    if (!req.url().startsWith('http://127.0.0.1:3101')) external.push(req.url());
  });
  await page.getByRole('button', { name: 'Advance 1 minute' }).click();
  await page.getByRole('button', { name: 'Medication', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Not yet', exact: true }).click();
  await page.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page.getByText('Your response: Not yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I’m not sure', exact: true }).click();
  await page.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page.getByText('Your response: I’m not sure', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Medication', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'I’m not sure', exact: true })).toBeVisible();
  await expect(page.getByText(/Updated response/)).toBeVisible();
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Edit visit' }).click();
  await page.getByRole('button', { name: 'Move 30 minutes later' }).click();
  await expect(page.getByText('Rescheduled', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit visit' }).click();
  await page.getByRole('button', { name: 'Cancel visit' }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Family', exact: true }).click();
  await page.getByRole('button', { name: /Share a meal/ }).click();
  await expect(page.getByText('Draft · Not sent', { exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  const snapshot = await (await request.get('/api/today')).json();
  expect(snapshot.responses).toHaveLength(2);
  expect(snapshot.drafts).toHaveLength(1);
  expect(snapshot.drafts[0].sent).toBe(false);
  expect(external).toEqual([]);
});

test('conversation-created family drafts are visible in Family after reload', async ({ page }) => {
  await page
    .getByRole('textbox', { name: 'Message Dayla' })
    .fill('Draft a family message about a meal');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.conversation-history')).toContainText('Here is a draft:');
  await page.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(page.locator('.draft-panel')).toContainText('meal');
  await page.reload();
  await page.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(page.locator('.draft-panel')).toContainText('meal');
});

test('keyboard confirmation, larger text and reconnecting remain usable', async ({ page }) => {
  await page.getByRole('button', { name: 'Advance 1 minute' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Medication', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'How are you doing with your medication?' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'I’ve taken it', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Save check-in' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Your response: I’ve taken it', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Larger text' }).click();
  await expect(page.getByRole('checkbox', { name: 'Larger text' })).toBeChecked();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  expect(
    await page
      .getByRole('textbox', { name: 'Message Dayla' })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(25);
  await page.route('**/api/today', (route) => route.abort());
  await expect(page.getByText(/Connecting to Dayla/)).toBeVisible({ timeout: 7000 });
  await expect(page.getByRole('button', { name: 'Advance 1 minute' })).toBeDisabled();
  await page.unroute('**/api/today');
  await expect(page.getByRole('button', { name: 'Advance 1 minute' })).toBeEnabled({
    timeout: 7000,
  });
});

test('failed save keeps its confirmation open and never claims success', async ({
  page,
  request,
}) => {
  await page.getByRole('button', { name: 'Advance 1 minute' }).click();
  await page.getByRole('button', { name: 'Medication', exact: true }).click();
  await page.route('**/api/occurrences/*/responses', (route) =>
    route.fulfill({ status: 503, json: { error: 'Unable to save your response.' } }),
  );
  await page.getByRole('button', { name: 'I’ve taken it', exact: true }).click();
  await page.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Unable to save');
  await expect(page.getByText('Your check-in is saved.')).toHaveCount(0);
  expect((await (await request.get('/api/today')).json()).responses).toHaveLength(0);
});

test('a pending playback claim is cancelled when the page becomes hidden', async ({
  page,
  request,
}) => {
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
  await page.getByRole('button', { name: 'Advance 1 minute' }).click();
  await expect.poll(() => claimed).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  release();
  await expect
    .poll(async () => (await (await request.get('/api/today')).json()).cue.delivery)
    .toBe('unknown');
  await expect(page.locator('.conversation-history')).toHaveCount(0);
});

test('slow polling still updates the clock; reload does not replay an earlier cue', async ({
  page,
  request,
}) => {
  await page.route('**/api/today', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  await request.post('/api/demo/advance', { data: { minutes: 1 } });
  await expect(page.locator('.topbar-date')).toContainText('9:00', { timeout: 9000 });
  await page.unroute('**/api/today');
  const claims: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/delivery')) claims.push(req.url());
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Good morning.' })).toBeVisible();
  await expect(page.locator('.conversation-history')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start speaking' }).click();
  await expect(page.getByRole('button', { name: 'Use browser voice' })).toBeVisible();
  await page.getByRole('button', { name: 'Use browser voice' }).click();
  await expect(
    page.getByText('This browser cannot listen. Please type your message.'),
  ).toBeVisible();
  expect(claims).toEqual([]);
});

test('unavailable news is clear and does not invent headlines', async ({ page }) => {
  await page.route('**/api/news', (route) =>
    route.fulfill({
      json: {
        status: 'unavailable',
        fetchedAt: null,
        articles: [],
        message: 'Please try again later.',
      },
    }),
  );
  await page.getByRole('button', { name: 'News', exact: true }).click();
  await page.getByRole('button', { name: 'Get the news' }).click();
  await expect(page.getByText(/News is unavailable right now/)).toBeVisible();
  await expect(page.locator('.news-list article')).toHaveCount(0);
});

test('minimal home is accessible and reflows at 200 percent and mobile widths', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good morning.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset morning' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/\b(demo|example|simulation)\b/i);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('heading', { name: 'Good morning.' }).focus();
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
  expect(
    (await page.getByRole('button', { name: 'Start speaking' }).boundingBox())?.height,
  ).toBeGreaterThanOrEqual(72);
  await page.setViewportSize({ width: 720, height: 550 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole('button', { name: 'Start speaking' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reflow-200.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Medication', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'How are you doing with your medication?' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('rounded navigation starts collapsed and supports pointer and keyboard toggling', async ({
  page,
}, testInfo) => {
  const sidebar = page.locator('#dayla-sidebar');
  const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar.locator('.nav-item span').first()).toBeHidden();
  await expect(page.getByRole('button', { name: 'Medication', exact: true })).toBeVisible();
  expect(await sidebar.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('24px');
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('sidebar-collapsed.png'),
  });

  await toggle.click();
  const close = page.getByRole('button', { name: 'Close navigation', exact: true });
  await expect(close).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar.locator('.nav-item span').first()).toBeVisible();
  await page.getByRole('button', { name: 'Medication', exact: true }).click();
  await expect(close).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('sidebar-expanded.png'),
  });
  await close.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.press('Enter');
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sidebar).toBeHidden();
  await toggle.click();
  await expect(sidebar).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('sidebar-mobile-open.png'),
  });
  await page.keyboard.press('Escape');
  await expect(sidebar).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page
    .getByRole('button', { name: 'Dismiss navigation' })
    .click({ position: { x: 370, y: 400 } });
  await expect(sidebar).toBeHidden();
});
