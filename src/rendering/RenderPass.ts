import type { RenderingContext } from './RenderingContext';
import type { RenderPipeline } from './RenderPipeline';

/**
 * Options shared by every {@link RenderPass}.
 * @advanced
 */
export interface RenderPassOptions {
  /** Initial enabled state. Default `true`. Toggle later via the {@link RenderPass.enabled} field. */
  readonly enabled?: boolean;
  /** Optional debug label for the inspector / logging. Default: the constructor name. Display only — not an identity. */
  readonly label?: string;
}

/**
 * One high-level phase of a frame. Subclass and implement {@link execute}, or use a stock subclass
 * ({@link RenderNodePass}, {@link CallbackRenderPass}, {@link RenderPipeline}).
 *
 * `enabled`, `label`, {@link resize}, and {@link destroy} are part of the contract so every pass — including
 * resource-owning effect passes — composes uniformly inside a {@link RenderPipeline}.
 *
 * **Exclusive ownership:** a `RenderPass` belongs to at most one {@link RenderPipeline} at a time (tracked via an
 * internal slot). `removePass`/`clear`/`destroy` release it. This is what makes add-time cycle detection and safe
 * cascade-destroy possible, and prevents a pass's `enabled`/`resize`/`destroy` state from being shared.
 * @advanced
 */
export abstract class RenderPass {
  /**
   * When `false`, the containing {@link RenderPipeline} skips this pass during `execute`. Default `true`.
   * Evaluated by the parent — a direct {@link execute} call runs the pass regardless.
   */
  public enabled: boolean;

  /** Debug label (inspector / logging). Defaults to the constructor name. Display only — not an identity. */
  public label: string;

  /**
   * The owning pipeline, or `null`. Set by {@link RenderPipeline.addPass}/`insertPass`, cleared by
   * `removePass`/`clear`/`destroy`. Used to enforce exclusive ownership and detect composition cycles.
   * @internal
   */
  public _pipelineOwner: RenderPipeline | null = null;

  protected constructor(options?: RenderPassOptions) {
    this.enabled = options?.enabled ?? true;
    this.label = options?.label ?? new.target.name;
  }

  /**
   * Run this pass against `context`. The active render target is the canvas unless a parent redirected it.
   *
   * Called directly, this runs **regardless of `enabled`** — `enabled` is evaluated by the containing
   * {@link RenderPipeline}, not self-checked here. Subclasses must not begin `execute` with `if (!this.enabled)`.
   */
  public abstract execute(context: RenderingContext): void;

  /**
   * React to a surface / target size change. No-op by default; size-dependent passes (effects with scratch
   * targets) override. Called by {@link RenderPipeline.resize}, which the caller wires to `app.onResize`.
   */
  public resize(_width: number, _height: number): void {
    // no-op by default; size-dependent passes override.
  }

  /**
   * Release resources this pass allocated internally. No-op by default; idempotent. Never frees injected scene
   * nodes or caller-provided RenderTextures — those are owned by the caller / scene.
   */
  public destroy(): void {
    // no-op by default; resource-owning passes override.
  }
}
