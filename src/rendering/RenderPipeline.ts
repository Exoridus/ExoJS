import type { RenderingContext } from './RenderingContext';
import { RenderPass, type RenderPassOptions } from './RenderPass';

/**
 * An ordered list of {@link RenderPass} steps, played once per frame against a {@link RenderingContext}.
 *
 * A `RenderPipeline` is **itself a `RenderPass`**, so pipelines nest freely and a disabled pipeline skips its
 * whole subtree. It **owns** the passes added to it (exclusive ownership — a pass belongs to at most one
 * pipeline): {@link resize} and {@link destroy} cascade to them. It never owns scene nodes or caller
 * RenderTextures. Adding a pass that would create a direct or indirect cycle throws at add time.
 * @advanced
 */
export class RenderPipeline extends RenderPass {
  private readonly _passes: RenderPass[] = [];
  private _executing = false;
  private _destroyed = false;

  public constructor(options?: RenderPassOptions) {
    super(options);
  }

  /** Number of registered passes (enabled and disabled). */
  public get size(): number {
    return this._passes.length;
  }

  /**
   * Append a pass and take exclusive ownership of it. Throws if the pass already belongs to any pipeline, if
   * adding it would create a direct/indirect cycle, during `execute`, or after `destroy`.
   */
  public addPass(pass: RenderPass): this {
    this._admit(pass);
    this._passes.push(pass);
    pass._pipelineOwner = this;

    return this;
  }

  /** Insert a pass at `index` (clamped to `[0, size]`). Same ownership / cycle / execute / destroy throws as {@link addPass}. */
  public insertPass(pass: RenderPass, index: number): this {
    this._admit(pass);
    const at = Math.max(0, Math.min(index, this._passes.length));
    this._passes.splice(at, 0, pass);
    pass._pipelineOwner = this;

    return this;
  }

  /** Remove a pass by identity and release its ownership. Returns `false` if absent. Does not destroy it. */
  public removePass(pass: RenderPass): boolean {
    this._assertLive();
    this._assertNotExecuting();

    const index = this._passes.indexOf(pass);

    if (index === -1) {
      return false;
    }

    this._passes.splice(index, 1);
    pass._pipelineOwner = null;

    return true;
  }

  /** Remove all passes and release their ownership. Does not destroy them. The pipeline stays usable. */
  public clear(): this {
    this._assertLive();
    this._assertNotExecuting();

    for (const pass of this._passes) {
      pass._pipelineOwner = null;
    }

    this._passes.length = 0;

    return this;
  }

  /** Whether `pass` is registered in this pipeline. */
  public hasPass(pass: RenderPass): boolean {
    return pass._pipelineOwner === this;
  }

  /** Index of `pass` in play order, or `-1` if absent. */
  public indexOf(pass: RenderPass): number {
    return this._passes.indexOf(pass);
  }

  /** The pass at `index` in play order, or `undefined` if out of range. */
  public at(index: number): RenderPass | undefined {
    return this._passes[index];
  }

  /** Iterate registered passes in play order. */
  public [Symbol.iterator](): IterableIterator<RenderPass> {
    return this._passes[Symbol.iterator]();
  }

  /**
   * Play every enabled pass in order against `context`. No-op if `this.enabled === false` (a pipeline is itself a
   * directly-executable pass, so disabling it skips its whole subtree). Not re-entrant. Throws after `destroy`.
   */
  public override execute(context: RenderingContext): void {
    if (!this.enabled) {
      return;
    }

    this._assertLive();

    if (this._executing) {
      throw new Error('RenderPipeline.execute is not re-entrant.');
    }

    this._executing = true;

    try {
      for (const pass of this._passes) {
        if (pass.enabled) {
          pass.execute(context);
        }
      }
    } finally {
      this._executing = false;
    }
  }

  /** Cascade `resize(width, height)` to every pass (enabled and disabled). */
  public override resize(width: number, height: number): void {
    for (const pass of this._passes) {
      pass.resize(width, height);
    }
  }

  /**
   * Cascade `destroy()` to every pass, release their ownership, then clear the list. Idempotent. Throws during
   * `execute` (before any teardown begins).
   *
   * Best-effort teardown: the pipeline is marked destroyed and detached from its passes up front, so it always
   * ends in a single, consistent destroyed-and-empty state — every child gets a `destroy()` attempt and has its
   * owner slot released even if an earlier child throws. If one or more children throw, the first error is
   * re-thrown after the cascade completes.
   */
  public override destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._assertNotExecuting();

    // Mark destroyed and snapshot-detach the children first, so the pipeline ends in a consistent
    // destroyed-and-empty state regardless of whether a child's destroy() throws.
    this._destroyed = true;

    const passes = this._passes.splice(0, this._passes.length);
    const errors: unknown[] = [];

    for (const pass of passes) {
      // Release ownership before destroying, so a throwing child never stays attached to this pipeline.
      pass._pipelineOwner = null;

      try {
        pass.destroy();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw errors[0];
    }
  }

  private _admit(pass: RenderPass): void {
    this._assertLive();
    this._assertNotExecuting();

    if (pass._pipelineOwner !== null) {
      throw new Error('RenderPass already belongs to a RenderPipeline; remove it from its current pipeline first.');
    }

    if (pass instanceof RenderPipeline && pass._reaches(this)) {
      throw new Error('RenderPipeline cannot contain itself, directly or indirectly (cycle).');
    }
  }

  /** Whether `target` is reachable from this pipeline (this === target, or a nested pipeline reaches it). */
  private _reaches(target: RenderPipeline): boolean {
    if ((this as RenderPipeline) === target) {
      return true;
    }

    for (const pass of this._passes) {
      if (pass instanceof RenderPipeline && pass._reaches(target)) {
        return true;
      }
    }

    return false;
  }

  private _assertLive(): void {
    if (this._destroyed) {
      throw new Error('RenderPipeline has been destroyed and can no longer be used.');
    }
  }

  private _assertNotExecuting(): void {
    if (this._executing) {
      throw new Error('RenderPipeline cannot be mutated while it is executing.');
    }
  }
}
