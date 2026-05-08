/**
 * Derives the `capabilities` array for each entry in
 * `examples/examples.json` by scanning the corresponding example source
 * for hard runtime requirements: imported subpaths, audio API surface,
 * input modalities, etc.
 *
 * Idempotent: runs against the current sources and overwrites the
 * `capabilities` field on each catalog entry. Re-run whenever examples
 * change. The default render backend (`webgl2`) is implicit for every
 * example and never declared.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Capability = 'webgl2' | 'webgpu' | 'pointer' | 'keyboard' | 'gamepad' | 'touch' | 'audio' | 'fullscreen' | 'vibration' | 'offscreenCanvas' | 'webWorkers';

interface CatalogEntry {
  slug: string;
  path: string;
  title: string;
  description: string;
  backend: string;
  capabilities?: Capability[];
  tags?: string[];
}

type Catalog = Record<string, CatalogEntry[]>;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplesDir = join(repoRoot, 'examples');
const manifestPath = join(examplesDir, 'examples.json');

const AUDIO_SYMBOLS = [
  'Sound',
  'Music',
  'OscillatorSound',
  'AudioContext',
  'AudioFilter',
  'AudioBus',
  'AudioListener',
  'AudioAnalyser',
  'BeatDetector',
  'CompressorFilter',
  'DuckingFilter',
  'VocoderFilter',
  'ReverbFilter',
  'DelayFilter',
  'EqualizerFilter',
  'HighpassFilter',
  'LowpassFilter',
  'GranularFilter',
  'PitchShiftFilter',
  'ChorusFilter',
  'WorkletFilter',
];

function deriveCapabilities(source: string, slug: string, sectionSlug: string): Capability[] {
  const caps = new Set<Capability>();

  if (source.includes("'@codexo/exojs/webgpu'") || source.includes('"@codexo/exojs/webgpu"')) {
    caps.add('webgpu');
  }
  if (/backend:\s*\{\s*type:\s*['"]webgpu['"]/.test(source) || /backend:\s*['"]webgpu['"]/.test(source)) {
    caps.add('webgpu');
  }

  const audioPattern = new RegExp(`\\b(${AUDIO_SYMBOLS.join('|')})\\b`);
  if (audioPattern.test(source)) {
    caps.add('audio');
  }

  if (/\bKeyboard\.[A-Z]|onKey(Down|Up|Press)/.test(source)) {
    caps.add('keyboard');
  }

  if (/onPointer(Down|Up|Move|Tap|Cancel)/.test(source)) {
    caps.add('pointer');
  }

  // Match Gamepad-related symbols but avoid false positives from things like
  // "GamepadProfile" on type imports — any usage signals the example expects
  // a controller.
  if (/\bGamepad[A-Za-z]*\b/.test(source)) {
    caps.add('gamepad');
  }

  // Pointer events handle touch on modern browsers, so explicit `touch`
  // declaration is reserved for multi-touch demos that genuinely need
  // a touch device.
  if (slug === 'multitouch' || /\bonTouch|maxTouchPoints/.test(source)) {
    caps.add('touch');
  }

  // Section-specific implicit requirements (chapter author asserts the
  // example chapter implies the capability even when source doesn't mention
  // it directly).
  if (sectionSlug === 'spatial-audio') {
    caps.add('audio');
  }

  // Stable order for diff readability.
  const order: Capability[] = [
    'webgl2',
    'webgpu',
    'pointer',
    'keyboard',
    'gamepad',
    'touch',
    'audio',
    'fullscreen',
    'vibration',
    'offscreenCanvas',
    'webWorkers',
  ];
  return order.filter(c => caps.has(c));
}

function syncCapabilities(): void {
  const raw = readFileSync(manifestPath, 'utf8');
  const catalog = JSON.parse(raw) as Catalog;

  let changed = 0;
  let unchanged = 0;

  for (const [section, entries] of Object.entries(catalog)) {
    for (const entry of entries) {
      const sourcePath = join(examplesDir, entry.path);
      const source = readFileSync(sourcePath, 'utf8');
      const derived = deriveCapabilities(source, entry.slug, section);

      const before = JSON.stringify(entry.capabilities ?? []);
      const after = JSON.stringify(derived);
      if (before !== after) {
        if (derived.length === 0) {
          delete entry.capabilities;
        } else {
          entry.capabilities = derived;
        }
        changed++;
      } else {
        unchanged++;
      }
    }
  }

  // Write back with the same indentation Codex used (4 spaces) — match
  // the existing manifest style.
  writeFileSync(manifestPath, `${JSON.stringify(catalog, null, 4)}\n`);

  process.stdout.write(`Sync complete. Changed: ${changed}, unchanged: ${unchanged}.\n`);
}

syncCapabilities();
