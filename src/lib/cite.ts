import type { CollectionEntry } from 'astro:content';
import { tr } from '~/i18n';

type Work = CollectionEntry<'work'>;

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  const family = parts.pop() ?? full;
  return { given: parts.join(' '), family };
}

export function bibtex(work: Work): string | undefined {
  const c = work.data.citation;
  if (!c) return undefined;
  const title = tr(work.data.title, 'en');
  const first = splitName(c.authors[0] ?? 'anon');
  const key = `${first.family.toLowerCase()}${c.year}${(title.match(/[A-Za-z]+/)?.[0] ?? 'work').toLowerCase()}`;
  const fields: [string, string | undefined][] = [
    ['author', c.authors.map((a) => { const n = splitName(a); return `${n.family}, ${n.given}`; }).join(' and ')],
    ['title', `{${title}}`],
    ['journal', c.venue],
    ['volume', c.volume],
    ['pages', c.article],
    ['year', String(c.year)],
    ['doi', c.doi],
    ['note', c.conference],
  ];
  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k.padEnd(7)} = {${v}}`)
    .join(',\n');
  return `@article{${key},\n${body}\n}`;
}
