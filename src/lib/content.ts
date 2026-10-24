import { getCollection, type CollectionEntry, type CollectionKey } from 'astro:content';
import { CONTENT_MODE } from 'astro:env/server';
import type { Locale } from '~/i18n';

export type Visibility = 'public' | 'pending' | 'private';

/** `public` renders approved entries only; `preview` also renders pending ones, marked for review. */
export const contentMode: 'public' | 'preview' = CONTENT_MODE ?? (import.meta.env.DEV ? 'preview' : 'public');
export const isPreview = contentMode === 'preview';

export function isShown(visibility: Visibility): boolean {
  return visibility === 'public' || (isPreview && visibility === 'pending');
}

type Entry<C extends CollectionKey> = CollectionEntry<C>;

async function shown<C extends 'facts' | 'work' | 'honors' | 'timeline' | 'notes'>(
  collection: C,
): Promise<Entry<C>[]> {
  const all = (await getCollection(collection)) as Entry<C>[];
  return all.filter((e) => isShown((e.data as { visibility: Visibility }).visibility));
}

export type Fact = Entry<'facts'>['data'] & { id: string };

/** Lookup for single facts; returns undefined for anything not shown in the current mode. */
export async function getFacts() {
  const map = new Map<string, Fact>();
  for (const e of await shown('facts')) map.set(e.id, { ...e.data, id: e.id });
  return {
    get: (id: string) => map.get(id),
    has: (id: string) => map.has(id),
  };
}

export type Facts = Awaited<ReturnType<typeof getFacts>>;

export async function getThemes() {
  return (await getCollection('themes')).sort((a, b) => a.data.order - b.data.order);
}

export async function getWork() {
  return (await shown('work')).sort((a, b) => a.data.order - b.data.order);
}

export async function getHonors() {
  return (await shown('honors')).sort((a, b) => a.data.order - b.data.order);
}

export async function getTimeline() {
  return (await shown('timeline')).sort((a, b) => a.data.order - b.data.order);
}

export async function getNotes(lang?: Locale) {
  return (await shown('notes'))
    .filter((n) => !lang || n.data.lang === lang)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Slug shared by the zh/en versions of a note: `about-this-site.zh` → `about-this-site`. */
export function noteSlug(note: Entry<'notes'>): string {
  return note.id.replace(/\.(zh|en)$/, '');
}

/** True once the owner has approved their name; until then production renders a "coming soon" page. */
export async function isSiteReady(): Promise<boolean> {
  return (await getFacts()).has('identity.name');
}

export type ReviewRow = {
  collection: string;
  id: string;
  visibility: Visibility;
  title: string;
  ref?: string | string[] | undefined;
  evidence?: string | undefined;
  sources: string[];
  review?: string | undefined;
};

/** Every entry in every gated collection, for the /review page. */
export async function getReviewRows(): Promise<ReviewRow[]> {
  const label = (v: unknown): string =>
    typeof v === 'string' ? v : v && typeof v === 'object' && 'zh' in v ? String((v as { zh: string }).zh) : '';
  const rows: ReviewRow[] = [];
  const push = (collection: string, id: string, d: Record<string, any>, title: string) =>
    rows.push({
      collection,
      id,
      visibility: d.visibility,
      title,
      ref: d.ref,
      evidence: d.evidence,
      sources: d.sources ?? [],
      review: d.review,
    });
  for (const e of await getCollection('facts'))
    push('facts', e.id, e.data, label(e.data.text) || (e.data.list ?? []).map(label).join(' / '));
  for (const e of await getCollection('work')) push('work', e.id, e.data, label(e.data.title));
  for (const e of await getCollection('honors')) push('honors', e.id, e.data, label(e.data.title));
  for (const e of await getCollection('timeline')) push('timeline', e.id, e.data, `${label(e.data.when)} · ${label(e.data.title)}`);
  for (const e of await getCollection('notes')) push('notes', e.id, e.data, `${e.data.title} (${e.data.lang})`);
  return rows;
}

export async function pendingCount(): Promise<number> {
  return (await getReviewRows()).filter((r) => r.visibility === 'pending').length;
}
