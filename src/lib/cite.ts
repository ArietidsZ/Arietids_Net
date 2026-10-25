import type { CollectionEntry } from 'astro:content';
import { tr } from '~/i18n';

type Work = CollectionEntry<'work'>;

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  const family = parts.pop() ?? full;
  return { given: parts.join(' '), family };
}

const LICENSES: Record<string, string> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY-NC 4.0': 'https://creativecommons.org/licenses/by-nc/4.0/',
};

/**
 * Highwire Press tags (what Google Scholar and Zotero read from an article page) and a schema.org
 * ScholarlyArticle, both from the same citation the page shows. Undefined for work without one.
 */
export function scholarly(work: Work, url: string) {
  const c = work.data.citation;
  if (!c) return undefined;
  const title = tr(work.data.title, 'en');
  const date = c.published ?? String(c.year);
  const meta: [string, string | undefined][] = [
    ['citation_title', title],
    ...c.authors.map((a): [string, string] => ['citation_author', a]),
    ['citation_publication_date', date.replaceAll('-', '/')],
    ['citation_journal_title', c.venue],
    ['citation_conference_title', c.conference],
    ['citation_volume', c.volume],
    ['citation_firstpage', c.article],
    ['citation_doi', c.doi],
  ];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ScholarlyArticle',
    headline: title,
    author: c.authors.map((name) => ({ '@type': 'Person', name })),
    datePublished: date,
    isPartOf: c.volume
      ? { '@type': 'PublicationVolume', volumeNumber: c.volume, isPartOf: { '@type': 'Periodical', name: c.venue } }
      : { '@type': 'Periodical', name: c.venue },
    ...(c.pages ? { numberOfPages: c.pages } : {}),
    ...(c.doi ? { identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: c.doi }, sameAs: `https://doi.org/${c.doi}` } : {}),
    ...(c.license && LICENSES[c.license] ? { license: LICENSES[c.license] } : {}),
    abstract: tr(work.data.summary, 'en'),
    url,
  };
  return { meta: meta.filter((m): m is [string, string] => !!m[1]), jsonLd };
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
