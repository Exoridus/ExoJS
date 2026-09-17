import { Color, type Filter } from '@codexo/exojs';

import { ForwardBackend } from './backends/ForwardBackend';
import type { LightingBackend } from './backends/LightingBackend';
import type { Light } from './lights/Light';

/**
 * Which renderer shades the scene. The scene never names one: it describes what
 * emits and what blocks, and the system reports which renderer turned that into
 * pixels.
 *
 * `forward` shades inside the sprite shader against a capacity-bounded light
 * texture: one draw, no extra targets, no shadows. It is the floor, and for now
 * the only one.
 */
export type LightingQuality = 'forward';

/** Intermediate the debug view draws instead of the shaded frame. `null` shades normally. */
export type LightingDebugView = 'albedo' | 'normals' | 'occluders' | 'light' | 'cascades' | null;

/** Construction options for {@link Lighting}. */
export interface LightingOptions {
  /**
   * Baseline colour every lit fragment receives regardless of any light, as a
   * multiplier on the albedo - `255` per channel means "unlit areas keep their
   * full albedo". Stored by reference and re-read every frame.
   */
  readonly ambient?: Color;
  /**
   * Filters applied to the shaded frame, in order. A bloom belongs here rather
   * than on a node: it reads the light the system produced, including the parts
   * no single node drew.
   */
  readonly post?: readonly Filter[];
  /**
   * Lights the `forward` renderer's texture is sized for; lights beyond it are
   * skipped. Defaults to `64`.
   */
  readonly maxLights?: number;
}

/**
 * The lighting system: lights, materials and occluders in, a shaded frame out.
 *
 * ```ts
 * const lighting = new Lighting({ ambient: Color.fromCss('#0b1020') });
 *
 * app.systems.add(lighting);
 * lighting.add(player.addChild(new PointLight({ radius: 260 })));
 * ```
 *
 * # What it owns
 *
 * The renderer and its GPU resources. Lights are scene nodes owned by the tree
 * they hang in - registering one does not transfer ownership, and destroying a
 * registered light unregisters it. Filters passed as `post` are the caller's.
 *
 * # Ordering
 *
 * Register it with the registry that ticks AFTER the code moving the lights, so
 * the frame it shades is the frame that was drawn. `app.systems` runs its update
 * phase before the active scene's, so a system registered there sees lights the
 * scene has not moved yet; `scene.systems` is usually what you want.
 */
export class Lighting {
  /** Baseline colour applied to every lit fragment. Mutable; re-read every frame. */
  public ambient: Color;
  /** Filters applied to the shaded frame, in order. Caller-owned. */
  public post: readonly Filter[];
  /**
   * Intermediate to show instead of the shaded frame. `'occluders'` is the one
   * that explains the feature: it draws the silhouettes the shadow pass reads,
   * which is how you see that they came from colliders rather than from hand
   * work.
   */
  public debug: LightingDebugView = null;

  private readonly _lights: Light[] = [];
  private readonly _backend: LightingBackend;

  public constructor(options: LightingOptions = {}) {
    this.ambient = options.ambient ?? new Color(28, 28, 38);
    this.post = options.post ?? [];
    this._backend = new ForwardBackend({ maxLights: options.maxLights ?? 64 });
  }

  /** The renderer in use. */
  public get quality(): LightingQuality {
    return this._backend.quality;
  }

  /** Registered lights, in registration order. */
  public get lights(): readonly Light[] {
    return this._lights;
  }

  /**
   * Lights the last frame actually shaded with. Lower than {@link lights} when
   * some are disabled, have no intensity, or fall beyond what the renderer in
   * use can carry.
   */
  public get activeLightCount(): number {
    return this._backend.activeLightCount;
  }

  /** The renderer in use, for a material that has to bind its data. @internal */
  public get backend(): LightingBackend {
    return this._backend;
  }

  /**
   * Register a light and return it, so it can be created, parented and
   * registered in one expression.
   *
   * Registering the same light twice shades it twice; the second registration
   * is ignored instead.
   */
  public add<T extends Light>(light: T): T {
    if (light._lighting === this) {
      return light;
    }

    light._lighting?.remove(light);
    light._lighting = this;
    this._lights.push(light);

    return light;
  }

  /** Unregister a light. Returns `false` when it was not registered here. */
  public remove(light: Light): boolean {
    const index = this._lights.indexOf(light);

    if (index === -1) {
      return false;
    }

    this._lights.splice(index, 1);
    light._lighting = null;

    return true;
  }

  /** Unregister every light. */
  public clear(): this {
    for (const light of this._lights) {
      light._lighting = null;
    }

    this._lights.length = 0;

    return this;
  }

  /** `System` update phase: publish this frame's lights to the renderer. */
  public update(): void {
    this._backend.publish(this._lights, this.ambient);
  }

  /** Release the renderer's resources. Registered lights are unregistered, not destroyed. */
  public destroy(): void {
    this.clear();
    this._backend.destroy();
  }
}
