/**
 * Anything a render backend can acquire a drawing context from and size in
 * device pixels.
 *
 * Deliberately narrow: a surface has a backing-store size and hands out a
 * WebGL2 or WebGPU context, and that is the whole contract the backends need.
 * Focus, cursor, pointer capture, CSS, layout and the surrounding document are
 * interaction concerns and live on {@link PlatformAdapter} instead, because an
 * `OffscreenCanvas` has none of them and faking them would only move the
 * failure later.
 */
export type RenderSurface = HTMLCanvasElement | OffscreenCanvas;

/**
 * Whether `surface` is a canvas element in a document, and so carries the DOM
 * affordances (style, layout box, event target, parent element) that an
 * `OffscreenCanvas` does not.
 *
 * Realm-safe: `HTMLCanvasElement` is not defined in a worker, where the answer
 * is always `false`.
 */
export const isDomCanvas = (surface: RenderSurface): surface is HTMLCanvasElement =>
  typeof HTMLCanvasElement !== 'undefined' && surface instanceof HTMLCanvasElement;
