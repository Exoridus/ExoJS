/**
 * Raised when the host environment provides no Web Audio API at all - a
 * missing `AudioContext`, `OfflineAudioContext`, or `getUserMedia`.
 *
 * Distinct from a decode or playback failure on purpose: a decode failure is
 * about one file and the rest of the audio system keeps working, while this
 * means audio is unavailable for the lifetime of the page. Callers branch on
 * it to disable audio features outright instead of retrying or skipping a
 * single asset.
 */
export class AudioUnsupportedError extends Error {
  /** The global or method the environment does not provide. */
  public readonly api: string;

  public constructor(api: string) {
    super(`This environment does not provide ${api}, so audio is unavailable.`);

    this.name = 'AudioUnsupportedError';
    this.api = api;
  }
}
