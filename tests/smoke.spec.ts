import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

test('home renders every section without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('#hero-name')).toContainText('钟智博');
  for (const id of ['about', 'publication', 'work', 'contact']) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
  for (const gone of ['opensource', 'trajectory', 'honors']) await expect(page.locator(`#${gone}`)).toHaveCount(0);
  // The timeline carries the owner's corrected years.
  await expect(page.locator('#about .track')).toContainText('2024');
  await expect(page.locator('#about .track')).toContainText('2025');
  await expect(page.locator('.channel[href^="https://github.com/"]')).toHaveCount(1);
  await expect(page.locator('[data-preview-bar]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('theme toggle switches and persists', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');
  await page.locator('[data-theme-toggle]').first().click();
  await expect(html).not.toHaveAttribute('data-theme', before!);
  await page.reload();
  await expect(html).not.toHaveAttribute('data-theme', before!);
});

test('atlas theme star filters the work grid, and chips stay in sync', async ({ page }) => {
  await page.goto('/#work');
  const cards = page.locator('[data-grid] [data-card]');
  const total = await cards.count();
  await page.locator('[data-node="theme:local"]').click();
  await expect(page.locator('[data-filter="local"]')).toHaveAttribute('aria-pressed', 'true');
  const visible = page.locator('[data-grid] [data-card]:not([hidden])');
  await expect.poll(() => visible.count()).toBeLessThan(total);
  for (const themes of await visible.evaluateAll((els) => els.map((e) => e.getAttribute('data-themes')))) {
    expect(themes).toContain('local');
  }
  await page.locator('[data-filter=""]').click();
  await expect.poll(() => visible.count()).toBe(total);
  await expect(page.locator('[data-node="theme:local"]')).toHaveAttribute('aria-pressed', 'false');
});

test('portrait flips to its second side', async ({ page }) => {
  await page.goto('/');
  const flip = page.locator('[data-flip]');
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  await flip.click();
  await expect(flip).toHaveAttribute('aria-pressed', 'true');
});

test('language switch keeps the page', async ({ page }) => {
  await page.goto('/work/auralis/');
  await page.locator('header .lang').click();
  await expect(page).toHaveURL(/\/en\/work\/auralis\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('work detail lists its notes', async ({ page }) => {
  await page.goto('/en/work/auralis/');
  await expect(page.locator('h1')).toContainText('Auralis');
  await expect(page.locator('.caveats li').first()).toBeVisible();
});

test('mobile menu opens and navigates', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only');
  await page.goto('/');
  await page.locator('.menu-btn').click();
  await expect(page.locator('#site-menu')).toBeVisible();
  await page.locator('#site-menu a').first().click();
  await expect(page.locator('#site-menu')).toBeHidden();
});

test('no axe violations on the home page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => (document.documentElement.dataset.marks = 'off'));
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});
