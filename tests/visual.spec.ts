import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WORK = [
  'hierarchical-embodied-medical-ai',
  'efficient-vla',
  'auralis',
  'video-rss-aggregator',
  'feature-emergence-survey',
  'precision-medicine-essay',
  'linear-algebra-invariants',
];
const ROUTES = ['/', '/en/', ...WORK.flatMap((id) => [`/work/${id}/`, `/en/work/${id}/`]), '/missing-page/'];

/** Elements that stick out of the viewport sideways. The body clips overflow, so scrollWidth alone hides it. */
async function overflowing(page: Page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el.closest('.cosmos, canvas, svg, [aria-hidden="true"], .horizon, .sky')) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Content inside a horizontally scrolling rail is meant to extend past the edge.
      if (el.closest('[data-filters]') && el.parentElement?.closest('[data-filters]')) continue;
      if (r.right > w + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return out.slice(0, 10);
  });
}

for (const width of [320, 390]) {
  test(`nothing overflows sideways at ${width}px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      await page.goto(route);
      await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-visible')));
      expect(await overflowing(page), route).toEqual([]);
    }
    await ctx.close();
  });
}

test('hero tagline keeps the approved text exactly', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero .tagline')).toHaveText('关注医疗AI与具身智能，曾参与VLA与Agent方面项目');
});

test('theme list filters cards, updates group counts and hides empty groups', async ({ page }) => {
  await page.goto('/#work');
  await page.locator('[data-filter="local"]').click();
  const groups = page.locator('[data-group]');
  await expect(groups.filter({ has: page.locator('[data-card]:not([hidden])') })).toHaveCount(1);
  await expect(page.locator('[data-group]:not([hidden]) [data-group-count]')).toHaveText('2');
  await page.locator('[data-filter=""]').click();
  await expect(page.locator('[data-group]:not([hidden])')).toHaveCount(2);
});

test('paper detail shows its place on the atlas and a formatted citation', async ({ page }) => {
  await page.goto('/work/hierarchical-embodied-medical-ai/');
  await expect(page.locator('[data-plate]')).toBeVisible();
  await expect(page.locator('.cite')).toContainText('ITM Web of Conferences');
  await expect(page.locator('h1')).toHaveCSS('view-transition-name', 't-hierarchical-embodied-medical-ai');
  // BibTeX is folded away but still copyable once opened.
  await page.locator('.bib summary').click();
  await expect(page.locator('.bib pre')).toContainText('@article');
});

for (const scheme of ['dark', 'light'] as const) {
  test(`no axe violations on detail pages and 404 (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const route of ['/work/hierarchical-embodied-medical-ai/', '/en/work/auralis/', '/work/linear-algebra-invariants/', '/missing-page/', '/en/']) {
      await page.goto(route);
      await page.evaluate(() => {
        document.documentElement.dataset.marks = 'off';
        document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-visible'));
      });
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(violations.map((v) => `${route}: ${v.id}`)).toEqual([]);
    }
    await ctx.close();
  });
}

test('motion can be paused and stays paused across pages', async ({ page, isMobile }) => {
  await page.goto('/');
  // On phones the control lives in the menu sheet.
  if (isMobile) await page.locator('.menu-btn').click();
  const toggle = page.locator('[data-motion-toggle]:visible').first();
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/work/auralis/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
});

test('hovering stars and cards never resizes the atlas', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the side panel is desktop only');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/');
  await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-visible')));
  await page.locator('[data-atlas]').scrollIntoViewIfNeeded();
  const height = () => page.locator('[data-atlas]').evaluate((el) => el.getBoundingClientRect().height);
  const rest = await height();
  for (const sel of ['.tstar', '.wstar']) {
    const n = await page.locator(sel).count();
    for (let i = 0; i < n; i++) {
      await page.locator(sel).nth(i).hover({ force: true });
      expect(await height()).toBe(rest);
    }
  }
  await page.locator('[data-card]').first().hover();
  expect(await height()).toBe(rest);
  // Leaving restores the resting chart: no work star stays lit.
  await page.mouse.move(2, 2);
  await expect(page.locator('.wstar.lit')).toHaveCount(0);
});

test('a copy button returns to its label after rapid clicks', async ({ page }) => {
  await page.goto('/#contact');
  const btn = page.locator('.contact [data-copy]');
  const label = btn.locator('[data-copy-label]');
  const original = await label.textContent();
  await btn.click();
  await btn.click();
  await expect(label).toHaveText(original!, { timeout: 4000 });
});
