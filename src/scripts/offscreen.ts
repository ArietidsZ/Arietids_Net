/**
 * Loops rest while nobody can see them. Every `[data-loops]` box gets `data-offscreen` once it
 * leaves the viewport (with a margin, so a loop is already running when it scrolls back in), and
 * base.css pauses every animation inside it. Without IntersectionObserver nothing is paused.
 */
const boxes = document.querySelectorAll<HTMLElement>('[data-loops]');

if (boxes.length && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) (e.target as HTMLElement).toggleAttribute('data-offscreen', !e.isIntersecting);
    },
    { rootMargin: '25% 0px' },
  );
  boxes.forEach((el) => io.observe(el));
}

export {};
