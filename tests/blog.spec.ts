import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const [prefix, title, categoryNav] of [['', '博客', '博客分类'], ['/en', 'Blog', 'Blog categories']] as const) {
  test(`${title}: archive and three categories work without JavaScript`, async ({ browser, isMobile }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: isMobile ? 390 : 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${test.info().project.use.baseURL}${prefix}/blog/`);
    await expect(page.locator('h1')).toHaveText(title);
    const nav = page.getByRole('navigation', { name: categoryNav });
    await expect(nav.locator('a')).toHaveCount(4);
    for (const category of ['tech', 'study', 'research']) {
      await nav.locator(`a[href="${prefix}/blog/category/${category}/"]`).click();
      await expect(page).toHaveURL(new RegExp(`${prefix}/blog/category/${category}/$`));
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      const size = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: innerWidth }));
      expect(size.body).toBeLessThanOrEqual(size.viewport);
    }
    await context.close();
  });

  test(`${title}: overall and category feeds are valid even with no posts`, async ({ request, page }) => {
    for (const path of [`${prefix}/rss.xml`, ...['tech', 'study', 'research'].map((c) => `${prefix}/blog/category/${c}/rss.xml`)]) {
      const response = await request.get(path);
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('xml');
      const xml = await response.text();
      const feed = await page.evaluate((source) => {
        const doc = new DOMParser().parseFromString(source, 'text/xml');
        return { valid: !doc.querySelector('parsererror'), root: doc.documentElement.tagName, channel: doc.querySelectorAll('channel').length };
      }, xml);
      expect(feed).toEqual({ valid: true, root: 'rss', channel: 1 });
    }
  });
}

test('blog archive meets contrast and navigation checks in both themes', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/blog/');
    await page.evaluate(() => { document.documentElement.dataset.marks = 'off'; });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  }
});
