/**
 * A seeded pseudo-random generator (a 32-bit LCG), so generated skies and plates come out the
 * same on every build and every visit.
 */
export function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
