import type { APIRoute } from 'astro';
import { isPreview } from '~/lib/content';

/** Preview builds may end up on a reachable URL; keep them out of search engines. */
export const GET: APIRoute = ({ site }) => {
  const body = isPreview
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site)}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
