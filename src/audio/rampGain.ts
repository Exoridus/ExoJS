/** Replaces gain automation while preserving its current level. */
export const rampGain = (gain: AudioParam, target: number, now: number, duration: number): void => {
  const held = gain.value;

  if (typeof gain.cancelAndHoldAtTime === 'function') {
    gain.cancelAndHoldAtTime(now);
  } else {
    gain.cancelScheduledValues(now);
  }

  // A settled parameter still needs an anchor at now for the replacement ramp.
  gain.setValueAtTime(held, now);
  gain.linearRampToValueAtTime(target, now + duration);
};
