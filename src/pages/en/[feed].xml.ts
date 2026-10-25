import type { APIRoute } from 'astro';
import { notesFeed } from '~/lib/rss';

// A stable subscription URL also works before the first article is published.
export const getStaticPaths = () => [{ params: { feed: 'rss' } }];
export const GET: APIRoute = ({ site }) => notesFeed('en', site!);
