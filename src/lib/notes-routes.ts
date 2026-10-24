import type { Locale } from '~/i18n';
import { getNotes, noteSlug } from '~/lib/content';

/** Static paths for one locale's notes, with the locales each note exists in. */
export async function notePaths(lang: Locale) {
  const all = await getNotes();
  return all
    .filter((n) => n.data.lang === lang)
    .map((note) => {
      const slug = noteSlug(note);
      const alternates = all.filter((n) => noteSlug(n) === slug).map((n) => n.data.lang);
      return { params: { slug }, props: { note, alternates } };
    });
}
