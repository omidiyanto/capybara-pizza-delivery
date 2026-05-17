// Small math utilities used across the game.

export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smoothly damp value `current` toward `target`. dt is delta seconds, smoothing is "time to half". */
export function damp(current, target, smoothing, dt) {
  if (smoothing <= 0) return target;
  const t = 1 - Math.pow(0.5, dt / smoothing);
  return lerp(current, target, t);
}

export function dampAngle(current, target, smoothing, dt) {
  // Wrap delta into [-PI, PI]
  let diff = ((target - current + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return current + diff * (1 - Math.pow(0.5, dt / Math.max(0.0001, smoothing)));
}

export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Mulberry32 deterministic RNG. */
export function makeRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
