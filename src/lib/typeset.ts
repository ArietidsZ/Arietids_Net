/**
 * Typesetting helpers for titles and short labels. Rendering only: the visible text keeps every
 * character of the approved content except where noted (ranges get an en dash).
 */

export type Script = 'han' | 'latin';
export type Segment = { text: string; kind: 'text' | 'nobr' | 'dash' | 'wbr' };

const HAN = /\p{Script=Han}/u;
/** A hyphenated compound such as "Vision-Language-Action": kept on one line where it fits. */
const COMPOUND = /[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+/g;
/** The Chinese double dash, set from the CJK face as one continuous rule. */
const CJK_DASH = /——/g;

export function script(text: string): Script {
  return HAN.test(text) ? 'han' : 'latin';
}

/**
 * Han text set with `word-break: keep-all` needs break hints between phrases: after 的, after
 * 届 and 竞赛, and before 及其 or a standalone 与/和/或. A heuristic, but it keeps words such as
 * 不变量, 全流程, 可及性, 参与 and 物理 whole.
 */
const PHRASE =
  /(?<=\p{Script=Han}的)(?=\p{Script=Han})|(?<=届|竞赛)(?=\p{Script=Han})|(?<=\p{Script=Han})(?<![可参以涉普给])(?=(?:及其|[与和或])\p{Script=Han})/gu;

function phrases(text: string): Segment[] {
  const parts = text.split(PHRASE);
  return parts.flatMap((p, i) => (i === 0 ? [{ text: p, kind: 'text' as const }] : [{ text: '', kind: 'wbr' as const }, { text: p, kind: 'text' as const }]));
}

/** Split text into plain runs, unbreakable compounds, CJK dashes and phrase break hints. */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  const re = new RegExp(`${COMPOUND.source}|${CJK_DASH.source}`, 'g');
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(...phrases(text.slice(last, m.index)));
    out.push({ text: m[0], kind: m[0] === '——' ? 'dash' : 'nobr' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...phrases(text.slice(last)));
  return out.filter((s) => s.kind === 'wbr' || s.text);
}

/**
 * Split a title into a main line and a quieter second line: at '——' for Chinese titles (the dash
 * stays with the second line) and at ': ' for English ones (the colon stays with the first).
 */
export function splitTitle(text: string): { main: string; sub?: string } {
  const dash = text.indexOf('——');
  if (dash > 0) return { main: text.slice(0, dash), sub: text.slice(dash) };
  const colon = text.indexOf(': ');
  if (colon > 0 && !HAN.test(text)) return { main: text.slice(0, colon + 1), sub: text.slice(colon + 2) };
  return { main: text };
}

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
/** Ranges read better with an en dash: 2025-26 → 2025–26, Jul-Aug → Jul–Aug, 2025.07-08 → 2025.07–08. */
export function ranges(text: string): string {
  return text.replace(/(\d)-(\d)/g, '$1–$2').replace(new RegExp(`\\b(${MONTHS})-(${MONTHS})\\b`, 'g'), '$1–$2');
}

/**
 * Split a sentence into clauses after a comma, so it wraps between clauses rather than inside one.
 * Each clause keeps its comma; `gap` is the space that followed it, to be rendered between clauses.
 */
export function clauses(text: string): { text: string; gap: string }[] {
  return text
    .split(/(?<=，|,\s)/)
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.*?)(\s*)$/s)!;
      return { text: m[1]!, gap: m[2]! };
    });
}
