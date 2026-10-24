/**
 * The research atlas as a real star chart of Aries.
 *
 * Stars come from a small catalogue (J2000 positions, visual magnitudes) and are drawn with a conic
 * projection, so parallels curve toward the pole as on a printed atlas. A theme is attached to a
 * star through the `star` field in themes.yaml (matched by its Bayer or Flamsteed designation).
 * Stars without a visible theme are drawn faint and carry only their astronomical name, so a theme
 * that has no public work never appears on the page.
 *
 * Works sit on a thin orbit around their theme's star. Their angles are chosen deterministically to
 * keep clear of other stars, other works and the theme's label, so new content needs no coordinates.
 */
import type { CollectionEntry } from 'astro:content';
import { localePath, t, tr, type Locale } from '~/i18n';
import type { UiKey } from '~/i18n/ui';

type CatalogStar = { id: string; name?: string; bayer: string; ra: number; dec: number; mag: number };

/** RA and Dec in degrees. The first five form the stick figure. */
export const CATALOG: CatalogStar[] = [
  { id: 'alpha', name: 'Hamal', bayer: 'α Ari', ra: 31.793, dec: 23.463, mag: 2.0 },
  { id: 'beta', name: 'Sheratan', bayer: 'β Ari', ra: 28.66, dec: 20.808, mag: 2.64 },
  { id: 'gamma', name: 'Mesarthim', bayer: 'γ Ari', ra: 28.383, dec: 19.294, mag: 3.88 },
  { id: '41', name: 'Bharani', bayer: '41 Ari', ra: 42.496, dec: 27.261, mag: 3.61 },
  { id: 'delta', name: 'Botein', bayer: 'δ Ari', ra: 47.907, dec: 19.727, mag: 4.35 },
  { id: 'epsilon', bayer: 'ε Ari', ra: 44.803, dec: 21.34, mag: 4.63 },
  { id: 'zeta', bayer: 'ζ Ari', ra: 48.765, dec: 21.044, mag: 4.89 },
  { id: '39', bayer: '39 Ari', ra: 41.977, dec: 29.247, mag: 4.51 },
  { id: '35', bayer: '35 Ari', ra: 40.863, dec: 27.707, mag: 4.66 },
  { id: 'lambda', bayer: 'λ Ari', ra: 29.482, dec: 23.596, mag: 4.79 },
  { id: 'kappa', bayer: 'κ Ari', ra: 31.641, dec: 22.648, mag: 5.03 },
  { id: 'eta', bayer: 'η Ari', ra: 33.2, dec: 21.211, mag: 5.23 },
  { id: 'theta', bayer: 'θ Ari', ra: 34.531, dec: 19.901, mag: 5.6 },
  { id: 'nu', bayer: 'ν Ari', ra: 39.704, dec: 21.961, mag: 5.43 },
  { id: 'mu', bayer: 'μ Ari', ra: 40.591, dec: 20.012, mag: 5.74 },
  { id: '33', bayer: '33 Ari', ra: 40.171, dec: 27.061, mag: 5.3 },
  { id: 'sigma', bayer: 'σ Ari', ra: 42.873, dec: 15.082, mag: 5.49 },
  { id: 'rho3', bayer: 'ρ³ Ari', ra: 44.109, dec: 18.023, mag: 5.63 },
  { id: 'tau', bayer: 'τ Ari', ra: 50.288, dec: 21.147, mag: 5.28 },
  { id: 'iota', bayer: 'ι Ari', ra: 28.389, dec: 17.818, mag: 5.1 },
];

/** The stick figure: Mesarthim, Sheratan and Hamal form the head; 41 Ari and Botein the back. */
export const FIGURE: [string, string][] = [
  ['gamma', 'beta'],
  ['beta', 'alpha'],
  ['alpha', '41'],
  ['41', 'delta'],
];

/** Radiant of the Daytime Arietids (IMO): α 44°, δ +24°, peak 7 June. */
export const RADIANT = { ra: 44, dec: 24 };

/* ---------- projection ---------- */

// Equidistant conic with one standard parallel through the middle of the figure: distances along
// meridians and along that parallel are true, and RA increases to the left as seen on the sky.
const RA0 = 38.5;
const DEC0 = 23.2;
const K = 46; // chart units per degree before normalisation
const RAD = Math.PI / 180;
const N = Math.sin(DEC0 * RAD);
const G = 1 / Math.tan(DEC0 * RAD) / RAD + DEC0; // apex distance in degrees
const R0 = K * (G - DEC0);

function project(ra: number, dec: number) {
  const r = K * (G - dec);
  const th = N * (RA0 - ra) * RAD;
  return { x: r * Math.sin(th), y: r * Math.cos(th) - R0 };
}

/* ---------- layout ---------- */

export const CHART_W = 1000;

export type ChartStar = {
  id: string;
  x: number;
  y: number;
  mag: number;
  /** Bayer/Flamsteed designation, e.g. "α Ari". */
  bayer: string;
  name?: string;
  inFigure: boolean;
  theme?: ChartTheme;
};
export type ChartTheme = {
  id: string;
  label: string;
  short: string;
  blurb: string;
  /** Where the label sits relative to the star. */
  side: 'right' | 'left' | 'below' | 'above';
  /** Where the short label sits on phones, where labels are large relative to the chart. */
  sideShort: 'right' | 'left' | 'below' | 'above';
  orbit: number;
};
export type ChartWork = {
  id: string;
  theme: string;
  secondary: string[];
  x: number;
  y: number;
  /** Angle on the orbit, radians, screen coordinates (0 = right, π/2 = down). */
  angle: number;
  label: string;
  meta: string;
  summary: string;
  href: string;
  visibility: string;
};
export type Chart = {
  w: number;
  h: number;
  stars: ChartStar[];
  figure: { x1: number; y1: number; x2: number; y2: number; lit: boolean }[];
  works: ChartWork[];
  radiant: { x: number; y: number };
  graticule: { d: string; label?: string; lx?: number; ly?: number; kind: 'ra' | 'dec' }[];
};

type WorkInput = {
  id: string;
  themes: string[];
  label: string;
  meta: string;
  summary: string;
  href: string;
  visibility: string;
};

/** Match a theme's `star` field ("Hamal · α Ari") to a catalogue star. */
function catalogFor(starField: string) {
  const s = starField.toLowerCase();
  return CATALOG.find((c) => s.includes(c.bayer.toLowerCase()) || (c.name && s.includes(c.name.toLowerCase())));
}

export function layoutChart(themes: CollectionEntry<'themes'>[], items: WorkInput[], lang: Locale): Chart {
  // Project everything, then fit the figure (plus margins for orbits and labels) to CHART_W.
  const raw = CATALOG.map((c) => ({ c, ...project(c.ra, c.dec) }));
  const fig = raw.filter((r) => FIGURE.some(([a, b]) => a === r.c.id || b === r.c.id));
  const rad = project(RADIANT.ra, RADIANT.dec);
  const minX = Math.min(...fig.map((p) => p.x), rad.x);
  const maxX = Math.max(...fig.map((p) => p.x), rad.x);
  const minY = Math.min(...fig.map((p) => p.y), rad.y);
  const maxY = Math.max(...fig.map((p) => p.y), rad.y);
  const pad = { l: 120, r: 150, t: 95, b: 120 };
  const scale = (CHART_W - pad.l - pad.r) / (maxX - minX);
  const h = Math.round((maxY - minY) * scale + pad.t + pad.b);
  const fit = (p: { x: number; y: number }) => ({ x: (p.x - minX) * scale + pad.l, y: (p.y - minY) * scale + pad.t });

  const themeByStar = new Map<string, CollectionEntry<'themes'>>();
  for (const t of themes) {
    const c = catalogFor(t.data.star ?? '');
    if (c) themeByStar.set(c.id, t);
  }

  const stars: ChartStar[] = raw.map(({ c, x, y }) => {
    const p = fit({ x, y });
    const t = themeByStar.get(c.id);
    return {
      id: c.id,
      ...p,
      mag: c.mag,
      bayer: c.bayer,
      name: c.name,
      inFigure: FIGURE.some(([a, b]) => a === c.id || b === c.id),
      theme: t && {
        id: t.id,
        label: tr(t.data.label, lang),
        short: tr(t.data.short, lang),
        blurb: tr(t.data.blurb, lang),
        side: 'below',
        sideShort: 'below',
        orbit: 70,
      },
    };
  });
  const radiant = fit(rad);
  const byId = new Map(stars.map((s) => [s.id, s]));
  const figure = FIGURE.map(([a, b]) => {
    const s1 = byId.get(a)!;
    const s2 = byId.get(b)!;
    return { x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y, lit: !!(s1.theme && s2.theme) };
  });

  // Obstacles every placement keeps clear of.
  const fixed = [...stars.filter((s) => s.mag < 5.3).map((s) => ({ x: s.x, y: s.y })), radiant];
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  type Rect = { x0: number; y0: number; x1: number; y1: number };
  const toRect = (r: Rect, p: { x: number; y: number }) =>
    Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1));
  // Points along the figure's lines, so labels do not sit on them.
  const linePts = figure.flatMap((f) => {
    const n = Math.ceil(Math.hypot(f.x2 - f.x1, f.y2 - f.y1) / 6);
    return Array.from({ length: n + 1 }, (_, i) => ({ x: f.x1 + ((f.x2 - f.x1) * i) / n, y: f.y1 + ((f.y2 - f.y1) * i) / n }));
  });

  // Label box, estimated from the text at the chart's usual size (two lines: name, designation).
  // `k` scales it for a narrower chart: labels keep their rem size while the chart shrinks.
  const labelSize = (s: ChartStar) => {
    const t = s.theme!;
    const han = [...t.label].filter((c) => /\p{Script=Han}/u.test(c)).length;
    const designation = s.bayer + (s.name ? ` · ${s.name}` : '');
    const width = Math.max(han * 15 + (t.label.length - han) * 8, designation.length * 6.6 + 8);
    return { w: width, h: 36 };
  };
  const boxFor = (s: ChartStar, side: ChartTheme['side'], k = 1): Rect => {
    const { w: bw0, h: bh0 } = labelSize(s);
    const bw = bw0 * k;
    const bh = bh0 * k;
    const g = 17 * k;
    if (side === 'below') return { x0: s.x - bw / 2, y0: s.y + g, x1: s.x + bw / 2, y1: s.y + g + bh };
    if (side === 'above') return { x0: s.x - bw / 2, y0: s.y - g - bh, x1: s.x + bw / 2, y1: s.y - g };
    if (side === 'right') return { x0: s.x + g, y0: s.y - bh / 2, x1: s.x + g + bw, y1: s.y + bh / 2 };
    return { x0: s.x - g - bw, y0: s.y - bh / 2, x1: s.x - g, y1: s.y + bh / 2 };
  };

  // Label side: the one whose box is furthest from other stars and crosses no figure line.
  const sides = ['below', 'right', 'left', 'above'] as const;
  const labelBoxes: Rect[] = [];
  for (const s of stars) {
    if (!s.theme) continue;
    let best: ChartTheme['side'] = 'below';
    let bestScore = -Infinity;
    for (const side of sides) {
      const r = boxFor(s, side);
      const others = fixed.filter((o) => dist(o, s) > 1);
      let score = Math.min(48, ...others.map((o) => toRect(r, o)));
      score -= 30 * linePts.filter((p) => toRect(r, p) < 3).length;
      score -= 60 * labelBoxes.filter((o) => !(o.x1 < r.x0 || r.x1 < o.x0 || o.y1 < r.y0 || r.y1 < o.y0)).length;
      // Full labels show down to a ~600px chart, where they are ~1.65x larger in chart units.
      const wide = boxFor(s, side, 1.65);
      if (wide.x0 < 12 || wide.x1 > CHART_W - 12 || r.y0 < 40 || r.y1 > h - 30) score -= 400;
      if (side === 'below') score += 6; // the atlas convention
      if (score > bestScore) {
        bestScore = score;
        best = side;
      }
    }
    s.theme.side = best;
    labelBoxes.push(boxFor(s, best));
  }

  // Works on the orbit, clear of labels, stars and each other.
  const works: ChartWork[] = [];
  const placed: { x: number; y: number }[] = [];
  const themeStar = new Map(stars.filter((s) => s.theme).map((s) => [s.theme!.id, s]));
  for (const item of items) {
    const s = themeStar.get(item.themes[0]!);
    if (!s?.theme) continue;
    const r = s.theme.orbit;
    let best = { a: -Math.PI / 2, score: -Infinity };
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2 - Math.PI;
      const p = { x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r };
      if (p.x < 30 || p.x > CHART_W - 30 || p.y < 44 || p.y > h - 30) continue;
      const near = [...fixed.filter((o) => dist(o, s) > 1), ...placed];
      let score = Math.min(64, ...near.map((o) => dist(o, p)));
      score = Math.min(score, ...labelBoxes.map((b) => toRect(b, p) * 1.5));
      score -= 2 * linePts.filter((q) => dist(q, p) < 10).length;
      if (score > best.score) best = { a, score };
    }
    const p = { x: s.x + Math.cos(best.a) * r, y: s.y + Math.sin(best.a) * r };
    placed.push(p);
    works.push({
      id: item.id,
      theme: s.theme.id,
      secondary: item.themes.slice(1).filter((t) => themeStar.has(t)),
      ...p,
      angle: best.a,
      label: item.label,
      meta: item.meta,
      summary: item.summary,
      href: item.href,
      visibility: item.visibility,
    });
  }

  // Phones: the chart shrinks to under a third while text does not, so short labels get their own
  // placement, clear of stars, works, lines and each other at that scale. The scale is the smallest
  // phone's (a 288px chart at 320px), and a Han glyph is ~13px there (the label's minimum size).
  const PHONE = 0.285;
  const overlaps = (o: Rect, r: Rect) =>
    !(o.x1 + 6 / PHONE < r.x0 || r.x1 + 6 / PHONE < o.x0 || o.y1 + 4 / PHONE < r.y0 || r.y1 + 4 / PHONE < o.y0);
  const shortBox = (s: ChartStar, side: ChartTheme['side']): Rect => {
    const t = s.theme!;
    const han = [...t.short].filter((c) => /\p{Script=Han}/u.test(c)).length;
    const bw = (han * 13 + (t.short.length - han) * 6.6) / PHONE;
    const bh = 15 / PHONE;
    const g = 11 / PHONE;
    if (side === 'below') return { x0: s.x - bw / 2, y0: s.y + g, x1: s.x + bw / 2, y1: s.y + g + bh };
    if (side === 'above') return { x0: s.x - bw / 2, y0: s.y - g - bh, x1: s.x + bw / 2, y1: s.y - g };
    if (side === 'right') return { x0: s.x + g, y0: s.y - bh / 2, x1: s.x + g + bw, y1: s.y + bh / 2 };
    return { x0: s.x - g - bw, y0: s.y - bh / 2, x1: s.x - g, y1: s.y + bh / 2 };
  };
  const shortBoxes: Rect[] = [];
  for (const s of stars) {
    if (!s.theme) continue;
    let best: ChartTheme['side'] = 'below';
    let bestScore = -Infinity;
    for (const side of sides) {
      const r = shortBox(s, side);
      const others = [...fixed.filter((o) => dist(o, s) > 1), ...placed];
      let score = Math.min(40, ...others.map((o) => toRect(r, o)));
      // A star or a work under the label is the worst case; a work just beside it is next.
      score -= 200 * others.filter((o) => toRect(r, o) < 5 / PHONE).length;
      score -= 60 * placed.filter((p) => toRect(r, p) < 14 / PHONE).length;
      // Lines are knocked out under labels in the browser, so crossing one costs little.
      score -= linePts.some((p) => toRect(r, p) < 2) ? 20 : 0;
      score -= 80 * shortBoxes.filter((o) => overlaps(o, r)).length;
      if (r.x0 < 10 || r.x1 > CHART_W - 10 || r.y0 < 70 || r.y1 > h - 10) score -= 400;
      if (score > bestScore) {
        bestScore = score;
        best = side;
      }
    }
    s.theme.sideShort = best;
    shortBoxes.push(shortBox(s, best));
  }

  // Graticule: meridians every hour of RA, parallels every 5° of declination.
  const graticule: Chart['graticule'] = [];
  const path = (pts: { x: number; y: number }[]) =>
    'M' + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L');
  for (const ra of [15, 30, 45, 60]) {
    const pts = [];
    for (let dec = 8; dec <= 38; dec += 1) pts.push(fit(project(ra, dec)));
    const top = fit(project(ra, 31.2));
    graticule.push({ d: path(pts), kind: 'ra', label: `${ra / 15}h`, lx: top.x, ly: top.y });
  }
  for (const dec of [15, 20, 25, 30]) {
    const pts = [];
    for (let ra = 10; ra <= 66; ra += 1) pts.push(fit(project(ra, dec)));
    const edge = fit(project(51.5, dec));
    graticule.push({ d: path(pts), kind: 'dec', label: `+${dec}°`, lx: edge.x, ly: edge.y });
  }

  return { w: CHART_W, h, stars, figure, works, radiant, graticule };
}

/** The site's chart: themes with public work, every work placed on its theme's orbit. */
export function chartFor(work: CollectionEntry<'work'>[], allThemes: CollectionEntry<'themes'>[], lang: Locale) {
  const _ = t(lang);
  // A theme with no visible work would be an empty star, so it stays off the map.
  const themes = allThemes.filter((th) => work.some((w) => w.data.themes[0] === th.id));
  const themeLabel = (id: string) => tr(themes.find((th) => th.id === id)?.data.label, lang);
  const chart = layoutChart(
    themes,
    work.map((w) => ({
      id: w.id,
      themes: w.data.themes,
      label: tr(w.data.title, lang),
      meta: `${_(`kind.${w.data.kind}` as UiKey)} · ${themeLabel(w.data.themes[0]!)}`,
      summary: tr(w.data.summary, lang),
      href: localePath(lang, `/work/${w.id}/`),
      visibility: w.data.visibility,
    })),
    lang,
  );
  return { chart, themes };
}
