// Random helpers. Everything takes an `rng` function returning a number in
// [0, 1), so tests can pass a seeded generator and get repeatable games.

export function seededRandom(seed) {
  // mulberry32: a tiny, well-known seeded generator.
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function choice(rng, items) {
  return items[Math.floor(rng() * items.length)];
}
