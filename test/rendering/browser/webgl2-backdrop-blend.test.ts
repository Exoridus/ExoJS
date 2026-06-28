/**
 * WebGL2 backdrop-aware blend SPIKE — proves the advanced-blend primitive
 * (`WebGl2BackdropBlendCompositor`) end-to-end in isolation, before any
 * render-plan integration. Mode = Darken (the motivating bug).
 *
 * Verifies the two things the spike exists to de-risk:
 *  1. Backdrop capture + composite math: a transparent source region shows the
 *     backdrop through (NOT black — the old fixed-function Darken bug), and a
 *     covered region equals min(backdrop, source).
 *  2. Spatial / V-flip correctness: the captured backdrop is composited at the
 *     right place (a vertically-split backdrop under an opaque white source
 *     comes back unflipped).
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import { WebGl2BackdropBlendCompositor } from '#rendering/webgl2/WebGl2BackdropBlendCompositor';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { ADVANCED_BLEND_MODES, expectedOpaqueBlend } from './_blendReference';

type RgbaTuple = [number, number, number, number];

const shaderSources = vi.hoisted(() => ({
  vert: `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
uniform mat3 u_projection;
out vec2 v_texcoord;
void main(void) {
  gl_Position = vec4((u_projection * vec3(a_position, 1.0)).xy, 0.0, 1.0);
  v_texcoord = a_texcoord;
}`,
  // MUST stay in sync with src/rendering/webgl2/glsl/backdrop-blend.frag — the
  // browser project stubs .frag imports to "" (shaderStubPlugin), so this mock
  // supplies the real GLSL. The full-suite test below exercises every branch.
  frag: `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform sampler2D u_backdrop;
uniform int u_mode;
uniform float u_opaqueBackdrop;
in vec2 v_texcoord;
layout(location = 0) out vec4 fragColor;
const int MODE_MULTIPLY = 3;
const int MODE_SCREEN = 4;
const int MODE_DARKEN = 5;
const int MODE_LIGHTEN = 6;
const int MODE_OVERLAY = 7;
const int MODE_COLOR_DODGE = 8;
const int MODE_COLOR_BURN = 9;
const int MODE_HARD_LIGHT = 10;
const int MODE_SOFT_LIGHT = 11;
const int MODE_DIFFERENCE = 12;
const int MODE_EXCLUSION = 13;
const int MODE_HUE = 14;
const int MODE_SATURATION = 15;
const int MODE_COLOR = 16;
vec3 unpremultiply(vec4 c) { return c.a > 0.0 ? c.rgb / c.a : vec3(0.0); }
float blendChannel(int mode, float cb, float cs) {
  if (mode == MODE_MULTIPLY) { return cb * cs; }
  if (mode == MODE_SCREEN) { return cb + cs - cb * cs; }
  if (mode == MODE_DARKEN) { return min(cb, cs); }
  if (mode == MODE_LIGHTEN) { return max(cb, cs); }
  if (mode == MODE_OVERLAY) { return cb <= 0.5 ? (2.0 * cb * cs) : (1.0 - 2.0 * (1.0 - cb) * (1.0 - cs)); }
  if (mode == MODE_HARD_LIGHT) { return cs <= 0.5 ? (2.0 * cb * cs) : (1.0 - 2.0 * (1.0 - cb) * (1.0 - cs)); }
  if (mode == MODE_COLOR_DODGE) {
    if (cb <= 0.0) { return 0.0; }
    return cs >= 1.0 ? 1.0 : min(1.0, cb / (1.0 - cs));
  }
  if (mode == MODE_COLOR_BURN) {
    if (cb >= 1.0) { return 1.0; }
    return cs <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb) / cs);
  }
  if (mode == MODE_SOFT_LIGHT) {
    if (cs <= 0.5) { return cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb); }
    float d = cb <= 0.25 ? (((16.0 * cb - 12.0) * cb + 4.0) * cb) : sqrt(cb);
    return cb + (2.0 * cs - 1.0) * (d - cb);
  }
  if (mode == MODE_DIFFERENCE) { return abs(cb - cs); }
  if (mode == MODE_EXCLUSION) { return cb + cs - 2.0 * cb * cs; }
  return min(cb, cs);
}
vec3 blendSeparable(int mode, vec3 cb, vec3 cs) {
  return vec3(blendChannel(mode, cb.r, cs.r), blendChannel(mode, cb.g, cs.g), blendChannel(mode, cb.b, cs.b));
}
float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
vec3 clipColor(vec3 c) {
  float l = lum(c);
  float n = min(min(c.r, c.g), c.b);
  float x = max(max(c.r, c.g), c.b);
  if (n < 0.0) { c = l + ((c - l) * l) / (l - n); }
  if (x > 1.0) { c = l + ((c - l) * (1.0 - l)) / (x - l); }
  return c;
}
vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }
float sat(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
vec3 setSat(vec3 c, float s) {
  float mn = min(min(c.r, c.g), c.b);
  float mx = max(max(c.r, c.g), c.b);
  return mx > mn ? (c - mn) * (s / (mx - mn)) : vec3(0.0);
}
vec3 blendNonSeparable(int mode, vec3 cb, vec3 cs) {
  if (mode == MODE_HUE) { return setLum(setSat(cs, sat(cb)), lum(cb)); }
  if (mode == MODE_SATURATION) { return setLum(setSat(cb, sat(cs)), lum(cb)); }
  if (mode == MODE_COLOR) { return setLum(cs, lum(cb)); }
  return setLum(cb, lum(cs));
}
vec3 blendAdvanced(int mode, vec3 cb, vec3 cs) {
  return mode >= MODE_HUE ? blendNonSeparable(mode, cb, cs) : blendSeparable(mode, cb, cs);
}
void main(void) {
  vec4 src = texture(u_source, v_texcoord);
  vec4 dst = texture(u_backdrop, vec2(v_texcoord.x, 1.0 - v_texcoord.y));
  float as = src.a;
  float ab = max(dst.a, u_opaqueBackdrop);
  vec3 cs = unpremultiply(src);
  vec3 cb = unpremultiply(dst);
  vec3 blended = blendAdvanced(u_mode, cb, cs);
  vec3 mixedSource = mix(cs, blended, ab);
  fragColor = vec4(mixedSource * as, as);
}`,
}));

vi.mock('#rendering/webgl2/glsl/backdrop-blend.vert', () => ({ default: shaderSources.vert }));
vi.mock('#rendering/webgl2/glsl/backdrop-blend.frag', () => ({ default: shaderSources.frag }));

const canvasSize = 64;

const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false, // engine default: opaque root canvas (exercises the opaque-backdrop path)
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize, pixelRatio: 1 },
      rendering: { debug: false, webglAttributes: defaultWebGlAttributes },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();

  return backend;
};

/** Composite a full-canvas source over the backend's current target. */
const composeBackdropBlend = (backend: WebGl2Backend, source: Texture, mode: BlendModes): void => {
  const compositor = new WebGl2BackdropBlendCompositor();

  compositor.connect(backend);

  try {
    compositor.compose(backend, source, 0, 0, canvasSize, canvasSize, mode);
  } finally {
    compositor.disconnect();
  }
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), gl.drawingBufferHeight - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const expectRgbNear = (actual: RgbaTuple, expected: [number, number, number], tolerance = 4): void => {
  for (let index = 0; index < 3; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected rgb [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

/** Left half opaque `color`, right half fully transparent. */
const createLeftOpaqueTexture = (color: string): Texture => {
  const source = document.createElement('canvas');

  source.width = canvasSize;
  source.height = canvasSize;

  const ctx = source.getContext('2d');

  if (!ctx) {
    throw new Error('2D context required.');
  }

  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvasSize / 2, canvasSize);

  return new Texture(source);
};

const createSolidTexture = (color: string): Texture => {
  const source = document.createElement('canvas');

  source.width = canvasSize;
  source.height = canvasSize;

  const ctx = source.getContext('2d');

  if (!ctx) {
    throw new Error('2D context required.');
  }

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  return new Texture(source);
};

describe('WebGL2 backdrop-aware blend (Darken spike)', () => {
  test('transparent source region shows the backdrop; covered region is min(backdrop, source)', async () => {
    const backend = await createBackend();
    // Source: opaque red on the left, transparent on the right.
    const source = createLeftOpaqueTexture('#ff0000');

    try {
      backend.clear(new Color(60, 120, 200)); // backdrop
      composeBackdropBlend(backend, source, BlendModes.Darken);

      // Left (red over blue, Darken): min((60,120,200),(255,0,0)) = (60,0,0).
      expectRgbNear(readPixel(backend, 16, 32), [60, 0, 0]);
      // Right (transparent): the backdrop shows through — NOT black.
      expectRgbNear(readPixel(backend, 48, 32), [60, 120, 200]);
    } finally {
      source.destroy();
      backend.destroy();
    }
  });

  test('backdrop is captured and composited unflipped (vertical split survives)', async () => {
    const backend = await createBackend();
    const white = createSolidTexture('#ffffff');
    const gl = backend.context;

    try {
      // Backdrop: red top half, blue bottom half (scissor in bottom-left origin).
      backend.clear(new Color(200, 40, 40));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, canvasSize, canvasSize / 2); // bottom half
      gl.clearColor(40 / 255, 40 / 255, 200 / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);

      // Opaque white under Darken = min(white, backdrop) = backdrop. The result
      // must match the backdrop spatially (top red, bottom blue) — a V-flip bug
      // would swap them.
      composeBackdropBlend(backend, white, BlendModes.Darken);

      expectRgbNear(readPixel(backend, 32, 8), [200, 40, 40]); // top
      expectRgbNear(readPixel(backend, 32, 56), [40, 40, 200]); // bottom
    } finally {
      white.destroy();
      backend.destroy();
    }
  });

  test('every advanced blend mode matches the W3C reference (opaque over opaque)', async () => {
    const backend = await createBackend();
    const backdropColor: [number, number, number] = [180, 110, 60];
    const sourceColor: [number, number, number] = [90, 200, 150];

    // Oracle self-check with hand-computed values (independent of the shader), so
    // a shared formula error cannot make GPU and reference agree on a wrong number.
    expect(expectedOpaqueBlend(BlendModes.Multiply, backdropColor, sourceColor)).toEqual([64, 86, 35]);
    expect(expectedOpaqueBlend(BlendModes.Difference, backdropColor, sourceColor)).toEqual([90, 90, 90]);
    expect(expectedOpaqueBlend(BlendModes.Luminosity, backdropColor, sourceColor)).toEqual([216, 146, 96]);

    const source = createSolidTexture(`rgb(${sourceColor[0]}, ${sourceColor[1]}, ${sourceColor[2]})`);
    const compositor = new WebGl2BackdropBlendCompositor();

    compositor.connect(backend);

    try {
      for (const mode of ADVANCED_BLEND_MODES) {
        // Re-establish the opaque backdrop each iteration (the previous compose
        // overwrote it) and blend the opaque source over it.
        backend.clear(new Color(backdropColor[0], backdropColor[1], backdropColor[2]));
        compositor.compose(backend, source, 0, 0, canvasSize, canvasSize, mode);

        expectRgbNear(readPixel(backend, 32, 32), expectedOpaqueBlend(mode, backdropColor, sourceColor), 5);
      }
    } finally {
      compositor.disconnect();
      source.destroy();
      backend.destroy();
    }
  });
});
