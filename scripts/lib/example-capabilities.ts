export type Capability =
  | 'webgl2'
  | 'webgpu'
  | 'pointer'
  | 'keyboard'
  | 'gamepad'
  | 'touch'
  | 'audio'
  | 'fullscreen'
  | 'vibration'
  | 'offscreenCanvas'
  | 'webWorkers';

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

export const deriveCapabilities = (source: string, slug: string, sectionSlug: string): Capability[] => {
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

  // Controller diagnostics need the API; regular lessons also have keyboard controls.
  if (sectionSlug === 'input-ui' && slug === 'gamepad' && /\bGamepad[A-Za-z]*\b/.test(source)) {
    caps.add('gamepad');
  }

  // Pointer gestures remain inspectable with a mouse; touch hardware is optional.
  if (slug !== 'multitouch' && /\bonTouch|maxTouchPoints/.test(source)) {
    caps.add('touch');
  }

  // Section-specific implicit requirements (chapter author asserts the
  // example chapter implies the capability even when source doesn't mention
  // it directly).
  if (sectionSlug === 'spatial-audio') {
    caps.add('audio');
  }

  if (/\bcreateWorkerSampledChunkSource\(|\bnew Worker\(/.test(source)) {
    caps.add('webWorkers');
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
};
