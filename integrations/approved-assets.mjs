// @ts-check
/**
 * `virtual:approved-assets` — exposes the images referenced by `asset:` fields in facts.yaml,
 * but only for facts shown in the current content mode. Unapproved images never enter the
 * module graph, so they are never processed or copied into dist/.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const VIRTUAL = 'virtual:approved-assets';
const RESOLVED = '\0' + VIRTUAL;

/** @returns {import('vite').Plugin} */
export function approvedAssets() {
  const facts = fileURLToPath(new URL('../src/content/facts.yaml', import.meta.url));
  const assetsDir = fileURLToPath(new URL('../src/assets/', import.meta.url));
  let mode = 'public';
  return {
    name: 'approved-assets',
    config(_, env) {
      mode = process.env.CONTENT_MODE ?? (env.command === 'serve' ? 'preview' : 'public');
    },
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
    },
    load(id) {
      if (id !== RESOLVED) return;
      this.addWatchFile(facts);
      /** @type {{ id: string; visibility?: string; asset?: string }[]} */
      const entries = parse(readFileSync(facts, 'utf8')) ?? [];
      const shown = entries.filter(
        (f) => f.asset && (f.visibility === 'public' || (mode === 'preview' && (f.visibility ?? 'pending') === 'pending')),
      );
      const lines = shown.map((f) => `  ${JSON.stringify(f.id)}: () => import(${JSON.stringify(assetsDir + f.asset)}),`);
      return `export default {\n${lines.join('\n')}\n};\n`;
    },
    handleHotUpdate(ctx) {
      if (ctx.file === facts) {
        const mod = ctx.server.moduleGraph.getModuleById(RESOLVED);
        if (mod) ctx.server.moduleGraph.invalidateModule(mod);
      }
    },
  };
}
