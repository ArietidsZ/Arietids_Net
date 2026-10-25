import type { Locale } from '~/i18n';

export const blogCategories = ['tech', 'study', 'research'] as const;
export type BlogCategory = (typeof blogCategories)[number];

const labels: Record<Locale, Record<BlogCategory, string>> = {
  zh: { tech: '技术', study: '学习', research: '研究' },
  en: { tech: 'Technology', study: 'Learning', research: 'Research' },
};
const descriptions: Record<Locale, Record<BlogCategory, string>> = {
  zh: {
    tech: '开发实践、工具与技术记录。',
    study: '课程笔记与学习记录。',
    research: '论文阅读与研究记录。',
  },
  en: {
    tech: 'Development, tools, and technical notes.',
    study: 'Course notes and learning records.',
    research: 'Paper reading and research notes.',
  },
};
export const categoryLabel = (category: BlogCategory, lang: Locale) => labels[lang][category];
export const categoryDescription = (category: BlogCategory, lang: Locale) => descriptions[lang][category];
export const blogPath = (slug: string) => `/blog/${slug}/`;
export const categoryPath = (category: BlogCategory) => `/blog/category/${category}/`;

/** File names, routes, and the authoring CLI use the same flat, unambiguous identity. */
export function postIdentity(filename: string): { slug: string; lang: Locale; id: string } {
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(zh|en)\.mdx?$/.exec(filename);
  if (!match) throw new Error(`Invalid article filename: ${filename}. Use slug.zh.md or slug.en.mdx.`);
  if (['category', 'index', 'rss'].includes(match[1]!)) throw new Error(`Reserved article slug: ${match[1]}.`);
  return { slug: match[1]!, lang: match[2] as Locale, id: `${match[1]}.${match[2]}` };
}

export function isISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Publication dates are calendar days in the owner's timezone, not the build server's. */
export function shanghaiDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function publicationDateReached(date: Date | string, now = new Date()): boolean {
  if (date instanceof Date && !Number.isFinite(date.getTime())) return false;
  const value = date instanceof Date ? date.toISOString().slice(0, 10) : date;
  return isISODate(value) && value <= shanghaiDate(now);
}
