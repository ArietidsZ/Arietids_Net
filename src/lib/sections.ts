import type { SectionId } from '~/config/site';
import { getFacts, getHonors, getTimeline, getWork } from '~/lib/content';

/** Which homepage sections have anything to show. Shared by the page and the navigation. */
export async function availableSections(): Promise<Record<SectionId, boolean>> {
  const [facts, work, timeline, honors] = await Promise.all([
    getFacts(),
    getWork(),
    getTimeline(),
    getHonors(),
  ]);
  return {
    about: facts.has('about.bio') || facts.has('academic.grades') || honors.length > 0 || timeline.length > 0,
    publication: work.some((w) => w.data.kind === 'publication' && w.data.featured),
    work: work.length > 0,
    contact: facts.has('contact.email') || facts.has('identity.github'),
  };
}
