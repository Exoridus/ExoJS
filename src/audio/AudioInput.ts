/** Options for {@link AudioInput.open} — forwarded to `getUserMedia` audio constraints. */
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
 * A live audio capture source — a microphone or WebRTC `MediaStream` obtained
 * via `getUserMedia`. **Not a {@link Playable}**: you don't "play" a mic, you
 * *open* it. Pass it to {@link AudioManager.open} to get an
 * {@link InputVoice} for monitoring, analysis, or recording.
 *
 * ```ts
 * const mic = await AudioInput.open({ echoCancellation: true });
 * const input = app.audio.open(mic);
 * new AudioAnalyser({ source: input });  // visualise / beat-detect (no feedback)
 * const clip = await input.record(2000); // capture 2s -> Sound
 * mic.close();                           // release the device
 * ```
 */
export class AudioInput {
  private readonly _stream: MediaStream;

  private constructor(stream: MediaStream) {
    this._stream = stream;
  }

  /** The underlying `MediaStream`. */
  public get stream(): MediaStream {
    return this._stream;
  }

  /**
   * Request microphone access and resolve with an `AudioInput`. Throws / rejects
   * if the user denies permission or no input device is available.
   */
  public static async open(options: AudioInputOptions = {}): Promise<AudioInput> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('AudioInput.open: getUserMedia is not available in this environment.');
    }

    const constraints: MediaTrackConstraints = {};
    if (options.deviceId !== undefined) constraints.deviceId = options.deviceId;
    if (options.echoCancellation !== undefined) constraints.echoCancellation = options.echoCancellation;
    if (options.noiseSuppression !== undefined) constraints.noiseSuppression = options.noiseSuppression;
    if (options.autoGainControl !== undefined) constraints.autoGainControl = options.autoGainControl;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: Object.keys(constraints).length > 0 ? constraints : true });
    return new AudioInput(stream);
  }

  /** Stop every track in the stream, releasing the input device. */
  public close(): void {
    for (const track of this._stream.getTracks()) {
      track.stop();
    }
  }
}
