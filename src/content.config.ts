import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Every entry carries a `visibility`:
 *   public  — rendered in production builds
 *   pending — rendered only in preview mode (dev / CONTENT_MODE=preview), outlined as "awaiting confirmation"
 *   private — never rendered on the site; only listed on /review so nothing is forgotten
 * New entries default to `pending`, so nothing goes public by accident.
 */
const visibility = z.enum(['public', 'pending', 'private']).default('pending');

/** A string shared by all locales, or a per-locale map. `en` falls back to `zh` when missing. */
const localized = z.union([z.string(), z.object({ zh: z.string(), en: z.string().optional() })]);

/** Traceability back to the source package (个人资料.json / 资料来源.json). Shown on /review only. */
const provenance = {
  ref: z.union([z.string(), z.array(z.string())]).optional(),
  evidence: z.string().optional(),
  sources: z.array(z.string()).default([]),
  review: z.string().optional(),
};

const link = z.object({
  label: localized,
  url: z.url(),
  kind: z.enum(['repo', 'doi', 'paper', 'demo', 'site', 'other']).default('other'),
});

const themeId = z.enum(['embodied', 'learning', 'agents', 'local', 'compute']);

const facts = defineCollection({
  loader: file('src/content/facts.yaml'),
  schema: z.object({
    visibility,
    ...provenance,
    text: localized.optional(),
    /** Compact form for tight spots such as the hero chips. */
    short: localized.optional(),
    list: z.array(localized).optional(),
    url: z.string().optional(),
    /** Image under src/assets/, emitted only when this fact is shown (integrations/approved-assets.mjs). */
    asset: z.string().optional(),
  }),
});

const themes = defineCollection({
  loader: file('src/content/themes.yaml'),
  schema: z.object({
    label: localized,
    short: localized,
    blurb: localized,
    star: z.string(),
    /** Position on the atlas canvas, 0–1000 × 0–600. */
    x: z.number(),
    y: z.number(),
    magnitude: z.number().default(1),
    order: z.number(),
  }),
});

const work = defineCollection({
  loader: file('src/content/work.yaml'),
  schema: z.object({
    visibility,
    ...provenance,
    kind: z.enum(['publication', 'research', 'project', 'writing']),
    title: localized,
    subtitle: localized.optional(),
    summary: localized,
    description: localized.optional(),
    role: localized.optional(),
    status: z.string(),
    statusNote: localized.optional(),
    year: z.number().optional(),
    period: localized.optional(),
    themes: z.array(themeId).min(1),
    stack: z.array(z.string()).default([]),
    highlights: z.array(localized).default([]),
    metrics: z
      .array(z.object({ label: localized, value: z.string(), note: localized.optional() }))
      .default([]),
    caveats: z.array(localized).default([]),
    links: z.array(link).default([]),
    citation: z
      .object({
        authors: z.array(z.string()),
        venue: z.string(),
        volume: z.string().optional(),
        article: z.string().optional(),
        year: z.number(),
        published: z.string().optional(),
        conference: z.string().optional(),
        doi: z.string().optional(),
        license: z.string().optional(),
        pages: z.number().optional(),
      })
      .optional(),
    featured: z.boolean().default(false),
    order: z.number().default(100),
  }),
});

const honors = defineCollection({
  loader: file('src/content/honors.yaml'),
  schema: z.object({
    visibility,
    ...provenance,
    title: localized,
    issuer: localized.optional(),
    level: z.enum(['national', 'provincial', 'city', 'university', 'school', 'other']),
    date: z.string(),
    group: z.string().optional(),
    order: z.number().default(100),
  }),
});

const timeline = defineCollection({
  loader: file('src/content/timeline.yaml'),
  schema: z.object({
    visibility,
    ...provenance,
    when: localized,
    title: localized,
    body: localized.optional(),
    work: z.array(z.string()).default([]),
    future: z.boolean().default(false),
    order: z.number(),
  }),
});

const notes = defineCollection({
  // Keep the language suffix in the id (`about-this-site.zh`); the default slugger would drop the dot.
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './src/content/notes',
    generateId: ({ entry }) => entry.replace(/\.mdx?$/, ''),
  }),
  schema: z.object({
    visibility,
    ...provenance,
    title: z.string(),
    description: z.string(),
    lang: z.enum(['zh', 'en']),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { facts, themes, work, honors, timeline, notes };
