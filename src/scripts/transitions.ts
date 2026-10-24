/**
 * Cross-document view transitions: the title of the work you open grows into the detail page's
 * heading (which carries its name statically), and shrinks back into its card when you return.
 * Here the leaving page names the title that matches the destination; the arriving home page names
 * the card it came from in an inline script in Base.astro, since `pagereveal` fires before module
 * scripts run. Names are set only for the navigation that needs them, so theme and filter
 * transitions are unaffected.
 */
const slug = (url: string | undefined) => url?.match(/\/work\/([^/]+)\/?$/)?.[1];

addEventListener('pageswap', (e: Event) => {
  const ev = e as Event & { viewTransition?: ViewTransition | null; activation?: { entry?: { url?: string } } | null };
  const id = slug(ev.activation?.entry?.url);
  if (!ev.viewTransition || !id) return;
  const el = document.querySelector<HTMLElement>(`[data-vt-title="${CSS.escape(id)}"]`);
  if (!el || el.style.viewTransitionName) return;
  el.style.viewTransitionName = `t-${id}`;
  ev.viewTransition.finished.finally(() => (el.style.viewTransitionName = ''));
});

export {};
