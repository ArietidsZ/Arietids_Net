/** `<button data-copy="text" data-copied-label="Copied">` copies its payload and confirms in place. */
document.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-copy]');
  if (!btn) return;
  const text = btn.dataset.copy ?? '';
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    const focused = document.activeElement;
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    try {
      document.body.append(ta);
      ta.select();
      copied = document.execCommand('copy');
    } catch {
      // A denied or unsupported fallback must show the same failure as a rejected Clipboard API.
    } finally {
      ta.remove();
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    }
  }
  const message = copied ? (btn.dataset.copiedLabel ?? '✓') : (document.body.dataset.copyFailedLabel ?? 'Copy failed');
  // Announce the result for screen readers through the page's status region.
  const status = document.querySelector<HTMLElement>('[data-status]');
  if (status) {
    status.textContent = message;
    restart(status, () => (status.textContent = ''));
  }
  const label = btn.querySelector<HTMLElement>('[data-copy-label]');
  if (!label) return;
  // Keep the resting label once, so a second click inside the window cannot store "Copied" as it.
  label.dataset.original ??= label.textContent ?? '';
  label.textContent = message;
  if (copied) btn.dataset.copied = '';
  else delete btn.dataset.copied;
  restart(btn, () => {
    label.textContent = label.dataset.original ?? '';
    delete btn.dataset.copied;
  });
});

/** One pending reset per element: a new click restarts the window instead of stacking timers. */
const timers = new WeakMap<HTMLElement, number>();
function restart(el: HTMLElement, done: () => void) {
  clearTimeout(timers.get(el));
  timers.set(el, window.setTimeout(done, 1600));
}
