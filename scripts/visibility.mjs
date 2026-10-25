#!/usr/bin/env node
/**
 * Content visibility CLI.
 *
 *   npm run review                               list every entry and its visibility
 *   npm run visibility -- list [pending|public|private]
 *   npm run visibility -- public work:auralis facts:identity.name ...
 *   npm run visibility -- private honors:example-award
 *   npm run visibility -- lint                   catch YAML mistakes that silently drop text
 *
 * Keys are `collection:id` (as shown on /review) or a bare id when it is unique.
 * YAML comments and formatting are preserved.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument, isScalar, isMap, visit } from 'yaml';

// fileURLToPath, not URL.pathname: the latter stays percent-encoded, so a checkout under a path
// with spaces or Chinese characters was not found.
const root = fileURLToPath(new URL('../src/content/', import.meta.url));
const YAML_COLLECTIONS = ['facts', 'work', 'honors', 'timeline'];
const LEVELS = ['public', 'pending', 'private'];

function loadYaml(collection) {
  const file = join(root, `${collection}.yaml`);
  const text = readFileSync(file, 'utf8');
  return { file, text, doc: parseDocument(text) };
}

function noteFiles() {
  return readdirSync(join(root, 'notes'))
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => ({ file: join(root, 'notes', f), id: basename(f).replace(/\.mdx?$/, '') }));
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? { raw: m[1], doc: parseDocument(m[1]) } : undefined;
}

/** Every entry as { key, collection, id, visibility, title }. */
function entries() {
  const out = [];
  for (const c of YAML_COLLECTIONS) {
    const { doc } = loadYaml(c);
    for (const item of doc.contents?.items ?? []) {
      const id = String(item.get('id'));
      const title = item.get('title') ?? item.get('text') ?? item.get('when');
      out.push({
        key: `${c}:${id}`,
        collection: c,
        id,
        visibility: item.get('visibility') ?? 'pending',
        title: isMap(title) ? title.get('zh') : String(title ?? item.get('list')?.items?.[0]?.get?.('zh') ?? ''),
      });
    }
  }
  for (const n of noteFiles()) {
    const fm = frontmatter(readFileSync(n.file, 'utf8'));
    out.push({
      key: `notes:${n.id}`,
      collection: 'notes',
      id: n.id,
      visibility: fm?.doc.get('visibility') ?? 'pending',
      title: fm?.doc.get('title') ?? n.id,
    });
  }
  return out;
}

function resolve(key, all) {
  if (key.includes(':') && all.some((e) => e.key === key)) return all.find((e) => e.key === key);
  const matches = all.filter((e) => e.id === key);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`"${key}" is ambiguous: ${matches.map((m) => m.key).join(', ')}`);
  throw new Error(`No entry "${key}". Run \`npm run review\` to see valid keys.`);
}

/** Rewrite only the `visibility:` value in place, so diffs stay one line per entry. */
function splice(text, doc, ids, level) {
  const edits = [];
  for (const item of doc.contents.items) {
    if (!ids.includes(String(item.get('id')))) continue;
    const node = item.get('visibility', true);
    if (node?.range) {
      edits.push({ start: node.range[0], end: node.range[1], text: level });
    } else {
      const id = item.get('id', true);
      const indent = ' '.repeat(id.range[0] - text.lastIndexOf('\n', id.range[0]) - 1 - 4);
      edits.push({ start: id.range[1], end: id.range[1], text: `\n${indent}visibility: ${level}` });
    }
  }
  return edits.sort((a, b) => b.start - a.start).reduce((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), text);
}

function setVisibility(level, keys) {
  const all = entries();
  const targets = keys.map((k) => resolve(k, all));
  for (const [c, list] of Map.groupBy(targets, (t) => t.collection)) {
    if (c === 'notes') {
      for (const t of list) {
        const { file } = noteFiles().find((f) => f.id === t.id);
        const text = readFileSync(file, 'utf8');
        const fm = frontmatter(text);
        const next = /^visibility:.*$/m.test(fm.raw)
          ? fm.raw.replace(/^visibility:.*$/m, `visibility: ${level}`)
          : `${fm.raw}\nvisibility: ${level}`;
        writeFileSync(file, text.replace(fm.raw, next));
      }
      continue;
    }
    const { file, text, doc } = loadYaml(c);
    writeFileSync(file, splice(text, doc, list.map((t) => t.id), level));
  }
  for (const t of targets) console.log(`${t.visibility.padEnd(8)} → ${level.padEnd(8)} ${t.key}`);
}

function list(filter) {
  const all = entries().filter((e) => !filter || e.visibility === filter);
  const w = Math.max(...all.map((e) => e.key.length));
  for (const e of all) console.log(`${e.visibility.padEnd(8)} ${e.key.padEnd(w)}  ${e.title}`);
  const counts = Object.fromEntries(LEVELS.map((l) => [l, entries().filter((e) => e.visibility === l).length]));
  console.log(`\n${all.length} shown · public ${counts.public} · pending ${counts.pending} · private ${counts.private}`);
}

/** YAML pitfalls that pass schema validation but silently lose text. */
function lint() {
  const problems = [];
  for (const c of YAML_COLLECTIONS) {
    const { doc, file } = loadYaml(c);
    for (const e of doc.errors) problems.push(`${file}: ${e.message.split('\n')[0]}`);
    const ids = new Set();
    for (const item of doc.contents?.items ?? []) {
      const id = String(item.get('id'));
      if (ids.has(id)) problems.push(`${file}: duplicate id "${id}"`);
      ids.add(id);
      const v = item.get('visibility');
      if (v !== undefined && !LEVELS.includes(v)) problems.push(`${file}: ${id} has invalid visibility "${v}"`);
    }
    // ` #` after a plain value starts a comment: "see #5762 for details" becomes "see".
    // A comma inside `{ zh: …, en: A, B }` splits the text: `en` becomes "A" and "B" turns into an empty key.
    visit(doc, {
      Pair(_, pair) {
        const v = pair.value;
        if (v === null || (isScalar(v) && v.value === null)) {
          problems.push(`${file}: "${pair.key}" has no value; a comma inside { … } probably split a sentence, so quote it`);
        }
      },
      Scalar(_, node) {
        if (isScalar(node) && node.type === 'PLAIN' && node.comment && typeof node.value === 'string') {
          problems.push(`${file}: text after "${node.value.slice(-24)}" was read as a comment (#${node.comment}); quote the value`);
        }
      },
    });
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('content lint: ok');
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (!cmd || cmd === 'list') list(args[0]);
  else if (cmd === 'lint') lint();
  else if (LEVELS.includes(cmd)) {
    if (!args.length) throw new Error(`Usage: npm run visibility -- ${cmd} <collection:id> ...`);
    setVisibility(cmd, args);
  } else throw new Error(`Unknown command "${cmd}". Use list | lint | public | pending | private.`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
