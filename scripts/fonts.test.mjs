import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import subsetFont from 'subset-font';
import { coverage, heldCodePoints } from './fonts.mjs';

const font = readFileSync(new URL('../src/assets/fonts/noto-serif-sc.subset.woff2', import.meta.url));
const absent = String.fromCodePoint(0x10ffff);

test('WOFF2 coverage comes from glyphs, excluding requested characters the font cannot draw', async () => {
  const present = '钟智博A';
  const actual = await heldCodePoints(font, present + absent);
  assert.deepEqual(actual, new Set([...present].map((c) => c.codePointAt(0))));
});

test('regenerated subsets advertise only their retained glyphs', async () => {
  const regenerated = await subsetFont(font, '钟A' + absent, { targetFormat: 'woff2', preserveNameIds: [13, 14] });
  assert.deepEqual(await heldCodePoints(regenerated, '钟智A' + absent), new Set(['钟'.codePointAt(0), 65]));
});

test('invalid font data fails instead of claiming requested characters are supported', async () => {
  await assert.rejects(heldCodePoints(Buffer.from('not a font'), '钟'), /Unrecognized font signature/);
  const emptySfnt = Buffer.alloc(12);
  emptySfnt.writeUInt32BE(0x00010000);
  await assert.rejects(heldCodePoints(emptySfnt, '钟'), /no readable Unicode character map/);
});

test('the checked-in CSS range matches the shipped font', async () => {
  const declared = coverage();
  assert.ok(declared.size > 0);
  assert.deepEqual(await heldCodePoints(font, String.fromCodePoint(...declared)), declared);
});
