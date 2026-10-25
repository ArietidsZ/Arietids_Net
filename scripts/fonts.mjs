#!/usr/bin/env node
/**
 * The Chinese display face, cut down to the characters the site actually sets.
 *
 * The full Noto Serif SC is 25 MB; Google's ~100 unicode-range slices still cost a Chinese page
 * 700+ KB across ten files, plus 100 KB of @font-face rules in the render-blocking stylesheet.
 * The site sets a few hundred Han characters, so one subset of exactly those is ~145 KB.
 *
 *   npm run fonts            build public pages, then subset the font to what they set
 *   npm run fonts -- --check  report Chinese characters in dist/ that the subset lacks
 *
 * The subset keeps the full weight axis and the CJK spacing features (halt, chws, palt) that
 * `text-spacing-trim` relies on. Its unicode-range lists exactly the characters it holds, so a
 * character added later without re-running this falls back to the system serif, never to a
 * missing glyph. `npm run build` runs the check and says so when that happens.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = {
  // Pinned to a google/fonts commit, so a re-run never silently changes the outlines.
  url: 'https://raw.githubusercontent.com/google/fonts/e7db6ca603fd4862010383ff17ffd6cc4ffac1c0/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf',
  sha256: '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9',
};
const FONT = join(root, 'src/assets/fonts/noto-serif-sc.subset.woff2');
const CSS = join(root, 'src/styles/noto-serif-sc.css');
const CACHE = join(root, 'node_modules/.cache/fonts/NotoSerifSC-wght.ttf');
// Default shaping plus the CJK spacing features; drops vertical forms, ruby and alternates.
const FEATURES = ['ccmp', 'locl', 'mark', 'mkmk', 'kern', 'liga', 'calt', 'rlig', 'rvrn', 'halt', 'chws', 'palt', 'vchw', 'vhal'];
/** Han, CJK punctuation and full-width forms: the characters only this face can set. */
const CJK = /[\u2e80-\u2fdf\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/u;
/** Zero-width and other invisible format characters need no glyph. */
const INVISIBLE = /[\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u;

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Every character in the built pages (text, titles, attributes). */
function builtChars(dirs) {
  const chars = new Set();
  for (const dir of dirs) {
    for (const file of walk(dir).filter((f) => f.endsWith('.html'))) for (const c of readFileSync(file, 'utf8')) chars.add(c);
  }
  return chars;
}

/** The code points in the generated stylesheet's unicode-range. */
export function coverage(css = readFileSync(CSS, 'utf8')) {
  const range = css.match(/unicode-range:\s*([^;]+);/)?.[1] ?? '';
  const out = new Set();
  for (const part of range.split(',')) {
    const [a, b = a] = part.trim().replace(/^U\+/i, '').split('-');
    for (let cp = parseInt(a, 16); cp <= parseInt(b, 16); cp++) out.add(cp);
  }
  return out;
}

/** Chinese characters set in `dir` that the subset cannot draw. */
export function missing(dir = join(root, 'dist'), css) {
  const have = coverage(css);
  return [...builtChars([dir])].filter((c) => CJK.test(c) && !have.has(c.codePointAt(0))).sort();
}

function ranges(codePoints) {
  const sorted = [...codePoints].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    const hex = (n) => n.toString(16);
    out.push(j > i ? `U+${hex(sorted[i])}-${hex(sorted[j])}` : `U+${hex(sorted[i])}`);
    i = j;
  }
  return out.join(',');
}

async function source() {
  if (!existsSync(CACHE)) {
    console.log('Downloading Noto Serif SC (25 MB, once)…');
    const res = await fetch(SOURCE.url);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${SOURCE.url}`);
    mkdirSync(join(CACHE, '..'), { recursive: true });
    writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
  }
  const buf = readFileSync(CACHE);
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== SOURCE.sha256) throw new Error(`Checksum mismatch for ${CACHE}; delete it and run again.`);
  return buf;
}

async function generate() {
  // Local drafts must not contribute to a font shipped with the public website.
  console.log('Building public pages to collect the characters they set…');
  execSync('npx astro build', { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CONTENT_MODE: 'public' } });
  if (!existsSync(join(root, 'dist'))) throw new Error('dist/ was not built');
  const { default: subsetFont } = await import('subset-font');
  const chars = builtChars([join(root, 'dist')]);
  // Printable ASCII too: Latin inside a Chinese title is set in this face wherever it comes first.
  for (let cp = 0x20; cp < 0x7f; cp++) chars.add(String.fromCharCode(cp));
  const text = [...chars].filter((c) => c.codePointAt(0) >= 0x20 && !INVISIBLE.test(c)).join('');
  const font = await subsetFont(await source(), text, {
    targetFormat: 'woff2',
    keepFeatures: FEATURES,
    preserveNameIds: [13, 14], // Keep the upstream license and license URL on future subsets.
  });
  // List only what the subset really holds, so anything else falls through to the next family.
  const held = await heldCodePoints(font, text);
  writeFileSync(FONT, font);
  writeFileSync(
    CSS,
    `/* Generated by scripts/fonts.mjs from Noto Serif SC (SIL OFL 1.1). Do not edit: run \`npm run fonts\`. */
@font-face {
  font-family: 'Noto Serif SC Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 200 900;
  src: url('../assets/fonts/noto-serif-sc.subset.woff2') format('woff2');
  unicode-range: ${ranges(held)};
}
`,
  );
  const han = [...held].filter((cp) => CJK.test(String.fromCodePoint(cp))).length;
  console.log(`✓ ${FONT.replace(root, '')}: ${(font.length / 1024).toFixed(0)} KB, ${held.size} characters (${han} CJK)`);
}

/** Code points of `text` that the font actually maps to a glyph. Invalid fonts must fail the build. */
export async function heldCodePoints(font, text) {
  const want = new Set([...text].map((c) => c.codePointAt(0)));
  const [{ default: fontverter }, { Blob, Face }] = await Promise.all([import('fontverter'), import('harfbuzzjs')]);
  // HarfBuzz reads sfnt tables; WOFF2 must be decompressed before inspecting its cmap.
  const sfnt = await fontverter.convert(font, 'sfnt');
  const mapped = new Face(new Blob(sfnt), 0).collectUnicodes();
  if (!mapped.length) throw new Error('The display font has no readable Unicode character map.');
  return new Set([...mapped].filter((cp) => want.has(cp)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const declared = coverage();
    const held = await heldCodePoints(readFileSync(FONT), String.fromCodePoint(...declared));
    if (!declared.size || held.size !== declared.size) throw new Error('The display font does not cover its declared CSS unicode-range. Run `npm run fonts`.');
    const dir = join(root, process.argv.find((a, i) => i > 1 && !a.startsWith('--')) ?? 'dist');
    const gaps = missing(dir);
    if (gaps.length) {
      console.warn(
        `\n⚠ ${gaps.length} Chinese character(s) are not in the subset display font and will fall back to the system serif:\n  ${gaps.join('')}\n  Run \`npm run fonts\` and commit the result.\n`,
      );
      if (process.argv.includes('--strict')) process.exitCode = 1;
    } else console.log('✓ The subset display font covers every Chinese character in the build.');
  } else {
    await generate();
  }
}
