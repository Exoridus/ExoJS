import { getAudioContext, isAudioContextReady, onAudioContextReady } from './audioContext';

/**
 * Abstract base for all insertable audio effects in ExoJS. Each effect exposes
 * stable {@link inputNode} and {@link outputNode} AudioNodes that an
 * {@link AudioBus} or {@link Voice} connects into the Web Audio graph.
 *
 * An effect builds its nodes through {@link AudioEffect._deferSetup}, which runs
 * as soon as the shared AudioContext is ready. Until then the effect is not
 * wired into any graph, and {@link ready} stays pending.
 */
export abstract class AudioEffect {
  private _wired = false;
  private _settled = false;
  private _readyPromise: Promise<void> | null = null;
  private _resolveReady: (() => void) | null = null;
  private _pendingSetup: ((context: AudioContext) => void) | null = null;

  /**
   * The node where audio enters this effect. Throws until the effect's setup
   * has run. Wiring is the bus's or voice's job; read it only to build a
   * custom effect or route outside the engine.
   * @advanced
   */
  public abstract get inputNode(): AudioNode;
  /**
   * The node where audio exits this effect. Throws until the effect's setup
   * has run.
   * @advanced
   */
  public abstract get outputNode(): AudioNode;

  /**
   * Resolves once the effect is fully initialized: its nodes exist and, for an
   * effect with asynchronous setup such as a worklet effect, that setup has
   * settled. Stays pending while the shared AudioContext is locked, and for an
   * effect destroyed before its setup ran.
   */
  public get ready(): Promise<void> {
    if (this._readyPromise === null) {
      this._readyPromise = this._settled
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            this._resolveReady = resolve;
          });
    }

    return this._readyPromise;
  }

  /** @internal `true` once {@link inputNode} and {@link outputNode} can be read and wired. */
  public get _isWired(): boolean {
    return this._wired;
  }

  /** Disconnects all audio nodes and releases resources. Must be called when the effect is no longer needed. */
  public abstract destroy(): void;

  /**
   * Run `setup` with the shared AudioContext: immediately when it is ready,
   * otherwise once it unlocks. `setup` must create the nodes behind
   * {@link inputNode} and {@link outputNode}; the effect counts as wired as soon
   * as it returns. Returning a promise defers {@link ready} until it settles.
   *
   * Call it at the end of the subclass constructor, after the fields `setup`
   * reads are initialized - from a base constructor it could run before them.
   * A subclass's `destroy()` calls {@link AudioEffect._teardown}.
   */
  protected _deferSetup(setup: (context: AudioContext) => void | Promise<void>): void {
    const run = (context: AudioContext): void => {
      const pending = setup(context);

      this._wired = true;

      if (pending instanceof Promise) {
        void pending.then(() => this._settle());
      } else {
        this._settle();
      }
    };

    if (isAudioContextReady()) {
      run(getAudioContext());

      return;
    }

    const listener = (context: AudioContext): void => {
      this._removePendingSetup();
      run(context);
    };

    this._pendingSetup = listener;
    onAudioContextReady.add(listener);
  }

  /**
   * Marks the effect unwired and drops a setup still waiting for the
   * AudioContext, so a destroyed effect is never wired again and never builds
   * its nodes late.
   */
  protected _teardown(): void {
    this._wired = false;
    this._removePendingSetup();
  }

  private _removePendingSetup(): void {
    if (this._pendingSetup !== null) {
      onAudioContextReady.remove(this._pendingSetup);
      this._pendingSetup = null;
    }
  }

  private _settle(): void {
    this._settled = true;
    this._resolveReady?.();
    this._resolveReady = null;
  }
}

/**
 * Whether `effect` has finished creating its underlying node(s), so a caller
 * that disconnects/reconnects effects (`AudioBus`, `BaseVoice`) can skip one
 * still waiting for the AudioContext instead of reading nodes that do not exist.
 */
export const isEffectReady = (effect: AudioEffect): boolean => effect._isWired;
