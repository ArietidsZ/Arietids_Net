import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { checkPublic } from './check-public.mjs';

function fixture(t, { facts = [], work = [], themes = [], notes = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'publication-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
  };
  for (const [collection, entries] of Object.entries({ facts, work, themes, honors: [], timeline: [] }))
    write(`src/content/${collection}.yaml`, stringify(entries));
  for (const [id, data] of Object.entries(notes)) write(`src/content/notes/${id}.md`, `---\n${stringify(data)}---\n`);
  write('dist/index.html', '<title>Personal homepage</title>');
  return { root, write, problems: () => checkPublic(root).problems };
}

test('neutral public output permits the unchanged astronomical explanation', (t) => {
  const f = fixture(t, { facts: [
    { id: 'identity.alias', visibility: 'pending', text: 'Arietids' },
    { id: 'education.current', visibility: 'pending', text: 'Unconfirmed University', date: '2026-10-17' },
  ] });
  f.write('dist/index.html', '<title>Personal homepage</title><p>Most Arietids fall in daylight.</p><time>2026-10-17</time>');
  assert.deepEqual(f.problems(), []);
});

for (const [file, value] of [
  ['index.html', '<meta name="description" content="Homepage of Arietids">'],
  ['rss.xml', '<channel><title>Arietids · Notes</title></channel>'],
  ['data.json', '{"alias":"Arietids"}'],
  ['app.js', 'const profile={alias:"Arietids"};'],
  ['app.js.map', '{"sourcesContent":["name=\\u949f\\u667a\\u535a"]}'],
]) test(`rejects unapproved identity in ${file}`, (t) => {
  const f = fixture(t, { facts: [
    { id: 'identity.alias', visibility: 'pending', text: 'Arietids' },
    { id: 'identity.name', visibility: 'pending', text: '钟智博' },
  ] });
  f.write(`dist/${file}`, value);
  assert.ok(f.problems().some((p) => p.startsWith(`${file}:`)));
});

test('name approval does not authorize description or an unrelated theme', (t) => {
  const f = fixture(t, { facts: [
    { id: 'identity.name', visibility: 'public', text: 'Example Person' },
    { id: 'site.description', visibility: 'pending', text: 'A private research direction statement.' },
  ], themes: [{ id: 'hidden', label: 'Unconfirmed direction', blurb: 'Research area still awaiting approval.' }] });
  f.write('dist/index.html', '<title>Example Person</title><meta content="A private research direction statement."><button data-node="theme:hidden"></button>');
  assert.ok(f.problems().some((p) => p.includes('facts:site.description')));
  assert.ok(f.problems().some((p) => p.includes('theme:hidden')));
});

test('approved work and its associated theme can be published', (t) => {
  const f = fixture(t, { work: [{ id: 'allowed', visibility: 'public', themes: ['shown'], title: 'Approved work' }],
    themes: [{ id: 'shown', label: 'Approved theme', blurb: 'Associated with the approved work.' }] });
  f.write('dist/work/allowed/index.html', '<title>Approved work</title><button data-node="theme:shown">Approved theme</button>');
  f.write('dist/sitemap.xml', '<loc>https://example.test/work/allowed/</loc>');
  assert.deepEqual(f.problems(), []);
});

test('a pending translation does not block its approved counterpart', (t) => {
  const f = fixture(t, { notes: {
    'post.zh': { title: '已批准中文文章', visibility: 'public', lang: 'zh' },
    'post.en': { title: 'Unapproved English article', visibility: 'pending', lang: 'en' },
  } });
  f.write('dist/notes/post/index.html', '<title>已批准中文文章</title>');
  f.write('dist/sitemap.xml', '<loc>https://example.test/notes/post/</loc>');
  assert.deepEqual(f.problems(), []);
  f.write('dist/en/rss.xml', '<link>https://example.test/en/notes/post/</link>');
  assert.ok(f.problems().some((p) => p.includes('unapproved notes route')));
});

test('rejects an arbitrary preview image and unapproved project sitemap link', (t) => {
  const f = fixture(t, { work: [{ id: 'hidden', visibility: 'pending', title: 'Unapproved project' }] });
  f.write('dist/review-card.png', Buffer.from([137, 80, 78, 71]));
  f.write('dist/sitemap.xml', '<loc>https://example.test/work/hidden/</loc>');
  assert.ok(f.problems().some((p) => p.includes('review-card.png')));
  assert.ok(f.problems().some((p) => p.includes('unapproved work route')));
});

test('approved English route does not match the pending default-locale route', (t) => {
  const f = fixture(t, { notes: {
    'post.zh': { title: '未批准中文文章', visibility: 'pending', lang: 'zh' },
    'post.en': { title: 'Approved English article', visibility: 'public', lang: 'en' },
  } });
  f.write('dist/en/notes/post/index.html', '<title>Approved English article</title>');
  f.write('dist/sitemap.xml', '<loc>https://example.test/en/notes/post/</loc>');
  assert.deepEqual(f.problems(), []);
});

test('the private note template has no public route or payload', (t) => {
  const f = fixture(t, { notes: {
    'template.zh': { title: 'Private note template', visibility: 'private', lang: 'zh' },
  } });
  assert.deepEqual(f.problems(), []);
  f.write('dist/notes/template/index.html', '<h1>Private note template</h1>');
  assert.ok(f.problems().some((p) => p.includes('unapproved notes:template.zh')));
});

test('an approved email does not approve a personal contact invitation', (t) => {
  const f = fixture(t, { facts: [
    { id: 'contact.email', visibility: 'public', text: 'person@example.test' },
    { id: 'about.open', visibility: 'pending', text: 'Happy to hear from you about research or collaboration.' },
  ] });
  f.write('dist/index.html', '<a href="mailto:person@example.test">Email</a>');
  assert.deepEqual(f.problems(), []);
  f.write('dist/index.html', '<p>Email is the best way to reach me.</p>');
  assert.ok(f.problems().some((p) => p.includes('unapproved contact invitation')));
  f.write('dist/index.html', '<p>Happy to hear from you about research or collaboration.</p>');
  assert.ok(f.problems().some((p) => p.includes('facts:about.open')));
});
