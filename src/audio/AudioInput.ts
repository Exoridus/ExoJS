import type { Destroyable } from '#core/types';

import { AudioUnsupportedError } from './AudioUnsupportedError';

/** Options for {@link AudioInput.open} - forwarded to `getUserMedia` audio constraints. */
export interface AudioInputOptions {
  /** Specific input device id (from `enumerateDevices`). */
  deviceId?: string;
  /** Enable browser echo cancellation. Default: browser default. */
  echoCancellation?: boolean;
  /** Enable browser noise suppression. */
  noiseSuppression?: boolean;
  /** Enable browser automatic gain control. */
  autoGainControl?: boolean;
}

/**
 * A live audio capture source - a microphone or WebRTC `MediaStream` obtained
 * via `getUserMedia`. **Not a {@link Playable}**: you don't "play" a mic, you
 * *open* it. Pass it to {@link AudioSystem.open} to get an
 * {@link InputVoice} for monitoring, analysis, or recording.
 *
 * ```ts
 * const mic = await AudioInput.open({ echoCancellation: true });
 * const input = app.audio.open(mic);
 * new AudioAnalyser({ source: input });  // visualise / beat-detect (no feedback)
 * const clip = await input.record(2000); // capture 2s -> Sound
 * mic.destroy();                         // release the device
 * ```
 *
 * {@link open} is a static factory, so it has no `close()` counterpart: teardown
 * goes through {@link destroy} like every other owned resource in the engine,
 * which also makes an `AudioInput` trackable by a {@link DestroyScope}.
 */
export class AudioInput implements Destroyable {
  private readonly _stream: MediaStream;

  private constructor(stream: MediaStream) {
    this._stream = stream;
  }

  /** The underlying `MediaStream`. */
  public get stream(): MediaStream {
    return this._stream;
  }

  /**
   * Request microphone access and resolve with an `AudioInput`.
   *
   * Throws {@link AudioUnsupportedError} when the environment has no
   * `getUserMedia` at all. When the API exists but the request fails, the
   * browser's own `DOMException` is passed through unwrapped - its `name`
   * (`NotAllowedError` for a denied permission, `NotFoundError` for a missing
   * device) is the standard signal to branch on and is not worth hiding behind
   * an engine class.
   */
  public static async open(options: AudioInputOptions = {}): Promise<AudioInput> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new AudioUnsupportedError('navigator.mediaDevices.getUserMedia');
    }

    const constraints: MediaTrackConstraints = {};
    if (options.deviceId !== undefined) constraints.deviceId = options.deviceId;
    if (options.echoCancellation !== undefined) constraints.echoCancellation = options.echoCancellation;
    if (options.noiseSuppression !== undefined) constraints.noiseSuppression = options.noiseSuppression;
    if (options.autoGainControl !== undefined) constraints.autoGainControl = options.autoGainControl;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: Object.keys(constraints).length > 0 ? constraints : true });
    return new AudioInput(stream);
  }

  /** Stop every track in the stream, releasing the input device. Idempotent. */
  public destroy(): void {
    for (const track of this._stream.getTracks()) {
      track.stop();
    }
  }
}
