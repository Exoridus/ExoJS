export abstract class AudioFilter {
    /** The node where audio enters this filter. */
    public abstract get inputNode(): AudioNode;
    /** The node where audio exits this filter. */
    public abstract get outputNode(): AudioNode;
    /** Resolves when the filter is fully initialized. Defaults to immediately-resolved for sync filters. */
    public get ready(): Promise<void> { return Promise.resolve(); }
    public abstract destroy(): void;
}
