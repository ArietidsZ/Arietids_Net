import rss from '@astrojs/rss';
import { localePath, t, tr, type Locale } from '~/i18n';
import { getFacts, getNotes, noteSlug } from '~/lib/content';
import { blogPath, categoryDescription, categoryLabel, type BlogCategory } from '~/lib/blog';

export async function notesFeed(lang: Locale, site: URL, category?: BlogCategory) {
  const _ = t(lang);
  const notes = (await getNotes(lang)).filter((n) => !category || n.data.category === category);
  const facts = await getFacts();
  const siteName = tr(facts.get('identity.alias')?.text, lang) || tr(facts.get('identity.name')?.text, lang) || _('site.name');
  return rss({
    title: `${siteName} · ${category ? categoryLabel(category, lang) : _('notes.title')}`,
    description: category ? categoryDescription(category, lang) : _('notes.lede'),
    site,
    items: notes.map((n) => ({
      title: n.data.title,
      description: n.data.description,
      pubDate: n.data.date,
      link: localePath(lang, blogPath(noteSlug(n))),
      categories: [categoryLabel(n.data.category, lang), ...n.data.tags],
    })),
    customData: `<language>${lang === 'zh' ? 'zh-cn' : 'en'}</language>`,
  });
}
