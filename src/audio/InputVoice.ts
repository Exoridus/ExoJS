import { decodeAudioData } from './audio-context';
import type { AudioAnalyser } from './AudioAnalyser';
import type { AudioBus } from './AudioBus';
import { BaseVoice, type BaseVoiceInit } from './BaseVoice';
import { Sound } from './Sound';

/** Construction parameters for {@link InputVoice}. */
export interface InputVoiceInit extends BaseVoiceInit {
  sourceNode: MediaStreamAudioSourceNode;
  stream: MediaStream;
}

/**
 * Live control handle for an {@link AudioInput} (microphone / WebRTC stream),
 * created via {@link AudioManager.open}. Unlike a {@link Playable} voice it is
 * **analysis-only by default** — its output is not routed to a bus, so it never
 * causes feedback. Tap it for visualisation/beat-detection ({@link InputVoice.analyse}
 * or `new AudioAnalyser({ source: inputVoice })`), opt into monitoring with
 * {@link InputVoice.routeTo}, or capture it with {@link InputVoice.record}.
 *
 * A live stream cannot be seeked, paused, looped, or rate-shifted, so it only
 * mixes in {@link Spatializable} (via {@link BaseVoice}) on top of the base
 * Voice surface (volume / fade / stop / effects / output tap / bus).
 *
 * @internal
 */
export class InputVoice extends BaseVoice {
  private readonly _sourceNode: MediaStreamAudioSourceNode;
  private readonly _stream: MediaStream;

  public constructor(init: InputVoiceInit) {
    // Analysis-only: do not connect to the bus until routeTo() is called.
    super({ ...init, autoConnect: false });
    this._sourceNode = init.sourceNode;
    this._stream = init.stream;
    this._sourceNode.connect(this._output);
  }

  /**
   * Make the live input audible by routing it to a bus (monitoring). Use
   * sparingly — routing a microphone to the speakers risks feedback.
   */
  public routeTo(bus: AudioBus): this {
    if (this._ended) return this;
    this._tail().disconnect();
    this._bus = bus;
    this._connectOutput();
    return this;
  }

  /** Tap this input into an {@link AudioAnalyser} — the common visualise / beat-detect case. */
  public analyse(analyser: AudioAnalyser): this {
    analyser.source = this;
    return this;
  }

  /**
   * Record `durationMs` of the live input and resolve with a playable
   * {@link Sound}. Uses `MediaRecorder` under the hood, then decodes the
   * captured blob into an `AudioBuffer`.
   */
  public async record(durationMs: number): Promise<Sound> {
    const recorder = new MediaRecorder(this._stream);
    const chunks: Blob[] = [];

    recorder.addEventListener('dataavailable', event => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    return new Promise<Sound>((resolve, reject) => {
      recorder.addEventListener('stop', () => {
        void (async (): Promise<void> => {
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            const buffer = await decodeAudioData(await blob.arrayBuffer());
            resolve(new Sound(buffer));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        })();
      });
      recorder.addEventListener('error', () => reject(new Error('Recording failed.')));

      recorder.start();
      setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, Math.max(0, durationMs));
    });
  }

  protected override _routeThroughPanner(panner: PannerNode): void {
    this._sourceNode.disconnect();
    this._sourceNode.connect(panner);
    panner.connect(this._output);
  }

  protected override _teardownSource(): void {
    this._sourceNode.disconnect();
  }
}
