import type { AudioBus } from './AudioBus';

/**
 * A parallel tap from one voice's output into an {@link AudioBus}, at its own
 * level.
 *
 * A send is what an insert effect cannot express: the voice keeps playing into
 * its own bus unchanged (the dry path) while a copy of the same signal also
 * reaches another bus (the wet path). That is the shape reverb, echo and any
 * shared ambience processing needs - one effect instance serving many voices,
 * with each voice deciding how much of itself to contribute.
 *
 * Created by `voice.addSend(bus)` and owned by that voice: it is torn down when
 * the voice ends, so a caller only has to remove one early if the routing itself
 * should change. The target bus is not owned - it keeps serving whoever else
 * sends into it.
 *
 * A scene-deferred voice returns the same handle before its graph exists.
 * Reading or changing its level allocates nothing while it is unbound. The
 * current level is applied when playback starts; removal or cancellation
 * beforehand prevents a native connection entirely.
 * @stable
 */
export class AudioSend {
  public readonly bus: AudioBus;

  private _gain: GainNode | null = null;
  private _audioContext: BaseAudioContext | null = null;
  private _source: AudioNode | null = null;
  private _level: number;
  private _destroyed = false;
  /** Unsubscribe for a connection deferred while the target bus was still locked. */
  private _pendingBusSetup: (() => void) | null = null;

  /**
   * @param source - the node whose signal is copied; a voice's output gain.
   * @internal - built by {@link Voice.addSend}, which owns the lifecycle.
   */
  public constructor(audioContext: AudioContext | null, source: AudioNode | null, bus: AudioBus, level: number) {
    this.bus = bus;
    this._level = Math.max(level, 0);

    if (source !== null) {
      this._audioContext = audioContext ?? source.context;
      this._retarget(source);
    }
  }

  /**
   * Bind this send to a source node, keeping its identity, level and target.
   * A null source releases the native binding without destroying the handle.
   *
   * Deferred voices own unbound sends until playback starts. Rebinding also
   * restores an edge removed while rebuilding a voice's dry effect chain.
   * @internal
   */
  public _retarget(source: AudioNode | null): void {
    if (this._destroyed) {
      return;
    }

    this._disconnectSource();
    this._source = source;

    if (source === null) {
      this._pendingBusSetup?.();
      this._pendingBusSetup = null;
      this._gain?.disconnect();
      this._gain = null;
      this._audioContext = null;

      return;
    }

    if (this._gain === null) {
      this._audioContext ??= source.context;
      this._gain = this._audioContext.createGain();
      this._gain.gain.value = this._level;
      source.connect(this._gain);
      this._connect();
    } else {
      source.connect(this._gain);
    }
  }

  /**
   * Contribution level, `0` and up. `1` sends the voice at its own volume;
   * values above `1` amplify, as an aux send on a mixing desk does.
   *
   * Ramped rather than stepped, so a level driven per frame - by a zone the
   * listener is walking into, say - does not click.
   */
  public get level(): number {
    return this._level;
  }

  public set level(value: number) {
    const next = Math.max(value, 0);

    if (next === this._level || this._destroyed) {
      return;
    }

    this._level = next;

    if (this._gain !== null && this._audioContext !== null) {
      this._gain.gain.setTargetAtTime(next, this._audioContext.currentTime, 0.01);
    }
  }

  /** `true` once this send has been torn down; a torn-down send ignores further writes. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Disconnect and discard. Idempotent. The source node and the target bus are
   * untouched - only this send's own gain node goes away.
   */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this._pendingBusSetup?.();
    this._pendingBusSetup = null;
    this._disconnectSource();
    this._gain?.disconnect();
    this._source = null;
    this._gain = null;
    this._audioContext = null;
  }

  private _disconnectSource(): void {
    if (this._source === null || this._gain === null) {
      return;
    }

    // The source outlives the send, so its edge into this gain has to go too;
    // disconnecting the gain only removes the gain's own outputs. The source
    // may already have dropped all its edges, which Web Audio reports by throwing.
    try {
      this._source.disconnect(this._gain);
    } catch {
      // Already disconnected.
    }
  }

  private _connect(): void {
    const input = this.bus.getInputNode();

    if (input !== null) {
      this._gain?.connect(input);

      return;
    }

    // The bus has no nodes yet because the AudioContext is still locked. Unlike a
    // voice's dry path there is nothing to fall back to - routing a send to the
    // destination would bypass the very effect chain it exists to reach, and
    // would be audible. So it stays silent until the bus comes online.
    this._pendingBusSetup = this.bus.onceSetup((): void => {
      this._pendingBusSetup = null;

      if (this._destroyed) {
        return;
      }

      const node = this.bus.getInputNode();

      if (node !== null) {
        this._gain?.connect(node);
      }
    });
  }
}
