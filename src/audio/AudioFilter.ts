export abstract class AudioFilter {
    /** The node where audio enters this filter. */
    public abstract get inputNode(): AudioNode;
    /** The node where audio exits this filter. */
    public abstract get outputNode(): AudioNode;
    public abstract destroy(): void;
}
