// Auto-generated from terrain-noise.ts - edit the .ts source, not this file.
// Deterministic value-noise used by the procedural-terrain examples.
//
// Shared because two of them sample the same world from two threads: the main
// thread through createSampledChunkSource and a Worker through
// createWorkerSampledChunkSource. A Blob-URL worker shares no scope with the
// module that created it, so the worker gets this code by bundling it (see
// worker-streamed-terrain.worker.ts), not by inheriting it - but it is the same
// source either way, which is what makes the two providers render an identical
// world for a given seed.
/** Integer-lattice hash → [0, 1). Any change here changes every generated world. */
export function hash2D(seed, x, y) {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Bilinearly interpolated lattice noise with a smoothstep fade. */
export function valueNoise(seed, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2D(seed, x0, y0);
  const n10 = hash2D(seed, x0 + 1, y0);
  const n01 = hash2D(seed, x0, y0 + 1);
  const n11 = hash2D(seed, x0 + 1, y0 + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}
/** 4 octaves, persistence 0.5, lacunarity 2 → result in ~[0, 0.94). */
export function fbm(seed, x, y) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave++) {
    value += amplitude * valueNoise(seed + octave, x * frequency, y * frequency);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
}
