import type { PlayOptions, Spatializable, Voice } from './Playable';

/**
 * Apply every spatial {@link PlayOptions} field present on `options` to
 * `voice`, via its live public setters - so a single `audio.play(sound,
 * options)` call can fully configure a spatial emitter without a second
 * step. Shared by every {@link Playable._createVoice} implementation
 * (`Sound`, `AudioStream`, `AudioGenerator`) so a new spatial option only
 * needs adding here once, not at every call site.
 */
export const seedVoiceFromPlayOptions = (voice: Spatializable, options: PlayOptions): void => {
  if (options.distanceModel !== undefined) voice.distanceModel = options.distanceModel;
  if (options.refDistance !== undefined) voice.refDistance = options.refDistance;
  if (options.maxDistance !== undefined) voice.maxDistance = options.maxDistance;
  if (options.rolloffFactor !== undefined) voice.rolloffFactor = options.rolloffFactor;
  // orientation/cone fields must be applied before `position`: setting `position`
  // triggers panner creation, which seeds the panner's cone properties and
  // performs the orientation smoothing layer's first (snapping) write from
  // whatever `orientation` is current at that moment - so these need their
  // final values in place first, same as the distance/rolloff fields above.
  if (options.orientation !== undefined) voice.orientation = options.orientation;
  if (options.coneInnerAngle !== undefined) voice.coneInnerAngle = options.coneInnerAngle;
  if (options.coneOuterAngle !== undefined) voice.coneOuterAngle = options.coneOuterAngle;
  if (options.coneOuterGain !== undefined) voice.coneOuterGain = options.coneOuterGain;
  // Before `position`, for the same reason the cone fields are: setting position
  // creates the panner, and the first relative write should already carry the
  // final height rather than snapping to the plane and ramping up from there.
  if (options.elevation !== undefined) voice.elevation = options.elevation;
  if (options.position !== undefined) voice.position = options.position;
  if (options.panningModel !== undefined) voice.panningModel = options.panningModel;
  if (options.velocity !== undefined) voice.velocity = options.velocity;
  if (options.elevationVelocity !== undefined) voice.elevationVelocity = options.elevationVelocity;
  if (options.occlusion !== undefined) voice.occlusion = options.occlusion;
};

/**
 * Open the parallel sends a play call asked for. Separate from
 * {@link seedVoiceFromPlayOptions} because a send is a lifecycle-owning object
 * rather than a value, and only a live {@link Voice} can hold one.
 */
export const seedVoiceSends = (voice: Voice, options: PlayOptions): void => {
  if (options.sends === undefined) {
    return;
  }

  for (const { bus, level } of options.sends) {
    voice.addSend(bus, level);
  }
};
