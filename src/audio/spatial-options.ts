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
  // orientation/cone fields must be applied before `position`: setting `position`
  // triggers panner creation, which seeds the panner's cone properties and
  // performs the orientation smoothing layer's first (snapping) write from
  // whatever `orientation` is current at that moment — so these need their
  // final values in place first, same as the distance/rolloff fields above.
  if (options.orientation !== undefined) voice.orientation = options.orientation;
  if (options.coneInnerAngle !== undefined) voice.coneInnerAngle = options.coneInnerAngle;
  if (options.coneOuterAngle !== undefined) voice.coneOuterAngle = options.coneOuterAngle;
  if (options.coneOuterGain !== undefined) voice.coneOuterGain = options.coneOuterGain;
  if (options.position !== undefined) voice.position = options.position;
  if (options.panningModel !== undefined) voice.panningModel = options.panningModel;
}
