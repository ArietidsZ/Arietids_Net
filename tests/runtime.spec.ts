import { expect, test } from '@playwright/test';

test('pausing motion resets pointer tilt and blocks new movement', async ({ page, isMobile }) => {
  test.skip(isMobile, 'pointer tilt is only enabled for a fine pointer');
  await page.goto('/');
  const instrument = page.locator('[data-instrument]');
  const tilt = () => instrument.evaluate((el) => el.style.getPropertyValue('--ry'));
  await page.mouse.move(1300, 200);
  await expect.poll(tilt).not.toMatch(/^(|0(?:\.0+)?deg)$/);
  await page.locator('[data-motion-toggle]:visible').first().click();
  await expect.poll(tilt).toBe('0deg');
  await page.mouse.move(200, 700);
  await page.waitForTimeout(100);
  expect(await tilt()).toBe('0deg');
  await page.locator('[data-motion-toggle]:visible').first().click();
  await page.mouse.move(300, 300);
  await expect.poll(tilt).not.toMatch(/^(|0(?:\.0+)?deg)$/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(tilt).toBe('0deg');
});

test('theme follows the OS until the visitor chooses, then persists across navigation', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.locator('[data-theme-toggle]:visible').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await page.goto('/en/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
});
