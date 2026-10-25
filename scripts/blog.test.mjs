import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkBlogSources, main, newPost, postFiles, publishPost, readPost } from './blog.mjs';
import { isISODate, postIdentity, publicationDateReached, shanghaiDate } from '../src/lib/blog.ts';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'arietids-blog-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src/content/notes'), { recursive: true });
  return root;
}
const source = ({ date = '2026-10-25', updated = '', lang = 'zh', visibility = 'pending' } = {}) => `---
visibility: ${visibility}
category: research
lang: ${lang}
title: "Test fixture"
description: "A disposable test article."
date: "${date}"
${updated ? `updated: "${updated}"` : ''}
tags: [test]
review: "Private editorial marker"
---

Test body used only in a temporary test directory.
`;

test('new drafts are ignored-directory files with no publishable placeholder body', t => {
  const root = fixture(t);
  const file = newPost({ root, slug: 'first-note', category: 'tech', date: '2026-10-25' });
  assert.equal(file, join(root, '.drafts/first-note.zh.md'));
  assert.equal(readPost(readFileSync(file, 'utf8'), 'first-note.zh.md').data.visibility, 'pending');
  assert.throws(() => publishPost({ root, slug: 'first-note' }), /fill title and description/);
  assert.throws(() => newPost({ root, slug: 'first-note', category: 'tech' }), /already exists/);
  assert.equal(postFiles(join(root, 'src/content/notes')).length, 0);
});

test('publishing moves a completed draft, drops editorial metadata, and refuses overwrite', t => {
  const root = fixture(t);
  const file = newPost({ root, slug: 'first-note', category: 'research' });
  writeFileSync(file, source());
  const destination = publishPost({ root, slug: 'first-note' });
  const published = readFileSync(destination, 'utf8');
  assert.equal(readPost(published, 'first-note.zh.md').data.visibility, 'public');
  assert.ok(!published.includes('Private editorial marker'));
  assert.equal(existsSync(file), false);
  checkBlogSources(root);
  writeFileSync(file, source());
  assert.throws(() => publishPost({ root, slug: 'first-note' }), /already exists/);
  assert.equal(readFileSync(destination, 'utf8'), published);
});

test('identity rejects traversal, nested slugs, upper case, wrong locales and reserved routes', t => {
  const root = fixture(t);
  for (const slug of ['../outside', 'nested/note', 'Uppercase', 'hello.world', 'category', 'index', 'rss', '', 'a--b']) {
    assert.throws(() => newPost({ root, slug, category: 'tech' }));
    assert.throws(() => publishPost({ root, slug }));
  }
  assert.throws(() => newPost({ root, slug: 'safe', lang: '../x', category: 'tech' }));
  assert.throws(() => readPost(source({ lang: 'en' }), 'test.zh.md'), /lang must match/);
  assert.deepEqual(postIdentity('read-paper.en.mdx'), { slug: 'read-paper', lang: 'en', id: 'read-paper.en' });
});

test('dates are strict calendar days and updates cannot precede publication', () => {
  for (const value of ['2026-02-30', '2026-2-03', '2026-13-01', '2026-10-25T00:00:00Z', 'not-a-date']) {
    assert.equal(isISODate(value), false);
    assert.throws(() => readPost(source({ date: value }), 'test.zh.md'), /date must be a valid/);
  }
  assert.equal(isISODate('2024-02-29'), true);
  assert.equal(isISODate('2025-02-29'), false);
  assert.throws(() => readPost(source({ updated: '2026-10-24' }), 'test.zh.md'), /updated/);
  assert.throws(() => readPost(source({ updated: '2026-11-31' }), 'test.zh.md'), /updated/);
});

test('future article visibility switches at midnight in Asia/Shanghai', () => {
  const before = new Date('2026-10-24T15:59:59.999Z');
  const after = new Date('2026-10-24T16:00:00.000Z');
  assert.equal(shanghaiDate(before), '2026-10-24');
  assert.equal(publicationDateReached('2026-10-25', before), false);
  assert.equal(publicationDateReached(new Date('2026-10-25T00:00:00Z'), after), true);
  assert.equal(publicationDateReached('2026-02-30', after), false);
  assert.equal(publicationDateReached(new Date('invalid'), after), false);
});

test('source check rejects unpublished and incomplete articles in the public repository tree', t => {
  const root = fixture(t); const file = join(root, 'src/content/notes/test.zh.md');
  writeFileSync(file, source());
  assert.throws(() => checkBlogSources(root), /public GitHub source/);
  writeFileSync(file, source({ visibility: 'private' }));
  assert.throws(() => checkBlogSources(root), /public GitHub source/);
  writeFileSync(file, source({ visibility: 'public' }).replace('Test body used only in a temporary test directory.', '<!-- todo -->'));
  assert.throws(() => checkBlogSources(root), /write the article body/);
});

test('public source checks do not parse local private drafts', t => {
  const root = fixture(t);
  mkdirSync(join(root, '.drafts')); writeFileSync(join(root, '.drafts/broken.zh.md'), 'Unfinished private note');
  assert.doesNotThrow(() => checkBlogSources(root));
});

test('duplicate .md and .mdx identities and nested Markdown are rejected', t => {
  const root = fixture(t); const dir = join(root, 'src/content/notes');
  writeFileSync(join(dir, 'test.zh.md'), source()); writeFileSync(join(dir, 'test.zh.mdx'), source());
  assert.throws(() => postFiles(dir), /Duplicate article/);
  rmSync(join(dir, 'test.zh.mdx'));
  mkdirSync(join(dir, 'nested')); writeFileSync(join(dir, 'nested/hidden.zh.md'), source());
  assert.throws(() => postFiles(dir), /keep article files flat/);
});

test('draft media directories are allowed but nested articles are not', t => {
  const root = fixture(t); const dir = join(root, '.drafts');
  mkdirSync(join(dir, 'assets'), { recursive: true }); writeFileSync(join(dir, 'assets/plot.svg'), '<svg/>');
  assert.deepEqual(postFiles(dir, { allowMediaDirectories: true }), []);
  writeFileSync(join(dir, 'assets/hidden.zh.md'), source());
  assert.throws(() => postFiles(dir, { allowMediaDirectories: true }), /keep article files flat/);
});

test('symlinked drafts and output directories cannot redirect writes', t => {
  const root = fixture(t); const external = join(root, 'external'); mkdirSync(external);
  symlinkSync(external, join(root, '.drafts'), 'dir');
  assert.throws(() => newPost({ root, slug: 'test', category: 'tech' }), /symlink/);
  rmSync(join(root, '.drafts')); mkdirSync(join(root, '.drafts'));
  writeFileSync(join(external, 'test.zh.md'), source());
  symlinkSync(join(external, 'test.zh.md'), join(root, '.drafts/test.zh.md'));
  assert.throws(() => publishPost({ root, slug: 'test' }), /symlink/);
});

test('CLI rejects unrecognized options instead of silently changing publication intent', t => {
  const root = fixture(t);
  assert.throws(() => main(['new', 'test', '--unknown', 'yes'], root), /Invalid option/);
  assert.throws(() => main(['new', 'test', '--category'], root), /Invalid option/);
  assert.throws(() => main(['publish', 'test', '--date', '2026-10-25'], root), /--lang only/);
});
