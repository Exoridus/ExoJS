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
 * @stable
 */
export class AudioSend {
  public readonly bus: AudioBus;

  private readonly _gain: GainNode;
  private readonly _audioContext: AudioContext;
  private _source: AudioNode;
  private _level: number;
  private _destroyed = false;
  /** Unsubscribe for a connection deferred while the target bus was still locked. */
  private _pendingBusSetup: (() => void) | null = null;

  /**
   * @param source - the node whose signal is copied; a voice's output gain.
   * @internal - built by {@link Voice.addSend}, which owns the lifecycle.
   */
  public constructor(audioContext: AudioContext, source: AudioNode, bus: AudioBus, level: number) {
    this._audioContext = audioContext;
    this.bus = bus;
    this._level = Math.max(level, 0);
    this._gain = audioContext.createGain();
    this._gain.gain.value = this._level;
    this._source = source;

    source.connect(this._gain);
    this._connect();
  }

  /**
   * Move this send to a different source node, keeping its identity, level and
   * bus connection.
   *
   * Exists for the deferred voice a scene hands out before the asset is ready:
   * the send is opened against a placeholder and re-pointed at the real voice on
   * flush, so the handle the caller already holds stays the right one.
   * @internal
   */
  public _retarget(source: AudioNode): void {
    if (this._destroyed || source === this._source) {
      return;
    }

    this._source.disconnect(this._gain);
    this._source = source;
    source.connect(this._gain);
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
    this._gain.gain.setTargetAtTime(next, this._audioContext.currentTime, 0.01);
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
    this._gain.disconnect();
  }

  private _connect(): void {
    const input = this.bus.getInputNode();

    if (input !== null) {
      this._gain.connect(input);

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
        this._gain.connect(node);
      }
    });
  }
}
