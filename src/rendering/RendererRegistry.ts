import type { Drawable } from './Drawable';
import type { RenderBackend } from './RenderBackend';
import type { DrawableConstructor, Renderer } from './Renderer';

/**
 * Instance-based renderer registry.
 *
 * Maps drawable constructors to renderer instances. Each drawable type
 * has exactly one renderer. The registry manages connect/disconnect
 * lifecycle for all registered renderers.
 *
 * Resolution walks the prototype chain so sprite-backed subclasses such
 * as Text and Video can intentionally reuse the Sprite renderer.
 *
 * Used internally by backend managers. Exposed publicly for advanced
 * custom renderer registration.
 * @advanced
 */
export class RendererRegistry<Runtime extends RenderBackend> {
  private readonly _renderers = new Map<DrawableConstructor, Renderer<Runtime>>();
  private readonly _resolved = new Map<DrawableConstructor, Renderer<Runtime>>();
  private _backend: Runtime | null = null;

  /**
   * Register a renderer for a specific drawable type.
   *
   * If the registry is already connected to a backend, the renderer
   * is connected immediately. Registration must happen before the
   * first draw call for the given drawable type.
   *
   * @throws Error if a renderer is already registered for this drawable type.
   */
  public registerRenderer<Target extends Drawable>(drawableType: DrawableConstructor<Target>, renderer: Renderer<Runtime, Target>): void {
    if (this._renderers.has(drawableType)) {
      throw new Error(`A renderer is already registered for ${drawableType.name}.`);
    }

    // Widen TDrawable to Drawable for storage. Safe because the map key
    // guarantees the correct drawable type is always paired at lookup.
    this._renderers.set(drawableType, renderer);
    this._resolved.clear();

    if (this._backend !== null) {
      (renderer as Renderer<Runtime>).connect(this._backend);
    }
  }

  /**
   * Atomically bind all `targets` to `renderer`.
   * Validates every target before mutating any map entry.
   * Clears the resolution cache exactly once after all entries are written.
   * @internal
   */
  public bindRenderer(targets: readonly DrawableConstructor[], renderer: Renderer<Runtime>): void {
    if (targets.length === 0) {
      throw new Error('A RendererBinding must declare at least one target.');
    }

    // Validate: no duplicate targets within this call
    const seen = new Set<DrawableConstructor>();

    for (const target of targets) {
      if (seen.has(target)) {
        throw new Error(`A RendererBinding declares the same target ${target.name} more than once.`);
      }

      seen.add(target);
    }

    // Validate: no target already registered — throw before any mutation
    for (const target of targets) {
      if (this._renderers.has(target)) {
        throw new Error(`A renderer is already registered for ${target.name}.`);
      }
    }

    // All validation passed — atomically install all mappings
    for (const target of targets) {
      this._renderers.set(target, renderer);
    }

    // Invalidate resolution cache once
    this._resolved.clear();

    // Connect renderer if already connected
    if (this._backend !== null) {
      renderer.connect(this._backend);
    }
  }

  /**
   * Iterate all registered renderers. Used by managers to dispatch
   * lifecycle hooks (e.g. WebGPU pipeline pre-warmup) to whichever
   * renderers expose them.
   */
  public renderers(): Iterable<Renderer<Runtime>> {
    return this._renderers.values();
  }

  /**
   * Find the renderer responsible for `drawable`.
   * Uses a first-resolution cache — after warm-up, a single Map.get.
   * Falls back to prototype-chain walk on cache miss.
   *
   * @throws Error if no renderer is found for the drawable's type.
   */
  public resolve(drawable: Drawable): Renderer<Runtime> {
    const ctor = drawable.constructor as DrawableConstructor;
    const cached = this._resolved.get(ctor);

    if (cached !== undefined) {
      return cached;
    }

    let constructor: DrawableConstructor | null = ctor;
    let renderer: Renderer<Runtime> | undefined;

    while (constructor !== null && !renderer) {
      renderer = this._renderers.get(constructor);

      if (!renderer) {
        const prototype = Object.getPrototypeOf(constructor.prototype) as { constructor?: DrawableConstructor } | null;

        constructor = prototype?.constructor ?? null;
      }
    }

    if (!renderer) {
      throw new Error(
        `No renderer registered for ${drawable.constructor.name}. ` +
          'If it comes from an ExoJS extension, import that package before creating the Application, ' +
          'or pass the extension via ApplicationOptions.extensions.',
      );
    }

    this._resolved.set(ctor, renderer);

    return renderer;
  }

  /**
   * Connect all registered renderers to the given backend.
   */
  public connect(backend: Runtime): void {
    this._backend = backend;

    for (const renderer of this._renderers.values()) {
      renderer.connect(backend);
    }
  }

  /**
   * Disconnect all registered renderers from the current backend.
   */
  public disconnect(): void {
    for (const renderer of this._renderers.values()) {
      renderer.disconnect();
    }

    this._backend = null;
  }

  /**
   * Disconnect all registered renderers and clear the registry.
   * Deduplicates across multi-target bindings so each shared renderer
   * instance is disconnected and destroyed exactly once.
   */
  public destroy(): void {
    const seen = new Set<Renderer<Runtime>>();

    for (const renderer of this._renderers.values()) {
      if (!seen.has(renderer)) {
        seen.add(renderer);
        renderer.disconnect();

        if ('destroy' in renderer && typeof renderer.destroy === 'function') {
          (renderer as Renderer<Runtime> & { destroy(): void }).destroy();
        }
      }
    }

    this._renderers.clear();
    this._resolved.clear();
    this._backend = null;
  }
}
