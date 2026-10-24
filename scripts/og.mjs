#!/usr/bin/env node
/**
 * Generates the 1200×630 share card at public/og.png with headless Chromium.
 *
 *   npm run og                         uses only `public` facts; refuses if the name is not public
 *   npm run og -- --preview --out x.png  includes `pending` facts; never writes public/, dist/, out/
 *
 * Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a preinstalled browser.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { chromium } from '@playwright/test';
import { createPublicOgManifest, resolveOgOutput } from './og-approval.mjs';

const args = process.argv.slice(2);
const preview = args.includes('--preview');
const outIdx = args.indexOf('--out');
const root = new URL('..', import.meta.url);
const rootPath = fileURLToPath(root);
const publicOutput = fileURLToPath(new URL('public/og.png', root));
if (preview && outIdx < 0) {
  console.error('--preview needs --out <file> outside public/, dist/ and out/.');
  process.exit(1);
}
let out;
try {
  out = resolveOgOutput(rootPath, outIdx >= 0 ? args[outIdx + 1] : publicOutput, preview);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const facts = parse(readFileSync(new URL('src/content/facts.yaml', root), 'utf8'));
const shown = (id) => {
  const f = facts.find((x) => x.id === id);
  return f && (f.visibility === 'public' || (preview && (f.visibility ?? 'pending') === 'pending')) ? f : undefined;
};
const pick = (v, lang) => (typeof v === 'string' ? v : v?.[lang] ?? v?.zh ?? '');

const name = shown('identity.name');
if (!name) {
  console.error('identity.name is not public; refusing to generate a share card.');
  process.exit(1);
}
const alias = shown('identity.alias');
const tagline = shown('hero.tagline');
const avatar = shown('avatar.blue');
const art = avatar ? new URL('src/assets/avatars/avatar-blue.png', root).href : undefined;
const font = (pkg, file) => pathToFileURL(fileURLToPath(new URL(`node_modules/${pkg}/files/${file}`, root))).href;

const cjk = pathToFileURL(fileURLToPath(new URL('node_modules/@fontsource-variable/noto-serif-sc/wght.css', root))).href;
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${cjk}"><style>
@font-face{font-family:F;src:url(${font('@fontsource-variable/fraunces', 'fraunces-latin-opsz-normal.woff2')})}
@font-face{font-family:M;src:url(${font('@fontsource-variable/geist-mono', 'geist-mono-latin-wght-normal.woff2')})}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:#0b1020;color:#f3ecdd;font-family:F,'Noto Serif SC Variable','Songti SC',serif;position:relative}
.art{position:absolute;inset:0 0 0 auto;width:630px;height:630px;${art ? `background:url(${art}) center/cover;` : ''}
  -webkit-mask-image:linear-gradient(to right,transparent,#000 45%);mask-image:linear-gradient(to right,transparent,#000 45%)}
.glow{position:absolute;inset:0;background:radial-gradient(50% 60% at 78% 20%,rgba(233,196,106,.22),transparent 70%)}
.copy{position:absolute;left:80px;top:90px;width:640px}
.eyebrow{font-family:M;font-size:22px;letter-spacing:.14em;color:#e9c46a;text-transform:uppercase}
h1{font-size:104px;font-weight:600;line-height:1.02;margin-top:28px;letter-spacing:.02em}
h2{font-size:42px;font-style:italic;font-weight:400;color:#e9c46a;margin-top:18px}
p{font-size:26px;line-height:1.5;color:#c3c8d8;margin-top:34px;font-family:system-ui,'Noto Sans CJK SC',sans-serif}
.foot{position:absolute;left:80px;bottom:56px;font-family:M;font-size:20px;letter-spacing:.1em;color:#8c93a8}
.foot b{color:#e9c46a;font-weight:400}
</style></head><body>
<div class="art"></div><div class="glow"></div>
<div class="copy">
  <div class="eyebrow">${alias ? pick(alias.text, 'en') : 'Personal homepage'}</div>
  <h1>${pick(name.text, 'zh')}</h1>
  <h2>${pick(name.text, 'en')}</h2>
  ${tagline ? `<p>${pick(tagline.text, 'zh')}</p>` : ''}
</div>
<div class="foot"><b>✦</b> arietids.net</div>
</body></html>`;

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// Load from a file:// URL so the card can reference local fonts and artwork.
const dir = mkdtempSync(join(tmpdir(), 'og-'));
writeFileSync(join(dir, 'card.html'), html);
await page.goto(pathToFileURL(join(dir, 'card.html')).href, { waitUntil: 'networkidle' });
await page.screenshot({ path: out });
await browser.close();
rmSync(dir, { recursive: true, force: true });
if (!preview && out === resolveOgOutput(rootPath, publicOutput, false)) {
  const manifest = createPublicOgManifest(rootPath, out, [name, alias, tagline, avatar].filter(Boolean));
  writeFileSync(new URL('og.sources.json', root), `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(`share card written to ${out}${preview ? ' (preview: includes pending content)' : ''}`);
