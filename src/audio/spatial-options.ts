import type { PlayOptions, Spatializable } from './Playable';

/**
 * Apply every spatial {@link PlayOptions} field present on `options` to
 * `voice`, via its live public setters — so a single `audio.play(sound,
 * options)` call can fully configure a spatial emitter without a second
 * step. Shared by every {@link Playable._createVoice} implementation
 * (`Sound`, `AudioStream`, `AudioGenerator`) so a new spatial option only
 * needs adding here once, not at every call site.
 */
export function seedVoiceFromPlayOptions(voice: Spatializable, options: PlayOptions): void {
  if (options.distanceModel !== undefined) voice.distanceModel = options.distanceModel;
  if (options.refDistance !== undefined) voice.refDistance = options.refDistance;
  if (options.maxDistance !== undefined) voice.maxDistance = options.maxDistance;
  if (options.rolloffFactor !== undefined) voice.rolloffFactor = options.rolloffFactor;
  if (options.position !== undefined) voice.position = options.position;
  if (options.panningModel !== undefined) voice.panningModel = options.panningModel;
}
