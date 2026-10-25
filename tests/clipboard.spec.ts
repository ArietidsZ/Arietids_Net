import { expect, test } from '@playwright/test';

for (const mode of ['native', 'fallback', 'false', 'throw'] as const) {
  test(`copy feedback is accurate when clipboard result is ${mode}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            document.documentElement.dataset.clipboardText = text;
            if (mode !== 'native') throw new DOMException('Clipboard denied', 'NotAllowedError');
          },
        },
      });
      document.execCommand = () => {
        document.documentElement.dataset.fallbackAttempted = 'true';
        if (mode === 'throw') throw new Error('Legacy clipboard unavailable');
        return mode === 'fallback';
      };
    }, mode);

    for (const [route, failedLabel] of [['/', '复制失败'], ['/en/', 'Copy failed']]) {
      await page.goto(route);
      const button = page.locator('.contact [data-copy]');
      const label = button.locator('[data-copy-label]');
      const original = await label.textContent();
      const textareaCount = await page.locator('textarea').count();
      await button.focus();
      await button.press('Enter');
      const copied = mode === 'native' || mode === 'fallback';
      const expected = copied ? await button.getAttribute('data-copied-label') : failedLabel;
      await expect(label).toHaveText(expected!);
      await expect(page.locator('[data-status]')).toHaveText(expected!);
      expect(await button.evaluate((el) => el.hasAttribute('data-copied'))).toBe(copied);
      await expect(page.locator('textarea')).toHaveCount(textareaCount);
      await expect(button).toBeFocused();
      expect(await page.locator('html').getAttribute('data-clipboard-text')).toBe(await button.getAttribute('data-copy'));
      expect(await page.locator('html').getAttribute('data-fallback-attempted')).toBe(mode === 'native' ? null : 'true');
      await expect(label).toHaveText(original!, { timeout: 4000 });
      await expect(page.locator('[data-status]')).toBeEmpty();
      await expect(button).not.toHaveAttribute('data-copied');
    }
    expect(errors).toEqual([]);
  });
}
