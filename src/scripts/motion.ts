/**
 * One answer to "should decorative motion rest?": when the OS asks for reduced motion, or the
 * visitor pressed the header's pause switch (MotionToggle.astro). Scripts that animate on their own
 * (the sky, the theme reveal, filter transitions) ask here, so the two never disagree.
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

export const isStill = () => reduce.matches || document.documentElement.dataset.motion === 'off';

/** Calls `fn` whenever the answer may have changed; returns a function that stops listening. */
export function onMotionChange(fn: () => void) {
  reduce.addEventListener('change', fn);
  addEventListener('motionchange', fn);
  return () => {
    reduce.removeEventListener('change', fn);
    removeEventListener('motionchange', fn);
  };
}
