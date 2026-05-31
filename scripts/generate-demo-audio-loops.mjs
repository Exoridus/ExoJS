/**
 * Generates three short loopable demo audio tracks as OGG files.
 *
 * Loop A  — bright major chord pulse (G major, higher register)
 * Loop B  — calm minor chord drone (D minor, lower register)
 * Loop Main — mid-range ambient chord (C major)
 *
 * Requires: ffmpeg on PATH
 * Run: node scripts/generate-demo-audio-loops.mjs
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../packages/assets/demo/audio');

const SAMPLE_RATE = 22050;
const CHANNELS = 1;
const BITS = 16;

// ---------------------------------------------------------------------------
// WAV writer
// ---------------------------------------------------------------------------

function writeWav(samples) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;
  buf.write('RIFF', o);
  o += 4;
  buf.writeUInt32LE(36 + dataSize, o);
  o += 4;
  buf.write('WAVE', o);
  o += 4;
  buf.write('fmt ', o);
  o += 4;
  buf.writeUInt32LE(16, o);
  o += 4;
  buf.writeUInt16LE(1, o);
  o += 2; // PCM
  buf.writeUInt16LE(CHANNELS, o);
  o += 2;
  buf.writeUInt32LE(SAMPLE_RATE, o);
  o += 4;
  buf.writeUInt32LE((SAMPLE_RATE * CHANNELS * BITS) / 8, o);
  o += 4;
  buf.writeUInt16LE((CHANNELS * BITS) / 8, o);
  o += 2;
  buf.writeUInt16LE(BITS, o);
  o += 2;
  buf.write('data', o);
  o += 4;
  buf.writeUInt32LE(dataSize, o);
  o += 4;
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Synthesis helpers
// ---------------------------------------------------------------------------

const TWO_PI = Math.PI * 2;

/** Sum of sine harmonics — gives a richer, less harsh tone than a bare sine. */
function osc(freq, t) {
  return (
    Math.sin(TWO_PI * freq * t) * 0.55 +
    Math.sin(TWO_PI * freq * 2 * t) * 0.25 +
    Math.sin(TWO_PI * freq * 3 * t) * 0.12 +
    Math.sin(TWO_PI * freq * 4 * t) * 0.06 +
    Math.sin(TWO_PI * freq * 5 * t) * 0.02
  );
}

/** Smooth fade envelope: linear fade-in over `fadeS` seconds, fade-out over the last `fadeS` seconds. */
function envelope(i, totalSamples, fadeS = 0.04) {
  const fadeSamples = Math.round(SAMPLE_RATE * fadeS);
  const fadeIn = Math.min(1, i / fadeSamples);
  const fadeOut = Math.min(1, (totalSamples - 1 - i) / fadeSamples);
  return fadeIn * fadeOut;
}

/** Generate samples for a chord with a rhythmic tremolo pulse. */
function generateChordLoop({ freqs, durationS, tremoloHz, tremoloDepth, masterVolume = 0.35 }) {
  const n = Math.round(SAMPLE_RATE * durationS);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const f of freqs) v += osc(f, t);
    v /= freqs.length;
    // Tremolo: (1 - depth) + depth * (0.5 + 0.5*sin(...)) keeps amplitude always positive
    const tremolo = 1 - tremoloDepth + tremoloDepth * (0.5 + 0.5 * Math.sin(TWO_PI * tremoloHz * t));
    samples[i] = v * tremolo * masterVolume * envelope(i, n);
  }
  return samples;
}

// ---------------------------------------------------------------------------
// Loop definitions
// ---------------------------------------------------------------------------

const LOOPS = [
  {
    name: 'demo-loop-a',
    // G major: G4 B4 D5 — bright, upper register
    freqs: [392.0, 493.88, 587.33],
    durationS: 5,
    tremoloHz: 3.5, // faster pulse → energetic
    tremoloDepth: 0.55,
    masterVolume: 0.4,
  },
  {
    name: 'demo-loop-b',
    // D minor: D3 F3 A3 — darker, lower register
    freqs: [146.83, 174.61, 220.0],
    durationS: 6,
    tremoloHz: 1.2, // slow pulse → calm
    tremoloDepth: 0.45,
    masterVolume: 0.38,
  },
  {
    name: 'demo-loop-main',
    // C major: C3 E3 G3 — neutral, mid-range
    freqs: [130.81, 164.81, 196.0],
    durationS: 5,
    tremoloHz: 2.0, // moderate pulse → background-friendly
    tremoloDepth: 0.35,
    masterVolume: 0.36,
  },
];

// ---------------------------------------------------------------------------
// Generate and convert
// ---------------------------------------------------------------------------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-audio-'));

for (const loop of LOOPS) {
  const samples = generateChordLoop(loop);
  const wavPath = path.join(tmp, `${loop.name}.wav`);
  const oggPath = path.join(outDir, `${loop.name}.ogg`);

  fs.writeFileSync(wavPath, writeWav(samples));

  execSync(`ffmpeg -y -i "${wavPath}" -c:a libvorbis -q:a 2 -ac 1 -ar ${SAMPLE_RATE} "${oggPath}"`, { stdio: 'pipe' });

  const sizeKb = (fs.statSync(oggPath).size / 1024).toFixed(1);
  console.log(`[audio-gen] ${loop.name}.ogg  ${loop.durationS}s  ${sizeKb} kB`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('[audio-gen] Done.');
