import type { Rectangle } from '#math/Rectangle';

/** Union of every concrete `TypedArray` constructor result. */
export type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Uint8ClampedArray | Float32Array | Float64Array;

/**
 * Multiplier converting a unit-typed time value to milliseconds. Pair with
 * {@link Time.set} / {@link Time.add} as the `factor` argument; canonical
 * values are exposed on the `Time` class as `Time.milliseconds`,
 * `Time.seconds`, `Time.minutes`, `Time.hours`.
 */
export type TimeInterval = 1 | 1000 | 60000 | 3600000;

/**
 * Type-level mapper that rebuilds `Enum` with every value retyped to `Type`.
 * Useful for "table-driven" lookups keyed by an enum.
 */
export type TypedEnum<Enum, Type> = { [Key in keyof Enum]: Type };

/** Type-level extractor of an object's value type, equivalent to `T[keyof T]`. */
export type ValueOf<T> = T[keyof T];

/**
 * Return type of the engine hooks that must not be asynchronous:
 * {@link Scene.init}, the frame hooks {@link Scene.fixedUpdate} /
 * {@link Scene.update} / {@link Scene.draw}, and the {@link SystemMethods}
 * phases. Write these overrides exactly as before — a body that returns
 * nothing satisfies `Synchronous`, `override update(delta: Time): void`
 * remains the idiomatic annotation, and the engine's fluent
 * `update(delta): this` convention still fits.
 *
 * It is deliberately *not* a bare `void`. TypeScript makes a `void`-returning
 * signature assignable from a signature returning **anything at all**, so
 * `override async update()` compiles clean against a `void` base — the exact
 * mistake this contract exists to prevent. The union above keeps `void`,
 * keeps every ordinary object return, and rejects only thenables: `then` is
 * pinned to `never`, so any type carrying a callable `then` (a `Promise`, or
 * a hand-rolled thenable) fails to match. `object &` is what makes the
 * remaining constituent non-weak, so a return type with no `then` property at
 * all is still accepted rather than tripping TypeScript's weak-type check.
 *
 * Nothing here exists at runtime; no engine code reads `then` off a hook
 * result to decide anything (the always-on runtime guard does its own check).
 *
 * Hooks the engine genuinely awaits — {@link Scene.load} and
 * {@link Scene.unload} — are typed `Promise<void> | void` instead and stay
 * asynchronous.
 */
export type Synchronous = void | (object & { then?: never });

/** Strips `readonly` modifiers from every property of `T`. */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Anything the rendering pipeline can sample as a texture source: a loaded
 * image, an offscreen canvas, a playing video, or `null` when no source has
 * been assigned yet.
 */
export type TextureSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap | null;

/** Common playback configuration for {@link Sound} and {@link AudioStream}. */
export interface PlaybackOptions {
  volume: number;
  playbackRate: number;
  loop: boolean;
  muted: boolean;
  time: number;
}

/**
 * Structural interface for value types that support a deep clone and an
 * in-place copy from a same-type source. Implemented by {@link Color},
 * {@link Time}, {@link Vector}, {@link Matrix}, {@link Rectangle}, and
 * other ExoJS value classes.
 */
export interface Cloneable {
  clone(): this;
  copy(source: this): this;
}

/**
 * Structural interface for anything that holds resources requiring explicit
 * release. ExoJS value types tend to implement this even when no external
 * resources are held (no-op `destroy()`) so consumers can call uniformly.
 */
export interface Destroyable {
  destroy(): void;
}

/** Anything that can produce an axis-aligned bounding {@link Rectangle}. */
export interface HasBoundingBox {
  getBounds(): Rectangle;
}

/**
 * `HTMLMediaElement` ready-state events the streaming asset factories
 * ({@link MusicFactory}, {@link VideoFactory}) accept as the load-completion
 * signal. Pick the earliest event that meets your latency requirement;
 * `'canplaythrough'` is the safest default.
 */
export type StreamingLoadEvent = 'loadedmetadata' | 'loadeddata' | 'canplay' | 'canplaythrough';
