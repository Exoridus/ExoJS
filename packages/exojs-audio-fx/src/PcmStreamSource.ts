import { type AudioBus, getAudioContext, registerAudioWorkletProcessor, type Seconds, Signal } from '@codexo/exojs';

import pcmStreamWorkletSource from './worklets/pcm-stream.worklet.ts?worklet';

export interface PcmStreamSourceOptions {
  /** Fixed channel count. PCM is not remixed or resampled by this source. */
  channels: 1 | 2;
  /** Maximum outstanding frames, including messages in transit. Integer 1..1048576; default 8192. This is a capacity, not a target latency. */
  capacityFrames?: number;
  /** Destination bus. Default `null` leaves the output disconnected. Ownership stays with the caller. */
  bus?: AudioBus | null;
}

export type PcmStreamState = 'loading' | 'ready' | 'running' | 'closing' | 'closed' | 'failed' | 'destroyed';

interface PcmStatus {
  type: 'status' | 'cleared' | 'ended';
  releasedFrames: number;
  playedFrames: number;
  underrunFrames: number;
  underruns: number;
}

/**
 * A bounded, externally fed Float32 PCM source at the shared AudioContext's
 * sample rate. Lives in `@codexo/exojs-audio-fx`; no extension registration is
 * required. Feed a bus or connect {@link output} to an analysis tap.
 *
 * Await {@link ready}, enqueue a caller-chosen amount of audio, then call
 * {@link start}. The worklet consumes FIFO samples without waiting for the
 * producer. An empty running queue emits silence; later blocks resume at the
 * next available render quantum, without catching up or skipping samples.
 * Browser suspension freezes the audio clock and playback, but writes remain
 * bounded. Readiness does not unlock browser autoplay.
 *
 * Input arrays are copied synchronously and never detached. The private copy
 * is transferred without requiring cross-origin isolation. Values must be
 * finite; nominal full scale is -1..1, with no clipping or normalization here.
 * Resampling, producer timestamps and audiovisual lookahead belong to callers.
 *
 * Own and destroy the source separately from its bus, for example with a scene
 * DestroyScope. Destroying an AudioSystem or bus does not destroy this source.
 */
export class PcmStreamSource {
  public readonly channels: 1 | 2;
  public readonly capacityFrames: number;
  public readonly sampleRate: number;
  /** Resolves after module loading, even while audio is suspended. Rejects on loading failure or destruction during loading (`AbortError`). */
  public readonly ready: Promise<void>;
  /** Fires once after close has drained, not on destroy or failure. */
  public readonly onEnd = new Signal();
  /** Reports module loading, processor or context closure failures. The source is terminal afterwards. */
  public readonly onError = new Signal<[Error]>();
  /** Stable source tap. Bus routing changes preserve caller-created connections; terminal cleanup disconnects it. */
  public readonly output: GainNode;

  private readonly _context: AudioContext;
  private _state: PcmStreamState = 'loading';
  private _node: AudioWorkletNode | null = null;
  private _bus: AudioBus | null = null;
  private _busNode: AudioNode | null = null;
  private _cancelBusSetup: (() => void) | null = null;
  private _submittedFrames = 0;
  private _highWaterFrames = 0;
  private _releasedFrames = 0;
  private _playedFrames = 0;
  private _underrunFrames = 0;
  private _underruns = 0;
  private _overflowCount = 0;
  private _droppedFrames = 0;
  private _clearing = false;
  private _resolveReady!: () => void;
  private _rejectReady!: (error: Error) => void;
  private readonly _onContextState = (): void => {
    if (this._context.state === 'closed' && !this._terminal) {
      this._fail(new Error('PcmStreamSource: the audio context was closed.'));
    }
  };

  public constructor(options: PcmStreamSourceOptions) {
    const capacity = options.capacityFrames ?? 8192;
    if (options.channels !== 1 && options.channels !== 2) {
      throw new RangeError('PcmStreamSource requires one or two channels.');
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1048576) {
      throw new RangeError('PcmStreamSource capacityFrames must be an integer from 1 to 1048576.');
    }
    this.channels = options.channels;
    this.capacityFrames = capacity;
    this._context = getAudioContext();
    this.sampleRate = this._context.sampleRate;
    this.output = this._context.createGain();
    this.ready = new Promise<void>((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });
    void this.ready.catch(() => {
      // Cancellation may precede the caller's await; keep that original rejection observable.
    });
    this.bus = options.bus ?? null;
    this._context.addEventListener?.('statechange', this._onContextState);
    if (this._context.state === 'closed') {
      this._onContextState();
    } else {
      void this._load();
    }
  }

  public get state(): PcmStreamState {
    return this._state;
  }

  /** Conservative occupancy: submitted frames minus acknowledged consumed/discarded frames. May lag playback while messages are in flight. */
  public get bufferedFrames(): number {
    return this._submittedFrames - this._releasedFrames;
  }

  /** Queue occupancy in seconds, excluding output-device latency. */
  public get bufferedSeconds(): Seconds {
    return (this.bufferedFrames / this.sampleRate) as Seconds;
  }

  /** Lifetime accepted frames. Refused, invalid and empty writes do not increase this count; clear and teardown preserve it. */
  public get enqueuedFrames(): number {
    return this._submittedFrames;
  }

  /** Lifetime maximum bufferedFrames after an accepted write, including transport and unacknowledged consumption. Never exceeds capacityFrames; clear and teardown preserve it. */
  public get highWaterFrames(): number {
    return this._highWaterFrames;
  }

  /** True until the worklet acknowledges clear; writes are refused during this interval. */
  public get clearing(): boolean {
    return this._clearing;
  }

  /** Lifetime frames actually rendered from PCM, as of the latest worklet report. */
  public get playedFrames(): number {
    return this._playedFrames;
  }

  /** Lifetime silent frames caused by starvation after start; excludes idle, suspended and drained time. */
  public get underrunFrames(): number {
    return this._underrunFrames;
  }

  /** Lifetime contiguous starvation episodes, as of the latest report. */
  public get underruns(): number {
    return this._underruns;
  }

  /** Lifetime blocks refused for insufficient capacity. Other refused writes are not overflow. */
  public get overflowCount(): number {
    return this._overflowCount;
  }

  /** Lifetime frames refused for insufficient capacity; not frames discarded by clear or destroy. */
  public get droppedFrames(): number {
    return this._droppedFrames;
  }

  public get bus(): AudioBus | null {
    return this._bus;
  }

  /** Reroute to a bus input, or disconnect that route with `null`. Does not take ownership of the bus or its effects. */
  public set bus(bus: AudioBus | null) {
    if (this._terminal || bus === this._bus) return;
    this._disconnectBus();
    this._bus = bus;
    if (!bus) return;
    const connect = (): void => {
      if (this._terminal || this._bus !== bus) return;
      const input = bus.getInputNode();
      if (input) {
        this.output.connect(input);
        this._busNode = input;
      }
    };
    if (bus.getInputNode()) connect();
    else this._cancelBusSetup = bus.onceSetup(connect);
  }

  /**
   * Begin once, no earlier than `time` in audio-context seconds (default now).
   * Sample positions round up to the next audio frame; a past time starts at
   * the next available quantum. Returns false unless ready and not yet started.
   */
  public start(time = this._context.currentTime): boolean {
    if (this._state !== 'ready') return false;
    if (!Number.isFinite(time) || time < 0) throw new RangeError('PcmStreamSource start time must be finite and nonnegative.');
    this._node!.port.postMessage({ type: 'start', time });
    this._state = 'running';
    return true;
  }

  /**
   * Copy equal-length mono/stereo channel arrays in FIFO order. Returns false
   * before ready, during clear, after close/failure/destroy, or on overflow.
   * Overflow rejects the entire block before copying. Empty blocks succeed
   * without sending a message. Invalid layout or nonfinite samples throw.
   */
  public enqueuePlanar(channels: readonly Float32Array[]): boolean {
    if (!this._writable) return false;
    if (channels.length !== this.channels) throw new RangeError('PCM channel count does not match the source.');
    const frames = channels[0]!.length;
    for (const channel of channels) {
      if (!(channel instanceof Float32Array) || channel.length !== frames) throw new RangeError('PCM channels must be equal-length Float32Arrays.');
    }
    if (!this._admit(frames)) return false;
    for (const channel of channels) this._validateSamples(channel);
    if (frames === 0) return true;
    const packed = new Float32Array(frames * this.channels);
    for (let channel = 0; channel < this.channels; channel++) packed.set(channels[channel]!, channel * frames);
    return this._submit(packed, frames);
  }

  /** Copy interleaved frames (L,R,L,R for stereo). Same acceptance and ownership contract as {@link enqueuePlanar}. */
  public enqueueInterleaved(data: Float32Array): boolean {
    if (!this._writable) return false;
    if (!(data instanceof Float32Array) || data.length % this.channels !== 0) throw new RangeError('PCM must contain whole Float32 frames.');
    const frames = data.length / this.channels;
    if (!this._admit(frames)) return false;
    this._validateSamples(data);
    if (frames === 0) return true;
    const packed = new Float32Array(data.length);
    for (let channel = 0; channel < this.channels; channel++) {
      for (let frame = 0; frame < frames; frame++) packed[channel * frames + frame] = data[frame * this.channels + channel]!;
    }
    return this._submit(packed, frames);
  }

  /**
   * Discard queued PCM once the worklet receives the command, retaining the
   * start schedule and lifetime counters. Coalesces while pending and refuses
   * new writes until acknowledged. No-op while loading or after close.
   */
  public clear(): void {
    if (!this._writable) return;
    this._node!.port.postMessage({ type: 'clear' });
    this._clearing = true;
  }

  /**
   * Refuse further writes and drain. If not started, begin draining immediately;
   * otherwise preserve the scheduled start. Empty tails do not count as
   * underruns. Completes only when the context processes audio; use destroy for
   * immediate cancellation while suspended. Idempotent and terminal.
   */
  public close(): void {
    if (this._terminal || this._state === 'closing') return;
    this._state = 'closing';
    this._node?.port.postMessage({ type: 'close' });
  }

  /** Stop immediately, discard pending PCM, detach routes and release the port. Idempotent; never destroys the bus or shared context. */
  public destroy(): void {
    if (this._state === 'destroyed') return;
    this._state = 'destroyed';
    this._rejectReady(new DOMException('PcmStreamSource was destroyed during loading.', 'AbortError'));
    this._dispose(true);
    this.onEnd.destroy();
    this.onError.destroy();
  }

  private get _terminal(): boolean {
    return this._state === 'closed' || this._state === 'destroyed' || this._state === 'failed';
  }

  private get _writable(): boolean {
    return (this._state === 'ready' || this._state === 'running') && !this._clearing;
  }

  private _admit(frames: number): boolean {
    if (frames <= this.capacityFrames - this.bufferedFrames) return true;
    this._overflowCount++;
    this._droppedFrames += frames;
    return false;
  }

  private _validateSamples(data: Float32Array): void {
    for (const sample of data) {
      if (!Number.isFinite(sample)) throw new RangeError('PCM samples must be finite.');
    }
  }

  private _submit(data: Float32Array, frames: number): boolean {
    this._node!.port.postMessage({ type: 'write', data }, [data.buffer]);
    this._submittedFrames += frames;
    this._highWaterFrames = Math.max(this._highWaterFrames, this.bufferedFrames);
    return true;
  }

  private async _load(): Promise<void> {
    try {
      await registerAudioWorkletProcessor(this._context, 'exojs-pcm-stream', pcmStreamWorkletSource);
      if (this._terminal) return;
      const node = new AudioWorkletNode(this._context, 'exojs-pcm-stream', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [this.channels],
        processorOptions: { channels: this.channels, capacityFrames: this.capacityFrames },
      });
      this._node = node;
      node.port.onmessage = (event: MessageEvent<PcmStatus>): void => this._receive(event.data);
      node.onprocessorerror = (): void => this._fail(new Error('PcmStreamSource: the audio processor failed.'));
      node.connect(this.output);
      if (this._state === 'closing') node.port.postMessage({ type: 'close' });
      else this._state = 'ready';
      this._resolveReady();
    } catch (error) {
      if (!this._terminal) this._fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private _receive(status: PcmStatus): void {
    if (this._terminal) return;
    this._releasedFrames = status.releasedFrames;
    this._playedFrames = status.playedFrames;
    this._underrunFrames = status.underrunFrames;
    this._underruns = status.underruns;
    if (status.type === 'status') this._node!.port.postMessage({ type: 'ack' });
    if (status.type === 'cleared') this._clearing = false;
    if (status.type === 'ended') {
      this._state = 'closed';
      this._dispose(false);
      this.onEnd.dispatch();
    }
  }

  private _fail(error: Error): void {
    if (this._terminal) return;
    this._state = 'failed';
    this._rejectReady(error);
    this._dispose(true);
    this.onError.dispatch(error);
  }

  private _disconnectBus(): void {
    this._cancelBusSetup?.();
    this._cancelBusSetup = null;
    if (this._busNode) this.output.disconnect(this._busNode);
    this._busNode = null;
  }

  private _dispose(terminate: boolean): void {
    this._context.removeEventListener?.('statechange', this._onContextState);
    this._disconnectBus();
    if (this._node) {
      if (terminate) this._node.port.postMessage({ type: 'destroy' });
      this._node.port.onmessage = null;
      this._node.onprocessorerror = null;
      this._node.disconnect();
      this._node.port.close();
      this._node = null;
    }
    this.output.disconnect();
    this._releasedFrames = this._submittedFrames;
    this._clearing = false;
  }
}
