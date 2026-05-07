/**
 * Abstract base for all audio processing filters in ExoJS. Each filter exposes
 * stable {@link inputNode} and {@link outputNode} AudioNodes that the audio bus
 * connects into the Web Audio graph. Async filters (e.g., worklet-based) expose
 * a {@link ready} promise that resolves once the filter is fully initialized.
 */
export abstract class AudioFilter {
    /** The node where audio enters this filter. */
    public abstract get inputNode(): AudioNode;
    /** The node where audio exits this filter. */
    public abstract get outputNode(): AudioNode;
    /** Resolves when the filter is fully initialized. Defaults to immediately-resolved for sync filters. */
    public get ready(): Promise<void> { return Promise.resolve(); }
    /** Disconnects all audio nodes and releases resources. Must be called when the filter is no longer needed. */
    public abstract destroy(): void;
}
