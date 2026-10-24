import type { APIRoute } from 'astro';
import { getNotes } from '~/lib/content';
import { notesFeed } from '~/lib/rss';

// Builds /en/rss.xml only when there are notes to syndicate.
export async function getStaticPaths() {
  return (await getNotes('en')).length ? [{ params: { feed: 'rss' } }] : [];
}

export const GET: APIRoute = ({ site }) => notesFeed('en', site!);
