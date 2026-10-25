// @ts-check
import { defineConfig, envField } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { unified } from '@astrojs/markdown-remark';
import { approvedAssets } from './integrations/approved-assets.mjs';
import { pruneOrphans } from './integrations/prune-orphans.mjs';
import { focusableTables } from './integrations/focusable-tables.mjs';

const site = process.env.SITE_URL ?? 'https://arietids.net';

export default defineConfig({
  site,
  output: 'static',
  outDir: process.env.CONTENT_MODE === 'preview' ? './out' : './dist',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  i18n: {
    locales: ['zh', 'en'],
    defaultLocale: 'zh',
    routing: { prefixDefaultLocale: false },
  },
  env: {
    schema: {
      // See .env.example. Unset: `preview` under `astro dev`, `public` under `astro build`.
      CONTENT_MODE: envField.enum({
        context: 'server',
        access: 'public',
        values: ['public', 'preview'],
        optional: true,
      }),
    },
  },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !page.includes('/review/') && !page.includes('/og/') && !/\/notes(?:\/|$)/.test(new URL(page).pathname),
      i18n: { defaultLocale: 'zh', locales: { zh: 'zh-CN', en: 'en' } },
    }),
    pruneOrphans(),
  ],
  vite: { plugins: [approvedAssets()] },
  devToolbar: { enabled: false },
  markdown: {
    processor: unified({ remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex, focusableTables] }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    },
  },
});
