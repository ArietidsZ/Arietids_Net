#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { blogCategories, isISODate, postIdentity, shanghaiDate } from '../src/lib/blog.ts';

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Parse raw YAML before Astro can coerce impossible calendar dates into valid Date objects. */
export function readPost(text, filename, { publishing = false } = {}) {
  const identity = postIdentity(filename);
  const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!front) throw new Error(`${filename}: YAML frontmatter is required.`);
  const document = parseDocument(front[1]);
  if (document.errors.length) throw new Error(`${filename}: ${document.errors[0].message}`);
  const data = document.toJS();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${filename}: frontmatter must be a map.`);
  if (data.lang !== identity.lang) throw new Error(`${filename}: lang must match the filename.`);
  if (!blogCategories.includes(data.category)) throw new Error(`${filename}: category must be tech, study, or research.`);
  if (!isISODate(data.date)) throw new Error(`${filename}: date must be a valid YYYY-MM-DD calendar date.`);
  if (data.updated !== undefined && (!isISODate(data.updated) || data.updated < data.date))
    throw new Error(`${filename}: updated must be a valid date on or after date.`);
  if (!['public', 'pending', 'private'].includes(data.visibility ?? 'pending'))
    throw new Error(`${filename}: invalid visibility.`);
  if (typeof data.title !== 'string' || typeof data.description !== 'string')
    throw new Error(`${filename}: title and description must be strings.`);
  if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some(t => typeof t !== 'string' || !t.trim())))
    throw new Error(`${filename}: tags must contain non-empty strings.`);
  const body = text.slice(front[0].length);
  if (publishing) {
    if (!data.title.trim() || !data.description.trim()) throw new Error(`${filename}: fill title and description before publishing.`);
    if (!body.replace(/<!--[\s\S]*?-->/g, '').trim()) throw new Error(`${filename}: write the article body before publishing.`);
  }
  return { ...identity, data, body, document };
}

/** All source files are flat; symlinks and nested Markdown are rejected rather than silently skipped. */
export function postFiles(directory, { allowMediaDirectories = false } = {}) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.gitkeep' || entry.name === '.DS_Store') continue;
    if (entry.isSymbolicLink()) throw new Error(`${directory}/${entry.name}: article symlinks are not supported.`);
    if (entry.isDirectory()) {
      if (!allowMediaDirectories || readdirSync(join(directory, entry.name), { recursive: true }).some(name => /\.mdx?$/.test(String(name))))
        throw new Error(`${directory}/${entry.name}: keep article files flat; use category in frontmatter.`);
      continue;
    }
    if (!/\.mdx?$/.test(entry.name)) continue;
    postIdentity(entry.name);
    files.push(join(directory, entry.name));
  }
  const identities = new Set();
  for (const file of files) {
    const { id } = postIdentity(basename(file));
    if (identities.has(id)) throw new Error(`Duplicate article ${id}: use either .md or .mdx, not both.`);
    identities.add(id);
  }
  return files;
}

export function checkBlogSources(root = DEFAULT_ROOT) {
  for (const file of postFiles(join(root, 'src/content/notes'))) {
    const post = readPost(readFileSync(file, 'utf8'), basename(file), { publishing: true });
    if (post.data.visibility !== 'public')
      throw new Error(`${basename(file)}: src/content/notes is public GitHub source. Keep unpublished articles in .drafts/.`);
  }
}

function directories(root) {
  const draft = join(root, '.drafts');
  const published = join(root, 'src/content/notes');
  for (const dir of [draft, published]) {
    if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error(`${dir}: directory must not be a symlink.`);
  }
  return { draft, published };
}

export function newPost({ slug, lang = 'zh', category, date = shanghaiDate(), root = DEFAULT_ROOT }) {
  const filename = `${slug}.${lang}.md`;
  postIdentity(filename);
  if (!blogCategories.includes(category)) throw new Error('Choose --category tech, study, or research.');
  if (!isISODate(date)) throw new Error('Date must be a valid YYYY-MM-DD calendar date.');
  const { draft, published } = directories(root);
  for (const dir of [draft, published]) for (const extension of ['md', 'mdx']) {
    if (existsSync(join(dir, `${slug}.${lang}.${extension}`))) throw new Error(`Article ${slug}.${lang} already exists.`);
  }
  mkdirSync(draft, { recursive: true });
  const file = join(draft, filename);
  writeFileSync(file, `---\nvisibility: pending\ncategory: ${category}\nlang: ${lang}\ntitle: ""\ndescription: ""\ndate: "${date}"\ntags: []\n---\n\n<!-- Write the article here. This draft stays outside the public Git repository. -->\n`, { flag: 'wx' });
  return file;
}

export function publishPost({ slug, lang = 'zh', root = DEFAULT_ROOT }) {
  postIdentity(`${slug}.${lang}.md`);
  const { draft, published } = directories(root);
  const candidates = ['md', 'mdx'].map(extension => join(draft, `${slug}.${lang}.${extension}`)).filter(existsSync);
  if (candidates.length !== 1) throw new Error(`Expected one draft for ${slug}.${lang}; found ${candidates.length}.`);
  const source = candidates[0];
  if (lstatSync(source).isSymbolicLink()) throw new Error('Draft must not be a symlink.');
  for (const extension of ['md', 'mdx']) if (existsSync(join(published, `${slug}.${lang}.${extension}`)))
    throw new Error(`Published article ${slug}.${lang} already exists; edit its source directly.`);
  const post = readPost(readFileSync(source, 'utf8'), basename(source), { publishing: true });
  post.document.set('visibility', 'public');
  // Review/provenance fields are local editorial material, never part of the public source.
  for (const key of ['review', 'ref', 'evidence', 'sources']) post.document.delete(key);
  mkdirSync(published, { recursive: true });
  const target = join(published, basename(source));
  writeFileSync(target, `---\n${post.document.toString()}---\n${post.body}`, { flag: 'wx' });
  unlinkSync(source);
  return target;
}

export function main(argv, root = DEFAULT_ROOT) {
  const [command, slug, ...args] = argv;
  if (command === 'check') { checkBlogSources(root); console.log('blog source check: ok'); return; }
  if (!['new', 'publish'].includes(command) || !slug)
    throw new Error('Usage: npm run post -- new <slug> --category <tech|study|research> [--lang zh|en] | publish <slug> [--lang zh|en]');
  const options = { slug, root };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]; const value = args[i + 1];
    if (!['--lang', '--category', '--date'].includes(key) || !value || value.startsWith('--')) throw new Error(`Invalid option ${key}.`);
    if (command === 'publish' && key !== '--lang') throw new Error('Publishing accepts --lang only; edit dates and category in the draft.');
    options[key.slice(2)] = value;
  }
  const file = command === 'new' ? newPost(options) : publishPost(options);
  console.log(command === 'new' ? `Draft: ${file}\nFill title, description, and body, then run npm run dev to preview.` : `Public source: ${file}\nReview the diff, run npm run check && npm run build, then commit. Website deployment is separate.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
