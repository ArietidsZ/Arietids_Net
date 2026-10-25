/**
 * Plates catch the light where the pointer is: under a fine pointer, the bright corner of a `.rim`
 * turns to face it, and turns back to its resting angle when the pointer leaves.
 *
 * The turning light is `.rim-glint` (added on first hover), which takes over from the static rim
 * drawn by `.rim::after`: a ring mask over a gradient square that only rotates. Rotation is a
 * compositor transition, so following the pointer restyles one leaf element and repaints nothing;
 * the angle is written at most once a frame, only while the pointer is over a plate, and always the
 * short way round.
 */
import { isStill } from '~/scripts/motion';

const fine = matchMedia('(hover: hover) and (pointer: fine)');
/** Each plate's resting angle (from its stylesheet) and the last angle written to its glint. */
const resting = new WeakMap<HTMLElement, number>();
const written = new WeakMap<HTMLElement, number>();
let lit: HTMLElement | null = null;
let raf = 0;
let x = 0;
let y = 0;

/** The angle equivalent to `a` that is nearest `near`, so a transition never spins the long way. */
const nearest = (a: number, near: number) => a + 360 * Math.round((near - a) / 360);

/** The rotating square inside a plate's glint, created at the resting angle on first use. */
function sweep(rim: HTMLElement) {
  let s = rim.querySelector<HTMLElement>(':scope > .rim-glint > *');
  if (!s) {
    const g = Object.assign(document.createElement('span'), { className: 'rim-glint' });
    g.setAttribute('aria-hidden', 'true');
    s = g.appendChild(document.createElement('span'));
    s.style.rotate = `${resting.get(rim) ?? 135}deg`;
    rim.append(g);
    // Commit the resting angle, so the first turn starts from it rather than from nothing.
    void getComputedStyle(s).rotate;
  }
  return s;
}

function write(rim: HTMLElement, a: number) {
  sweep(rim).style.rotate = `${a.toFixed(1)}deg`;
  written.set(rim, a);
}

function rest() {
  if (!lit) return;
  const base = resting.get(lit);
  if (base !== undefined) write(lit, nearest(base, written.get(lit) ?? base));
  lit.removeAttribute('data-rim-live');
  lit = null;
}

document.addEventListener(
  'pointermove',
  (e) => {
    if (!fine.matches || e.pointerType !== 'mouse' || isStill()) return rest();
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('.rim') ?? null;
    if (el !== lit) rest();
    if (!el) return;
    lit = el;
    x = e.clientX;
    y = e.clientY;
    raf ||= requestAnimationFrame(() => {
      raf = 0;
      if (!lit) return;
      if (!resting.has(lit)) resting.set(lit, parseFloat(getComputedStyle(lit).getPropertyValue('--rim-angle')) || 135);
      const r = lit.getBoundingClientRect();
      // The gradient starts bright on the side opposite its angle: point it away from the pointer.
      const a = (Math.atan2(y - (r.top + r.height / 2), x - (r.left + r.width / 2)) * 180) / Math.PI + 270;
      const prev = written.get(lit) ?? resting.get(lit)!;
      const next = nearest(a, prev);
      // The transition smooths the rest: small moves are not worth a new one.
      if (Math.abs(next - prev) >= 2 || !lit.hasAttribute('data-rim-live')) write(lit, next);
      lit.toggleAttribute('data-rim-live', true);
    });
  },
  { passive: true },
);
document.documentElement.addEventListener('pointerleave', rest);
