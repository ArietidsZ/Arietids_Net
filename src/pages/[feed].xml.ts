import type { APIRoute } from 'astro';
import { getNotes } from '~/lib/content';
import { notesFeed } from '~/lib/rss';

// Builds /rss.xml only when there are notes to syndicate.
export async function getStaticPaths() {
  return (await getNotes('zh')).length ? [{ params: { feed: 'rss' } }] : [];
}

export const GET: APIRoute = ({ site }) => notesFeed('zh', site!);
