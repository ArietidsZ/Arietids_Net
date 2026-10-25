import { expect, test, type Page } from '@playwright/test';

/**
 * Checks on the public artifact (playwright.public.config.ts), which the preview-mode suites never
 * load: every route renders with no failed request or script error, nothing pending leaks into the
 * DOM, the subset display font covers the page, and the home page stays inside its byte budget.
 */
const locations = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).href);

/** Transfer budgets for a first visit to the home page, in KB (woff2 and images as sent; text as decoded). */
const BUDGET = { font: 400, image: { desktop: 200, mobile: 160 }, bothImages: { desktop: 220, mobile: 300 }, css: 80, js: 60 };

function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`error: ${e.message}`));
  // Avoid duplicate browser messages: HTTP failures and transport failures are both recorded below.
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && problems.push(`console: ${m.text()}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.failure()?.errorText ?? 'unknown'} ${r.url()}`));
  page.on('response', (r) => {
    const expected404 = r.status() === 404 && r.request().isNavigationRequest() && new URL(r.url()).pathname === '/missing-page/';
    if (r.status() >= 400 && !expected404) problems.push(`${r.status()} ${r.url()}`);
  });
  return problems;
}

test('every published route and the 404 page render cleanly', async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  const index = await request.get('/sitemap-index.xml');
  expect(index.ok()).toBe(true);
  const maps = locations(await index.text());
  expect(maps.length).toBeGreaterThan(0);
  const routes = new Set<string>();
  for (const path of maps) {
    const sitemap = await request.get(path);
    expect(sitemap.ok()).toBe(true);
    for (const route of locations(await sitemap.text())) routes.add(route);
  }
  expect(routes.has(new URL('/', baseURL).href)).toBe(true);
  expect(routes.has(new URL('/en/', baseURL).href)).toBe(true);
  const missingPage = new URL('/missing-page/', baseURL).href;
  routes.add(missingPage);
  const problems = watch(page);
  for (const route of routes) {
    await test.step(route, async () => {
      const response = await page.goto(route, { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(route === missingPage ? 404 : 200);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('[data-visibility="pending"], [data-visibility="private"], [data-preview-bar]')).toHaveCount(0);
      expect(problems).toEqual([]);
    });
  }
});

test('the error watcher detects an image request aborted before an HTTP response', async ({ page }) => {
  const problems = watch(page);
  await page.route('**/avatar-gold.*.avif', (route) => route.abort('failed'));
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('h1').first()).toBeVisible();
  await expect.poll(() => page.locator('.portrait .front img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 0)).toBe(true);
  expect(problems.some((p) => p.startsWith('requestfailed:') && p.includes('/avatar-gold.'))).toBe(true);
});

test('the Chinese display face is the subset and draws the name', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.family.includes('Noto Serif SC')).map((f) => f.status);
  });
  expect(faces).toEqual(['loaded']);
  expect(await page.evaluate(() => document.fonts.check('600 64px "Noto Serif SC Variable"', '钟智博'))).toBe(true);
});

test('the home page stays inside its initial and both-portrait byte budgets', async ({ page, isMobile }) => {
  await page.goto('/', { waitUntil: 'load' });
  const kb = await page.evaluate(() => {
    const sum = { font: 0, image: 0, css: 0, js: 0 };
    for (const r of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
      const ext = new URL(r.name).pathname.split('.').pop() ?? '';
      if (ext === 'woff2') sum.font += r.encodedBodySize;
      else if (['avif', 'webp', 'jpg', 'png'].includes(ext)) sum.image += r.encodedBodySize;
      else if (ext === 'css') sum.css += r.decodedBodySize;
      else if (ext === 'js') sum.js += r.decodedBodySize;
    }
    return Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round(v / 1024)]));
  });
  expect.soft(kb.font, 'fonts').toBeLessThanOrEqual(BUDGET.font);
  expect.soft(kb.image, 'images before the page settles').toBeLessThanOrEqual(BUDGET.image[isMobile ? 'mobile' : 'desktop']);
  expect.soft(kb.css, 'stylesheets').toBeLessThanOrEqual(BUDGET.css);
  expect.soft(kb.js, 'scripts').toBeLessThanOrEqual(BUDGET.js);
  // Check the deferred face too, so moving bytes past `load` cannot make them disappear from the budget.
  await page.locator('[data-flip]').click();
  await expect.poll(() => page.locator('.portrait .back img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const images = await page.evaluate(() => performance.getEntriesByType('resource').reduce((sum, entry) => {
    const r = entry as PerformanceResourceTiming;
    return /\.(avif|webp|jpg|png)$/.test(new URL(r.name).pathname) ? sum + r.encodedBodySize : sum;
  }, 0) / 1024);
  expect(images, 'both portrait images').toBeLessThanOrEqual(BUDGET.bothImages[isMobile ? 'mobile' : 'desktop']);
});

test('the sky and the loops rest when motion is paused', async ({ page, isMobile }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  if (isMobile) await page.locator('.menu-btn').click();
  await page.locator('[data-motion-toggle]:visible').first().click();
  if (isMobile) await page.keyboard.press('Escape');
  // The theme reveal is a view transition: with motion paused it must not animate.
  const animated = await page.evaluate(async () => {
    const calls: string[] = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (k, o) {
      if (o && typeof o === 'object' && 'pseudoElement' in o) calls.push(String(o.pseudoElement));
      return animate.call(this, k, o);
    };
    document.querySelector<HTMLElement>('[data-theme-toggle]')?.click();
    await new Promise((r) => setTimeout(r, 400));
    return calls;
  });
  expect(animated).toEqual([]);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length);
  expect(running).toBe(0);
});

// Site identity and navigation stay local; the blog is an ordinary external destination.
test('main site links to the independent blog without embedding its navigation', async ({ page }) => {
  for (const [path, destination] of [['/', 'https://blog.arietids.net/'], ['/en/', 'https://blog.arietids.net/en/']]) {
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.locator('.brand')).toHaveAttribute('href', path);
    await expect(page.locator('.nav a').filter({ hasText: /^(博客|Blog)$/ })).toHaveAttribute('href', destination);
    await expect(page.locator('.sheet a').filter({ hasText: /^(博客|Blog)/ })).toHaveAttribute('href', destination);
    await expect(page.locator('link[type="application/rss+xml"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/blog/"], a[href^="/en/blog/"], [data-category-filter]')).toHaveCount(0);
  }
});
