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
export { AutoWahEffect, type AutoWahEffectOptions } from './effects/AutoWahEffect';
export { BitCrusherEffect, type BitCrusherEffectOptions } from './effects/BitCrusherEffect';
export { ChorusEffect, type ChorusEffectOptions } from './effects/ChorusEffect';
export { CompressorEffect, type CompressorEffectOptions } from './effects/CompressorEffect';
export { ConvolutionEffect, type ConvolutionEffectOptions } from './effects/ConvolutionEffect';
export { DelayEffect, type DelayEffectOptions } from './effects/DelayEffect';
export { DistortionEffect, type DistortionEffectOptions } from './effects/DistortionEffect';
export { DuckingEffect, type DuckingEffectOptions } from './effects/DuckingEffect';
export { EqualizerEffect, type EqualizerEffectOptions } from './effects/EqualizerEffect';
export { FlangerEffect, type FlangerEffectOptions } from './effects/FlangerEffect';
export { GranularEffect, type GranularEffectOptions } from './effects/GranularEffect';
export { LimiterEffect, type LimiterEffectOptions } from './effects/LimiterEffect';
export { PhaserEffect, type PhaserEffectOptions } from './effects/PhaserEffect';
export { PingPongDelayEffect, type PingPongDelayEffectOptions } from './effects/PingPongDelayEffect';
export { PitchShiftEffect, type PitchShiftEffectOptions } from './effects/PitchShiftEffect';
export { ReverbEffect, type ReverbEffectOptions } from './effects/ReverbEffect';
export { RingModulatorEffect, type RingModulatorEffectOptions } from './effects/RingModulatorEffect';
export { TremoloEffect, type TremoloEffectOptions } from './effects/TremoloEffect';
export { VocoderEffect, type VocoderEffectOptions } from './effects/VocoderEffect';
