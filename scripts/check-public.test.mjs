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
  for (const [id, data] of Object.entries(notes)) write(`src/content/notes/${id}.md`, `---\n${stringify({ date: '2020-01-01', ...data })}---\n`);
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

for (const body of ['<section />', '\u200b'.repeat(10)]) {
  test(`a private draft without visible text does not match every page (${JSON.stringify(body)})`, (t) => {
    const f = fixture(t);
    f.write('src/content/notes/draft.zh.mdx', `---\ntitle: Private draft\nvisibility: private\nlang: zh\n---\n${body}\n`);
    assert.deepEqual(f.problems(), []);
    // The source must still be caught if a debug payload actually exposes it.
    f.write('dist/debug.txt', `${body}\n`);
    assert.ok(f.problems().some((p) => p.includes('debug.txt: contains text from notes:draft.zh')));
  });
}

test('a JSON payload cannot expose a private multiline note body through escaped controls', (t) => {
  const body = 'Internal alpha plan.\nInternal beta details.\tPrivate continuation.\r\n';
  const f = fixture(t);
  f.write('src/content/notes/draft.zh.mdx', `---\ntitle: Private draft\nvisibility: private\nlang: zh\n---\n${body}`);
  assert.deepEqual(f.problems(), []);
  f.write('dist/data.json', JSON.stringify({ payload: [{ body }] }));
  assert.ok(f.problems().some((p) => p.includes('data.json: contains text from notes:draft.zh')));
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

test('approved blog media must belong to a due public post and match its source', (t) => {
  const f = fixture(t, { notes: {
    'systems.zh': { title: 'Approved systems article', visibility: 'public', lang: 'zh', category: 'tech' },
  } });
  const image = Buffer.from('approved-image-content');
  f.write('public/blog-media/systems/diagram.png', image);
  f.write('dist/blog-media/systems/diagram.png', image);
  f.write('dist/blog/systems/index.html', '<h1>Approved systems article</h1><img src="/blog-media/systems/diagram.png">');
  assert.deepEqual(f.problems(), []);
  f.write('dist/blog-media/systems/unlisted.png', image);
  assert.ok(f.problems().some((p) => p.startsWith('blog-media/systems/unlisted.png: media has no published article')));
  f.write('dist/blog-media/systems/diagram.png', Buffer.from('different-image-content'));
  assert.ok(f.problems().some((p) => p.startsWith('blog-media/systems/diagram.png: media has no published article')));
});

for (const visibility of ['pending', 'private', 'future']) {
  test(`${visibility} blog media and blog routes are not public`, (t) => {
    const f = fixture(t, { notes: {
      'withheld.zh': {
        title: 'Withheld article title', lang: 'zh', category: 'research',
        visibility: visibility === 'future' ? 'public' : visibility,
        date: visibility === 'future' ? '2999-01-01' : '2020-01-01',
      },
    } });
    const image = Buffer.from('withheld-image-content');
    f.write('public/blog-media/withheld/diagram.png', image);
    f.write('dist/blog-media/withheld/diagram.png', image);
    f.write('dist/blog/withheld/index.html', '<h1>Withheld article title</h1>');
    f.write('dist/rss.xml', '<link>https://example.test/blog/withheld</link>');
    const problems = f.problems();
    assert.ok(problems.some((p) => p.startsWith('blog-media/withheld/diagram.png: media has no published article')));
    assert.ok(problems.some((p) => p.includes('blog/withheld/index.html: route belongs to unapproved notes:withheld.zh')));
    assert.ok(problems.some((p) => p.includes('rss.xml: contains an unapproved notes route')));
  });
}

test('publication date uses the Shanghai calendar day and category metadata is not private prose', (t) => {
  const f = fixture(t, { notes: {
    'due.zh': { title: 'Shanghai midnight article', visibility: 'public', lang: 'zh', date: '2026-10-25', category: 'research', updated: '2026-10-25' },
    'later.zh': { title: 'Later article', visibility: 'pending', lang: 'zh', date: '2026-10-25', category: 'research', updated: '2026-10-25' },
  } });
  f.write('dist/blog/due/index.html', '<h1>Shanghai midnight article</h1><span>research</span><time>2026-10-25</time>');
  assert.deepEqual(checkPublic(f.root, join(f.root, 'dist'), new Date('2026-10-24T16:00:00Z')).problems, []);
  assert.ok(checkPublic(f.root, join(f.root, 'dist'), new Date('2026-10-24T15:59:59Z')).problems.some((p) => p.includes('notes:due.zh')));
});

test('local draft text and assets are blocked even if its frontmatter says public', (t) => {
  const f = fixture(t);
  const body = 'Private draft alpha paragraph.\n\nPrivate draft beta paragraph.';
  f.write('.drafts/local.zh.mdx', `---\n${stringify({ title: 'Local-only draft', visibility: 'public', lang: 'zh', category: 'research', date: '2020-01-01' })}---\n${body}`);
  const asset = Buffer.from('private-draft-asset-unique-bytes');
  f.write('.drafts/figure.pdf', asset);
  f.write('.drafts/internal.txt', 'Internal appendix only for local review.');
  assert.deepEqual(f.problems(), []);
  f.write('dist/search.json', JSON.stringify({ body }));
  f.write('dist/blog/local/index.html', '<h1>Local-only draft</h1>');
  f.write('dist/downloads/renamed.pdf', asset);
  f.write('dist/debug.html', '<p>Internal appendix only for local review.</p>');
  const problems = f.problems();
  assert.ok(problems.some((p) => p.includes('search.json: contains text from notes:local.zh')));
  assert.ok(problems.some((p) => p.includes('blog/local/index.html: route belongs to unapproved notes:local.zh')));
  assert.ok(problems.some((p) => p.includes('downloads/renamed.pdf: local draft file or asset')));
  assert.ok(problems.some((p) => p.includes('debug.html: contains text from local draft:internal.txt')));
});

test('a local revision does not revoke an existing public route but its new text stays private', (t) => {
  const f = fixture(t, { notes: {
    'post.en': { title: 'Public article', visibility: 'public', lang: 'en', category: 'study' },
  } });
  f.write('.drafts/post.en.md', '---\ntitle: Confidential revised title\nvisibility: pending\nlang: en\n---\nConfidential revised paragraph.');
  f.write('dist/en/blog/post/index.html', '<h1>Public article</h1>');
  assert.deepEqual(f.problems(), []);
  f.write('dist/en/blog/post/index.html', '<h1>Confidential revised title</h1>');
  assert.ok(f.problems().some((p) => p.includes('contains text from notes:post.en')));
});

test('a public post does not approve draft assets outside its media package or unknown hashed imports', (t) => {
  const f = fixture(t, { notes: {
    'post.zh': { title: 'Public article', visibility: 'public', lang: 'zh', category: 'tech' },
  } });
  const asset = Buffer.from('private-draft-image-unique-bytes');
  f.write('.drafts/private-image.png', asset);
  f.write('public/blog-media/unpublished/copied.png', asset);
  f.write('dist/blog-media/unpublished/copied.png', asset);
  f.write('dist/downloads/copied.png', asset);
  f.write('dist/_astro/unknown.randomhash.webp', Buffer.from('unknown-transformed-image'));
  const problems = f.problems();
  assert.ok(problems.some((p) => p.includes('blog-media/unpublished/copied.png: local draft file or asset')));
  assert.ok(problems.some((p) => p.includes('downloads/copied.png: local draft file or asset')));
  assert.ok(problems.some((p) => p.includes('_astro/unknown.randomhash.webp: image has no approved source')));
});

test('explicitly approved public media may retain an identical local draft copy', (t) => {
  const f = fixture(t, { notes: {
    'post.zh': { title: 'Public article', visibility: 'public', lang: 'zh', category: 'tech' },
  } });
  for (const [filename, asset] of [
    ['figure.png', Buffer.from('approved-shared-image-bytes')],
    ['diagram.svg', '<svg xmlns="http://www.w3.org/2000/svg"><title>Approved shared diagram</title></svg>'],
  ]) {
    f.write(`.drafts/assets/${filename}`, asset);
    f.write(`public/blog-media/post/${filename}`, asset);
    f.write(`dist/blog-media/post/${filename}`, asset);
  }
  assert.deepEqual(f.problems(), []);
});

test('a future public article does not authorize its body or legacy redirect', (t) => {
  const f = fixture(t, { notes: {
    'future.en': { title: 'Upcoming article', visibility: 'public', lang: 'en', category: 'tech', date: '2999-01-01' },
  } });
  f.write('dist/en/notes/future/index.html', '<meta http-equiv="refresh" content="0;url=/en/blog/future/">');
  f.write('dist/search.json', JSON.stringify({ title: 'Upcoming article' }));
  const problems = f.problems();
  assert.ok(problems.some((p) => p.includes('en/notes/future/index.html: route belongs to unapproved notes:future.en')));
  assert.ok(problems.some((p) => p.includes('search.json: contains text from notes:future.en')));
});

test('unfinished local YAML does not block the public build but still cannot leak', (t) => {
  const f = fixture(t);
  const body = 'Private body from an unfinished local edit.';
  const raw = `---\ntitle: [unfinished\nvisibility: pending\n---\n${body}`;
  f.write('.drafts/unfinished.en.md', raw);
  assert.deepEqual(f.problems(), []);
  f.write('dist/debug.json', JSON.stringify({ source: raw }));
  f.write('dist/debug.html', `<p>${body}</p>`);
  f.write('dist/en/rss.xml', '<link>/en/blog/unfinished/</link>');
  assert.ok(f.problems().some((p) => p.includes('debug.json: contains text from notes:unfinished.en')));
  assert.ok(f.problems().some((p) => p.includes('debug.html: contains text from notes:unfinished.en')));
  assert.ok(f.problems().some((p) => p.includes('en/rss.xml: contains an unapproved notes route')));
  f.write('src/content/notes/broken.zh.md', raw);
  assert.throws(() => f.problems(), { name: 'YAMLParseError' });
});
