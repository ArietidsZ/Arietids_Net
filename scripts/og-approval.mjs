import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parse } from 'yaml';

const sourceIds = new Set(['identity.name', 'identity.alias', 'hero.tagline', 'avatar.blue']);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Resolve existing parent symlinks as well as .. segments, including for a new file.
function canonicalPath(path, depth = 0) {
  if (depth > 40) throw new Error(`Too many output path symlinks: ${path}`);
  let parent = resolve(path);
  const suffix = [];
  while (true) {
    let stat;
    try { stat = lstatSync(parent); } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
    if (stat) {
      const base = stat.isSymbolicLink()
        ? canonicalPath(resolve(dirname(parent), readlinkSync(parent)), depth + 1)
        : realpathSync(parent);
      return join(base, ...suffix);
    }
    suffix.unshift(basename(parent));
    const next = dirname(parent);
    if (next === parent) throw new Error(`Cannot resolve output path: ${path}`);
    parent = next;
  }
}

export function resolveOgOutput(root, output, preview) {
  if (typeof output !== 'string' || !output || output.startsWith('--')) {
    throw new Error('--out needs a file path.');
  }
  const path = canonicalPath(output);
  if (preview) {
    for (const folder of ['public', 'dist', 'out']) {
      const boundary = canonicalPath(join(root, folder));
      const rel = relative(boundary, path);
      if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))) {
        throw new Error(`Preview OG output must be outside public/, dist/ and out/: ${output}`);
      }
    }
  }
  return path;
}

export function ogSourceFingerprint(root, fact) {
  if (!sourceIds.has(fact.id)) throw new Error(`Unknown OG source: ${fact.id}`);
  return sha256(JSON.stringify({
    id: fact.id,
    text: fact.text ?? null,
    ...(fact.id === 'avatar.blue' ? {
      artwork: sha256(readFileSync(join(root, 'src/assets/avatars/avatar-blue.png'))),
    } : {}),
  }));
}

export function createPublicOgManifest(root, imagePath, facts) {
  if (!facts.some((fact) => fact.id === 'identity.name') || facts.some((fact) => fact.visibility !== 'public')) {
    throw new Error('A production OG card requires public source facts, including identity.name.');
  }
  return {
    version: 1,
    mode: 'public',
    image: 'public/og.png',
    imageSha256: sha256(readFileSync(imagePath)),
    factIds: facts.map((fact) => fact.id),
    sources: facts.map((fact) => ({ id: fact.id, sha256: ogSourceFingerprint(root, fact) })),
  };
}

// No image is valid as an absent optional asset. Callers decide whether to emit a tag.
export function validatePublicOg(root, imagePath) {
  if (!existsSync(imagePath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'og.sources.json'), 'utf8'));
    if (manifest.version !== 1 || manifest.mode !== 'public' || manifest.image !== 'public/og.png') {
      return ['OG source manifest has an unsupported format or is not for a public card.'];
    }
    const ids = manifest.factIds;
    if (!Array.isArray(ids) || !ids.includes('identity.name') || new Set(ids).size !== ids.length ||
        ids.some((id) => !sourceIds.has(id)) || !Array.isArray(manifest.sources) ||
        manifest.sources.length !== ids.length || manifest.sources.some((source, i) => source.id !== ids[i])) {
      return ['OG source manifest has an invalid source list.'];
    }
    const problems = [];
    if (manifest.imageSha256 !== sha256(readFileSync(imagePath))) problems.push('OG image differs from its source manifest.');
    const facts = parse(readFileSync(join(root, 'src/content/facts.yaml'), 'utf8'));
    for (const source of manifest.sources) {
      const fact = facts.find((entry) => entry.id === source.id);
      if (!fact || fact.visibility !== 'public') problems.push(`OG source ${source.id} is not public.`);
      else if (ogSourceFingerprint(root, fact) !== source.sha256) problems.push(`OG source ${source.id} changed after the image was generated.`);
    }
    return problems;
  } catch (error) {
    return [`OG source manifest could not be verified: ${error instanceof Error ? error.message : String(error)}`];
  }
}
