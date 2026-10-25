#!/usr/bin/env node
/** Exercise authoring and rendering in an isolated copy; real drafts are never copied. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(process.argv[2] ?? join(root, 'test-results/blog-flow'));
const temp = mkdtempSync(join(tmpdir(), 'arietids-blog-flow-'));
const ignored = new Set(['.git', '.vercel', 'node_modules', 'dist', 'out', '.astro', 'test-results', 'playwright-report', '.drafts']);
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'result.json'), JSON.stringify({ passed: false, status: 'running' }) + '\n');
cpSync(root, temp, {
  recursive: true,
  filter: (path) => {
    const first = relative(root, path).split('/')[0];
    return !ignored.has(first) && !first.startsWith('.env') && !(first === 'src' && relative(root, path).startsWith('src/content/notes/'));
  },
});
symlinkSync(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');
mkdirSync(join(temp, '.drafts'), { recursive: true });
mkdirSync(join(temp, 'src/content/notes'), { recursive: true });
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', CONTENT_MODE: 'public' };
const astroCLI = join('node_modules/astro', JSON.parse(readFileSync(join(root, 'node_modules/astro/package.json'), 'utf8')).bin.astro);
const run = (args) => execFileSync(process.execPath, args, { cwd: temp, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const textFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? textFiles(path) : /\.(?:html|xml|json|js|css|txt|map)$/.test(path) ? [path] : [];
});
const post = ({ lang = 'zh', title = '框架验收 <test>', category = 'study', date = '2026-01-01', visibility = 'pending', body = 'Temporary fixture.' } = {}) => `---
visibility: ${visibility}
category: ${category}
title: ${JSON.stringify(title)}
description: "Temporary framework test fixture."
lang: ${lang}
date: "${date}"
tags: [test]
---

${body}
`;
const body = `## 目录与正文

Only a temporary rendering fixture.

### 代码片段

\`\`\`ts
const example = { category: 'study', published: false };
const longLine = 'This intentionally long line verifies horizontal scrolling inside the code block instead of widening the phone viewport. 1234567890123456789012345678901234567890';
\`\`\`

## 公式与表格

Inline math $E = mc^2$.

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

| Column one | Column two | Column three | Column four | Column five |
| --- | --- | --- | --- | --- |
| 111111111111111111111111 | 22222222222222222222222 | 33333333333333333333333 | 44444444444444444444444 | 55555555555555555555555 |

Footnote reference[^check].

[^check]: Temporary footnote.
`;
const fixtures = {
  'framework-check.zh.mdx': post({ body }),
  'framework-check.en.mdx': post({ lang: 'en', title: 'Framework verification', body: '## Translated heading\n\nOnly a temporary rendering fixture. $E=mc^2$.' }),
  'framework-only-en.en.md': post({ lang: 'en', title: 'English-only fixture', category: 'research', date: '2026-01-02', body: '## Only English\n\nDRAFT_UNPUBLISHED_CANARY_9342' }),
  'framework-newer.zh.md': post({ title: '较新文章验收', category: 'tech', date: '2026-01-03', body: '## Adjacent article\n\nDRAFT_NEIGHBOUR_CANARY_9342' }),
  'framework-private.zh.md': post({ title: 'PRIVATE_TITLE_CANARY_9342', visibility: 'private', body: 'PRIVATE_BODY_CANARY_9342' }),
};
for (const [name, text] of Object.entries(fixtures)) writeFileSync(join(temp, '.drafts', name), text);

let server;
let browser;
const checks = [];
try {
  // Explicitly request the preview build for these local-only fixtures.
  writeFileSync(join(output, 'preview-build.log'), execFileSync(process.execPath, [astroCLI, 'build'], {
    cwd: temp, env: { ...env, CONTENT_MODE: 'preview' }, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }));
  const port = await new Promise((done, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const address = probe.address(); probe.close(() => done(address.port)); });
  });
  server = spawn(process.execPath, [astroCLI, 'preview', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'], { cwd: temp, env: { ...env, CONTENT_MODE: 'preview' }, stdio: 'pipe' });
  let serverLog = '';
  server.stdout.on('data', chunk => { serverLog += chunk; });
  server.stderr.on('data', chunk => { serverLog += chunk; });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    assert(attempt < 100, `Preview server did not start: ${serverLog}`);
    await new Promise(done => setTimeout(done, 100));
  }
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light' });
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(30_000);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(`${request.failure()?.errorText} ${request.url()}`));
    await page.goto(`${base}/blog/framework-check/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => { document.documentElement.dataset.marks = 'off'; });
    assert.equal(await page.locator('h1').textContent(), '框架验收 <test>');
    assert((await page.locator('.outline nav a').count()) >= 3);
    for (const href of await page.locator('.outline nav a').evaluateAll(links => links.map(link => link.getAttribute('href')))) {
      assert(await page.evaluate(hash => Boolean(document.getElementById(hash.slice(1))), href), `Missing TOC target ${href}`);
    }
    assert((await page.locator('.katex').count()) >= 2, 'Math must be rendered');
    assert.equal(await page.locator('.prose table').count(), 1);
    if (width === 390) {
      assert(await page.locator('.prose table').evaluate(el => el.scrollWidth > el.clientWidth), 'Wide table should scroll without squeezing its columns');
    }
    assert((await page.locator('.prose .footnotes').count()) > 0, 'Footnotes must be rendered');
    assert.equal(await page.locator('.adjacent a[rel="next"]').count(), 1);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'day');
    const token = page.locator('pre.astro-code span[style]').first();
    const dayColor = await token.evaluate(el => getComputedStyle(el).color);
    const data = await page.locator('script[type="application/ld+json"]').evaluateAll(els => els.map(el => JSON.parse(el.textContent)));
    assert.equal(data.find(item => item['@type'] === 'BlogPosting').headline, '框架验收 <test>');
    assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true, 'Article must not overflow');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    await page.screenshot({ path: join(output, `article-${width}-day.png`), fullPage: true });
    await page.locator('[data-theme-toggle]:visible').first().click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'night');
    await page.waitForFunction(() => document.getAnimations().filter(animation => animation instanceof CSSTransition).every(animation => animation.playState !== 'running'), null, { timeout: 5_000 });
    assert.notEqual(await token.evaluate(el => getComputedStyle(el).color), dayColor, 'Code highlighting must follow theme');
    const nightAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    assert.deepEqual(nightAxe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    await page.screenshot({ path: join(output, `article-${width}-night.png`), fullPage: true });
    if (width === 390) {
      await page.locator('.prose table').focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('.prose table').scrollLeft > 0);
    }
    const headingLink = page.locator('.outline a[href="#公式与表格"]');
    const anchor = await headingLink.getAttribute('href');
    await headingLink.click();
    assert.equal(decodeURIComponent(new URL(page.url()).hash), anchor);
    await page.locator('header .lang').click();
    await page.waitForLoadState('networkidle');
    assert.equal(new URL(page.url()).pathname, '/en/blog/framework-check/');
    await page.goto(`${base}/en/blog/framework-only-en/`, { waitUntil: 'networkidle' });
    const alternates = await page.locator('head link[hreflang]').evaluateAll(links => links.map(link => [link.getAttribute('hreflang'), link.getAttribute('href')]));
    assert.deepEqual(alternates.map(item => item[0]).sort(), ['en', 'x-default']);
    assert(alternates.every(item => item[1].endsWith('/en/blog/framework-only-en/')));
    assert.deepEqual(errors, []);
    await context.close();
    checks.push(`preview browser ${width}px: math, code themes, table, footnotes, TOC, neighbours, metadata, language links, overflow, axe`);
  }
  await browser.close(); browser = undefined;
  server.kill(); server = undefined;
  assert(!existsSync(join(temp, 'out/blog/framework-private/index.html')));
  run(['scripts/blog.mjs', 'publish', 'framework-check', '--lang', 'zh']);
  run(['scripts/blog.mjs', 'publish', 'framework-check', '--lang', 'en']);
  writeFileSync(join(temp, 'src/content/notes/framework-future.zh.md'), post({ title: 'FUTURE_TITLE_CANARY_9342', visibility: 'public', date: '2099-01-01', body: 'FUTURE_BODY_CANARY_9342' }));
  writeFileSync(join(output, 'public-build.log'), run([astroCLI, 'build']));
  writeFileSync(join(output, 'public-guard.log'), run(['scripts/check-public.mjs']));
  const html = readFileSync(join(temp, 'dist/blog/framework-check/index.html'), 'utf8');
  assert(html.includes('katex') && html.includes('astro-code') && html.includes('class="outline"'));
  const xml = readFileSync(join(temp, 'dist/rss.xml'), 'utf8');
  const studyFeed = readFileSync(join(temp, 'dist/blog/category/study/rss.xml'), 'utf8');
  assert(xml.includes('/blog/framework-check/') && studyFeed.includes('/blog/framework-check/'));
  assert(!readFileSync(join(temp, 'dist/blog/category/tech/rss.xml'), 'utf8').includes('<item>'));
  assert(readFileSync(join(temp, 'dist/sitemap-0.xml'), 'utf8').includes('/blog/framework-check/'));
  assert(readFileSync(join(temp, 'dist/blog/category/study/index.html'), 'utf8').includes('/blog/framework-check/'));
  const all = textFiles(join(temp, 'dist')).map(file => readFileSync(file, 'utf8')).join('\n');
  for (const marker of ['DRAFT_UNPUBLISHED_CANARY_9342', 'DRAFT_NEIGHBOUR_CANARY_9342', 'PRIVATE_TITLE_CANARY_9342', 'PRIVATE_BODY_CANARY_9342', 'FUTURE_TITLE_CANARY_9342', 'FUTURE_BODY_CANARY_9342']) assert(!all.includes(marker), `Private or scheduled content leaked: ${marker}`);
  for (const slug of ['framework-only-en', 'framework-newer', 'framework-private', 'framework-future']) {
    for (const locale of ['', 'en/']) assert(!existsSync(join(temp, `dist/${locale}blog/${slug}/index.html`)));
  }
  checks.push('publish CLI → public article, category, RSS, sitemap, math and code; local drafts/private/future entries absent from every text artifact');
  writeFileSync(join(output, 'result.json'), JSON.stringify({ passed: true, checks, isolated: true }, null, 2) + '\n');
  console.log(`Blog flow passed: ${checks.length} verification groups. Evidence: ${output}`);
} catch (error) {
  writeFileSync(join(output, 'result.json'), JSON.stringify({ passed: false, checks, error: error.message, isolated: true }, null, 2) + '\n');
  throw error;
} finally {
  await browser?.close();
  server?.kill();
  rmSync(temp, { recursive: true, force: true });
}
