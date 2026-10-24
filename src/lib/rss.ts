import rss from '@astrojs/rss';
import { localePath, t, tr, type Locale } from '~/i18n';
import { getFacts, getNotes, noteSlug } from '~/lib/content';

export async function notesFeed(lang: Locale, site: URL) {
  const _ = t(lang);
  const notes = await getNotes(lang);
  const facts = await getFacts();
  const siteName = tr(facts.get('identity.alias')?.text, lang) || tr(facts.get('identity.name')?.text, lang) || _('site.name');
  return rss({
    title: `${siteName} · ${_('notes.title')}`,
    description: _('notes.lede'),
    site,
    items: notes.map((n) => ({
      title: n.data.title,
      description: n.data.description,
      pubDate: n.data.date,
      link: localePath(lang, `/notes/${noteSlug(n)}/`),
    })),
    customData: `<language>${lang === 'zh' ? 'zh-cn' : 'en'}</language>`,
  });
}
