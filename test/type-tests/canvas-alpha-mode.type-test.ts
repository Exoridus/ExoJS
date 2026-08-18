import type { CanvasAlphaMode, RenderingApplicationOptions } from '#core/Application';

declare const freeform: string;

// The canvas composite contract is one closed union shared by both backends.
const opaque: RenderingApplicationOptions = { alphaMode: 'opaque' };
const premultiplied: RenderingApplicationOptions = { alphaMode: 'premultiplied' };
const mode: CanvasAlphaMode = 'premultiplied';

// @ts-expect-error — 'transparent' is a WebGPU-only spelling, not a canvas alpha mode
const unsupportedMode: RenderingApplicationOptions = { alphaMode: 'transparent' };
// @ts-expect-error — alphaMode is a closed union, not a free-form string
const looseMode: RenderingApplicationOptions = { alphaMode: freeform };

// `webglAttributes` no longer expresses the composite contract: `alpha` and
// `premultipliedAlpha` are derived from `alphaMode` for both backends, so a
// WebGL-only spelling of the same thing would silently diverge from WebGPU.
// @ts-expect-error — canvas alpha is owned by alphaMode
const legacyAlpha: RenderingApplicationOptions = { webglAttributes: { alpha: true } };
// @ts-expect-error — canvas premultiplication is owned by alphaMode
const legacyPremultiplied: RenderingApplicationOptions = { webglAttributes: { premultipliedAlpha: false } };

// The renderer unconditionally needs a stencil buffer on the root target for
// geometric stencil clipping, so `stencil` is engine-owned too, exactly like
// `alpha`/`premultipliedAlpha` above — not a free-form user override.
// @ts-expect-error — stencil is forced on internally, not caller-configurable
const legacyStencil: RenderingApplicationOptions = { webglAttributes: { stencil: true } };

// Genuinely WebGL-only context attributes stay available and unchanged.
const keptAttributes: RenderingApplicationOptions = {
  webglAttributes: {
    antialias: true,
    depth: true,
    desynchronized: true,
    failIfMajorPerformanceCaveat: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  },
};

export { keptAttributes, legacyAlpha, legacyPremultiplied, legacyStencil, looseMode, mode, opaque, premultiplied, unsupportedMode };
