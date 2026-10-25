// @ts-check
/**
 * Removes stylesheets that no built page references. Vite emits the CSS of every page module, so
 * the review page's styles reached the public artifact even though the page itself is never built
 * there. Only `_astro/*.css` is considered, and only when no HTML, JS or CSS file names it.
 */
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** @returns {import('astro').AstroIntegration} */
export function pruneOrphans() {
  return {
    name: 'prune-orphans',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const files = walk(out);
        const sheets = files.filter((f) => f.includes(`${join('_astro', '')}`) && f.endsWith('.css'));
        if (!sheets.length) return;
        const text = files
          .filter((f) => /\.(html|js|mjs|css)$/.test(f))
          .map((f) => readFileSync(f, 'utf8'))
          .join('\n');
        for (const sheet of sheets) {
          const name = basename(sheet);
          // A stylesheet's own text does not count as a reference to itself.
          const others = text.split(name).length - 1 - (readFileSync(sheet, 'utf8').includes(name) ? 1 : 0);
          if (others > 0) continue;
          rmSync(sheet);
          logger.info(`removed unreferenced ${name}`);
        }
      },
    },
  };
}
