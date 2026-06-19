// @codexo/exojs-audio-fx — side-effect-free root entry.
// A peer-dependency library on top of @codexo/exojs: effects, DSP, beat
// detection and analysis. Insert effects on a bus or voice via addEffect().

export type { AudioAnalyserOptions, AudioAnalyserSource, SpectrumMappingOptions } from './AudioAnalyser';
export { AudioAnalyser } from './AudioAnalyser';
export type {
  BandEnergy,
  BarInfo,
  BeatDetectorOptions,
  BeatDetectorSource,
  BeatInfo,
  TempoCandidate,
  TimeSignature,
  UpcomingBeat,
} from './BeatDetector';
export { BeatDetector } from './BeatDetector';
export { ChorusEffect, type ChorusEffectOptions } from './effects/ChorusEffect';
export { CompressorEffect, type CompressorEffectOptions } from './effects/CompressorEffect';
export { DelayEffect, type DelayEffectOptions } from './effects/DelayEffect';
export { DuckingEffect, type DuckingEffectOptions } from './effects/DuckingEffect';
export { EqualizerEffect, type EqualizerEffectOptions } from './effects/EqualizerEffect';
export { GranularEffect, type GranularEffectOptions } from './effects/GranularEffect';
export { PitchShiftEffect, type PitchShiftEffectOptions } from './effects/PitchShiftEffect';
export { ReverbEffect, type ReverbEffectOptions } from './effects/ReverbEffect';
export { VocoderEffect, type VocoderEffectOptions } from './effects/VocoderEffect';
