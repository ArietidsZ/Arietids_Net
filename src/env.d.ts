declare module 'virtual:approved-assets' {
  const assets: Record<string, () => Promise<{ default: import('astro').ImageMetadata }>>;
  export default assets;
}
