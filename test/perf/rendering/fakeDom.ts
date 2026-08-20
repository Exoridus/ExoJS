/**
 * Minimal DOM stand-ins for the perf harness under **bare Node**.
 *
 * The vitest `rendering-perf` project runs in jsdom, so the render-setup path
 * finds a real `document` there. The standalone launchers
 * (`pnpm perf:renderers:alloc`, `pnpm perf:renderers`) run under plain
 * `node --import tsx/esm` with no DOM at all, and the setup path touches the
 * browser globals in exactly two places:
 *
 *  1. `document.createElement('canvas')` + a 2D context - `createCanvas()`
 *     (`src/rendering/utils.ts`) backs the solid-colour placeholder textures
 *     `Texture.white` / `Texture.black`, which `WebGl2MeshRenderer` (and the
 *     nine-slice / repeating renderers) hold as instance fields. Constructing
 *     the core renderers therefore hits it before a single frame is rendered.
 *  2. `HTMLImageElement` / `HTMLVideoElement` / `SVGElement` as **`instanceof`
 *     operands** - `getCanvasSourceSize()` (`src/core/utils.ts`) narrows a
 *     texture source by these three classes before falling back to a plain
 *     `width`/`height` read. A bare `instanceof` against an undefined global is
 *     a `ReferenceError`, so the classes must exist even though nothing is ever
 *     an instance of them.
 *
 * Nothing else is stubbed on purpose. These shims deliberately do **not**
 * emulate rasterisation, layout or any other rendering semantics: the canvas
 * carries a size and swallows 2D draw calls, and the three element classes are
 * empty markers no stub object inherits from - so `getCanvasSourceSize` takes
 * its documented `width`/`height` fallback and the placeholder textures report
 * the same 10×10 size they do under jsdom. Pixel content is never read back
 * (the fake GL context records `texImage2D`, it does not sample), so a stubbed
 * `fillRect` cannot skew what the allocation sampler measures. Anything beyond
 * these two needs - text metrics (`determineFontHeight` wants `document.body`
 * and layout), image decoding, `OffscreenCanvas` - is intentionally absent so a
 * scene that silently depends on real DOM behaviour fails loudly instead of
 * being measured against a fiction.
 *
 * Idempotent, and a no-op wherever a real `document` already exists (jsdom,
 * browser lanes) - the harness calls it unconditionally.
 *
 * @internal Test/perf-only.
 */

/** 2D context stub: records nothing, satisfies the placeholder-texture fill path. */
interface FakeCanvasContext2D {
  fillStyle: string;
  fillRect(x: number, y: number, width: number, height: number): void;
}

const createFakeContext2D = (): FakeCanvasContext2D => ({
  fillStyle: '#000',
  fillRect: (): void => {},
});

/**
 * A `<canvas>` stand-in with a real size and a no-op 2D context. Mutable
 * `width`/`height` matter: `createCanvas()` assigns them and
 * `getCanvasSourceSize()` reads them back as the texture's natural size.
 */
const createFakeDomCanvas = (): HTMLCanvasElement => {
  const context = createFakeContext2D();
  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string): FakeCanvasContext2D | null => (kind === '2d' ? context : null),
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
  };

  return canvas as unknown as HTMLCanvasElement;
};

/**
 * Install the DOM globals the render-setup path needs under bare Node. Safe to
 * call repeatedly and from environments that already provide them.
 */
export const installFakeDomGlobals = (): void => {
  const globalScope = globalThis as Record<string, unknown>;

  // Empty marker classes - present purely so the `instanceof` narrowing in
  // `getCanvasSourceSize` evaluates instead of throwing. Nothing inherits from
  // them, which is what makes the `width`/`height` fallback the live branch.
  for (const name of ['HTMLImageElement', 'HTMLVideoElement', 'SVGElement']) {
    if (typeof globalScope[name] === 'undefined') {
      globalScope[name] = class {};
    }
  }

  if (typeof globalScope['document'] !== 'undefined') {
    return;
  }

  globalScope['document'] = {
    createElement: (tagName: string): HTMLCanvasElement => {
      if (tagName !== 'canvas') {
        throw new Error(`fakeDom: document.createElement('${tagName}') is not stubbed — the perf harness only supports 'canvas'.`);
      }

      return createFakeDomCanvas();
    },
  };
};
