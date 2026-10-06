import { type AudioBus, getAudioContext, isAudioContextReady, onAudioContextReady, type Voice } from '@codexo/exojs';

/** What an analysis tap can listen to. */
export type AudioTapSource = AudioBus | Voice | MediaStream | AudioNode | null;

/**
 * Feeds one source into one analysis node as a parallel branch, leaving the
 * source's own routing alone. Keeps that connection through a locked
 * AudioContext, a bus that has not built its nodes yet, a target that only
 * arrives later (a loading worklet) and source changes.
 *
 * Shared by `AudioAnalyser` and `BeatDetector`, which differ only in the node
 * they feed.
 */
export class AudioTap {
  private _source: AudioTapSource = null;
  private _target: AudioNode | null = null;
  private _tapNode: AudioNode | null = null;
  private _streamSource: MediaStreamAudioSourceNode | null = null;
  private _pendingSourceSetup: ((context: AudioContext) => void) | null = null;

  public get source(): AudioTapSource {
    return this._source;
  }

  public set source(value: AudioTapSource) {
    if (value === this._source) return;

    this._disconnect();
    this._source = value;

    if (value === null) return;

    if (isAudioContextReady()) {
      this._cancelPendingSetup();
      this._connect(value, getAudioContext());
    } else {
      this._cancelPendingSetup();

      const handler = (context: AudioContext): void => {
        onAudioContextReady.remove(handler);
        this._pendingSourceSetup = null;
        this._connect(value, context);
      };

      this._pendingSourceSetup = handler;
      onAudioContextReady.add(handler);
    }
  }

  /** Sets the node the source feeds and connects a source assigned before it existed. */
  public attach(target: AudioNode, context: AudioContext): void {
    this._target = target;

    if (this._source !== null) {
      this._connect(this._source, context);
    }
  }

  /** Disconnects the tap, cancels pending setup and forgets source and target. */
  public destroy(): void {
    this._cancelPendingSetup();
    this._disconnect();
    this._target = null;
    this._source = null;
  }

  private _connect(source: AudioTapSource, context: AudioContext): void {
    if (!this._target) return;

    const tap = this._resolve(source, context);

    if (!tap) {
      this._deferUntilBusSetup(source);

      return;
    }

    this._tapNode = tap;
    tap.connect(this._target, 0, 0);
  }

  private _resolve(source: AudioTapSource, context: AudioContext): AudioNode | null {
    if (source === null) return null;

    // MediaStream - duck-typed via getTracks, since jsdom has no MediaStream.
    const asStream = source as Partial<{ getTracks: unknown }>;
    if (typeof asStream.getTracks === 'function') {
      if (this._streamSource) {
        this._streamSource.disconnect();
        this._streamSource = null;
      }
      const streamSource = context.createMediaStreamSource(source as MediaStream);
      this._streamSource = streamSource;
      return streamSource;
    }

    // AudioBus - checked before the raw-node case, since a bus also looks node-like.
    const asBus = source as Partial<{ getOutputNode: () => AudioNode | null }>;
    if (typeof asBus.getOutputNode === 'function') {
      return asBus.getOutputNode();
    }

    const asVoice = source as Partial<{ output: AudioNode }>;
    if ('output' in asVoice && asVoice.output) {
      return asVoice.output;
    }

    const asNode = source as Partial<{ connect: unknown; disconnect: unknown }>;
    if (typeof asNode.connect === 'function' && typeof asNode.disconnect === 'function') {
      return source as unknown as AudioNode;
    }

    return null;
  }

  private _deferUntilBusSetup(source: AudioTapSource): void {
    const retry = (): void => {
      if (this._source === source && this._target && isAudioContextReady()) {
        this._connect(source, getAudioContext());
      }
    };
    const asBus = source as Partial<{ onceSetup: (callback: () => void) => void }>;

    if (typeof asBus.onceSetup === 'function') {
      asBus.onceSetup(retry);

      return;
    }

    onAudioContextReady.once(retry);
  }

  private _disconnect(): void {
    if (this._tapNode && this._target) {
      try {
        this._tapNode.disconnect(this._target);
      } catch {
        // Already disconnected.
      }
    }
    this._tapNode = null;

    if (this._streamSource) {
      this._streamSource.disconnect();
      this._streamSource = null;
    }
  }

  private _cancelPendingSetup(): void {
    if (this._pendingSourceSetup !== null) {
      onAudioContextReady.remove(this._pendingSourceSetup);
      this._pendingSourceSetup = null;
    }
  }
}
