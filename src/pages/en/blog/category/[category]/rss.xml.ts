import type { APIRoute } from 'astro';
import { blogCategories, type BlogCategory } from '~/lib/blog';
import { notesFeed } from '~/lib/rss';

export const getStaticPaths = () => blogCategories.map((category) => ({ params: { category } }));
export const GET: APIRoute = ({ site, params }) => notesFeed('en', site!, params.category as BlogCategory);
