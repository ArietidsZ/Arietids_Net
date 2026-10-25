/**
 * Site-wide settings that are not personal content.
 * Personal facts live in src/content/*.yaml and are gated by `visibility`.
 */
export const site = {
  /** Shown in the footer; the canonical origin comes from SITE_URL (astro.config.mjs). */
  domain: 'arietids.net',
  /** Date the content files were last reconciled with the source package. */
  contentReviewed: '2026-10-17',
  /** Avatar facts in display order: the first shown one is the portrait, the second its flip side. */
  portrait: { front: 'avatar.gold', back: 'avatar.blue', social: 'avatar.blue' },
  /** Homepage section order. Remove an id to hide a section; components live in src/components/sections. */
  sections: ['about', 'publication', 'work', 'contact'],
} as const;

export type SectionId = (typeof site.sections)[number];
