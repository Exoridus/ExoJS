/**
 * Abstract base for all insertable audio effects in ExoJS. Each effect exposes
 * stable {@link inputNode} and {@link outputNode} AudioNodes that an
 * {@link AudioBus} or {@link Voice} connects into the Web Audio graph. Async
 * effects (e.g., worklet-based) expose a {@link ready} promise that resolves
 * once the effect is fully initialized.
 */
export abstract class AudioEffect {
  /** The node where audio enters this effect. */
  public abstract get inputNode(): AudioNode;
  /** The node where audio exits this effect. */
  public abstract get outputNode(): AudioNode;
  /** Resolves when the effect is fully initialized. Defaults to immediately-resolved for sync effects. */
  public get ready(): Promise<void> {
    return Promise.resolve();
  }
  /** Disconnects all audio nodes and releases resources. Must be called when the effect is no longer needed. */
  public abstract destroy(): void;
}

/**
 * Probe whether `effect` has finished creating its underlying node(s). Every
 * built-in {@link AudioEffect} throws a descriptive error from `inputNode`/
 * `outputNode` when accessed before its own (possibly deferred) setup has
 * run - this reads that as a plain boolean instead of letting a caller that
 * disconnects/reconnects effects (`AudioBus`, `BaseVoice`) throw on one still
 * mid-setup.
 */
export function isEffectReady(effect: AudioEffect): boolean {
  try {
    void effect.inputNode;
    void effect.outputNode;
    return true;
  } catch {
    return false;
  }
}
