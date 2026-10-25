/**
 * Titles carry zero-width spaces as line-break hints (components/ui/Typeset.astro). They are
 * invisible on screen but not in a pasted citation or search query, so copying drops them.
 */
const HINT = /\u200b/g;

document.addEventListener('copy', (e) => {
  const text = getSelection()?.toString() ?? '';
  if (!e.clipboardData || !HINT.test(text)) return;
  HINT.lastIndex = 0;
  e.clipboardData.setData('text/plain', text.replace(HINT, ''));
  e.preventDefault();
});

export {};
