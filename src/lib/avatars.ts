import type { ImageMetadata } from 'astro';
import approved from 'virtual:approved-assets';

/**
 * Images are attached to facts via `asset:` in facts.yaml. Only facts shown in the current
 * content mode are importable here (see integrations/approved-assets.mjs).
 */
export async function loadAvatar(factId: string): Promise<ImageMetadata | undefined> {
  const load = approved[factId];
  return load ? (await load()).default : undefined;
}
