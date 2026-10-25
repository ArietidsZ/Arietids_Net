import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { checkPublic } from './check-public.mjs';

function fixture(t, { facts = [], work = [], themes = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'publication-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
  };
  for (const [collection, entries] of Object.entries({ facts, work, themes, honors: [], timeline: [] }))
    write(`src/content/${collection}.yaml`, stringify(entries));
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
  ['metadata.xml', '<channel><title>Arietids · Profile</title></channel>'],
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

test('rejects an arbitrary preview image and unapproved project sitemap link', (t) => {
  const f = fixture(t, { work: [{ id: 'hidden', visibility: 'pending', title: 'Unapproved project' }] });
  f.write('dist/review-card.png', Buffer.from([137, 80, 78, 71]));
  f.write('dist/sitemap.xml', '<loc>https://example.test/work/hidden/</loc>');
  assert.ok(f.problems().some((p) => p.includes('review-card.png')));
  assert.ok(f.problems().some((p) => p.includes('unapproved work route')));
});

test('JSON decoding does not join unrelated values or reinterpret literal HTML backslashes', (t) => {
  const f = fixture(t, { work: [{ id: 'hidden', visibility: 'private', title: 'Confidential alpha beta' }] });
  f.write('dist/data.json', JSON.stringify({ first: 'Confidential alpha', second: '\nbeta' }));
  f.write('dist/index.html', '<pre>Confidential alpha\\nbeta</pre>');
  assert.deepEqual(f.problems(), []);
  f.write('dist/data.json', JSON.stringify({ title: 'Confidential alpha\nbeta' }));
  assert.ok(f.problems().some((p) => p.includes('data.json: contains text from work:hidden')));
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

for (const [how, html] of [
  ['zero-width breaks', '<h3>A private\u200b research\u200b direction</h3>'],
  ['clause spans', '<p><span class="clause">A private research</span> <span class="clause">direction</span></p>'],
  ['an en-dash range', '<p>Pending project 2023–2024</p>'],
]) test(`finds unapproved text the typesetting split up (${how})`, (t) => {
  const f = fixture(t, { work: [
    { id: 'hidden-a', visibility: 'pending', themes: [], title: 'A private research direction' },
    { id: 'hidden-b', visibility: 'pending', themes: [], title: 'Pending project 2023-2024' },
  ] });
  f.write('dist/index.html', html);
  assert.ok(f.problems().some((p) => p.includes('contains text from work:hidden')), how);
});

test('short Chinese phrases are still distinctive', (t) => {
  const f = fixture(t, { facts: [{ id: 'honor.pending', visibility: 'pending', text: '致远荣誉奖学金' }] });
  f.write('dist/index.html', '<li>致远荣誉<span>奖学金</span></li>');
  assert.ok(f.problems().some((p) => p.includes('facts:honor.pending')));
});

for (const file of ['blog/index.html', 'en/blog/category/tech/index.html', 'notes/old/index.html', 'rss.xml', 'en/rss.xml', 'blog-media/post/figure.png']) {
  test(`main artifact rejects blog output: ${file}`, (t) => {
    const f = fixture(t);
    f.write(`dist/${file}`, 'unexpected blog artifact');
    assert.ok(f.problems().some((p) => p.includes('blog output belongs to the independent blog site')));
  });
}

test('withheld work URLs are rejected with or without trailing slashes', (t) => {
  const f = fixture(t, { work: [{ id: 'hidden', visibility: 'private', title: 'Internal research title' }] });
  for (const path of ['/work/hidden', '/en/work/hidden/?source=test']) {
    f.write('dist/sitemap.xml', `<loc>https://arietids.net${path}</loc>`);
    assert.ok(f.problems().some((p) => p.includes('unapproved work route')));
  }
});

test('local-only draft directories cannot be copied into the main artifact', (t) => {
  const f = fixture(t);
  for (const file of ['.drafts/private.md', 'assets/.drafts/private.md']) f.write(`dist/${file}`, 'Local-only content');
  assert.equal(f.problems().filter((p) => p.includes('local-only draft directory in public artifact')).length, 2);
});
