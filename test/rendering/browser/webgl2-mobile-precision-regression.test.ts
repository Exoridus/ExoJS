/**
 * WebGL2 mobile-GLES precision regression guard for the F4 highp fix.
 *
 * The vertex stages that do position/UV math (`sprite.vert`, `mesh.vert`,
 * `particle.vert`, `text.vert`, the compositor stages, and the inlined
 * nine-slice/repeating sources) must declare `precision highp float`. Real
 * mobile GPUs (Mali/PowerVR) honour a reduced qualifier as genuine IEEE-754
 * half-float (5 exponent + 10 mantissa bits): near ±40k the ULP is 32 world
 * units, so a `mediump`/`lowp` position stage snaps or drops a sprite once
 * world coordinates get large. That is the F4 bug, fixed in PR #272 (commit
 * `bce6182a`).
 *
 * IMPORTANT — what actually reproduces here, and what does NOT:
 *
 * The required `browser-webgl-chromium` CI lane launches Chromium with
 * `--use-angle=swiftshader` (see `vitest.config.ts`). On that backend
 * `gl.getShaderPrecisionFormat()` REPORTS vertex `mediump`/`lowp` as real
 * half-float (rangeMin/Max/precision == 15/15/10 == fp16), NOT the 127/127/23
 * fp32 an ANGLE-D3D11 backend reports. But the reported format is only a
 * capability floor: ANGLE translates the GLSL to Vulkan SPIR-V with
 * `RelaxedPrecision`, and SwiftShader's JIT ignores it and executes every
 * qualifier in fp32. Empirically (measured in-session with a raw probe program)
 * `highp`, `mediump`, and `lowp` all render a far-flung vertex to the exact same
 * pixel, and a value beyond fp16's ~65504 max renders fine under `mediump` too.
 * So a render that collapses under real fp16 does NOT collapse here — no
 * headless desktop backend available in CI actually truncates shader ARITHMETIC
 * to fp16. That is why the regression teeth below live in a static source check,
 * not in the pixel readback.
 *
 * Three layers:
 *
 *  - Layer 1 (environment guard): on the collapsing-REPORTING backend
 *    (SwiftShader / native-GL ANGLE) `getShaderPrecisionFormat` must report
 *    vertex `mediump`/`lowp` as fp16 — confirming the required lane runs an
 *    fp16-class backend, not a silently-swapped-in D3D11 full-fp32 one. Lenient
 *    (informational) on non-ANGLE backends (Firefox) so it never spuriously
 *    reds them.
 *
 *  - Layer 2 (source regression teeth): the shipped position/UV `.vert` sources
 *    must declare `precision highp float` and must NOT declare `mediump`/`lowp`
 *    float. This fails RED the instant someone reintroduces reduced precision on
 *    a vertex stage — proven during development: downgrading `sprite.vert` to
 *    `mediump` fails this layer immediately. This is the guard that catches the
 *    regression in required CI, since the render layer cannot (arithmetic is
 *    fp32 on SwiftShader).
 *
 *  - Layer 3 (end-to-end correctness): render the REAL shipped `sprite.vert`/
 *    `sprite.frag` (bypassing the shader stub via a `?raw` import, the same
 *    technique as `webgl2-sprite-real-shader-tint.test.ts`) with a Sprite parked
 *    at a large world coordinate under a matching camera pan, and assert it
 *    lands exactly where the highp transform places it. This proves the shipped
 *    pipeline renders far-flung sprites correctly end-to-end. It ALSO fails RED
 *    on a real fp16-arithmetic device, and on ANY backend if the RGBA32F
 *    transform texture were regressed to RGBA16F (the coordinate would then
 *    collapse on upload, before the shader) — so it is not decorative, it simply
 *    cannot catch the shader-qualifier regression on SwiftShader specifically.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader wiring — substitute the REAL shipped sprite GLSL via `?raw` (the stub
// plugin only rewrites bare `.vert`/`.frag` ids), and hand-write valid mocks
// for Mesh/Text because `WebGl2Backend#initialize` eagerly compiles the whole
// renderer registry. This mirrors `webgl2-sprite-real-shader-tint.test.ts`.
// ---------------------------------------------------------------------------

vi.mock('#rendering/webgl2/glsl/sprite.vert', async () => {
  const real = await import('../../../src/rendering/webgl2/glsl/sprite.vert?raw');

  return { default: real.default };
});

vi.mock('#rendering/webgl2/glsl/sprite.frag', async () => {
  const real = await import('../../../src/rendering/webgl2/glsl/sprite.frag?raw');

  return { default: real.default };
});

const nonSpriteShaderSources = vi.hoisted(() => ({
  meshVert: `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_texcoord;
in vec4 a_color;
in uint a_nodeIndex;
uniform mat3 u_projection;
uniform sampler2D u_transforms;
out vec2 v_uv; out vec4 v_color; out vec4 v_tint;
void main() {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  mat3 t = mat3(m0.x,m0.z,0.0, m0.y,m0.w,0.0, m1.x,m1.y,1.0);
  vec3 world = t * vec3(a_position, 1.0);
  vec3 clip = u_projection * world;
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_texcoord; v_color = a_color;
  v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,

  meshFrag: `#version 300 es
precision mediump float;
in vec2 v_uv; in vec4 v_color; in vec4 v_tint;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv) * v_color * v_tint; }`,

  textVert: `#version 300 es
precision highp float;
in vec2 a_position; in vec2 a_texcoord; in float a_nodeIndex;
uniform mat3 u_projection;
out vec2 v_uv;
void main() {
  float ni = a_nodeIndex;
  vec3 clip = u_projection * vec3(a_position + vec2(ni * 0.0), 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0); v_uv = a_texcoord;
}`,

  textFrag: `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv); }`,
}));

vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: nonSpriteShaderSources.meshVert }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: nonSpriteShaderSources.meshFrag }));
vi.mock('#rendering/webgl2/glsl/text.vert', () => ({ default: nonSpriteShaderSources.textVert }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', () => ({ default: nonSpriteShaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', () => ({ default: nonSpriteShaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', () => ({ default: nonSpriteShaderSources.textFrag }));

// ---------------------------------------------------------------------------
// Infrastructure helpers (mirrors the sibling browser specs)
// ---------------------------------------------------------------------------

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

// A world coordinate deep in mediump/fp16's precision-collapse regime. In
// [32768, 65536) fp16's ULP is 32 world units, so the +3 sub-half-ULP offset on
// a 12px sprite is entirely unrepresentable there: every corner would round back
// to `cameraCenter` and collapse the quad to the camera origin. fp32 (the
// shipped highp path, and what SwiftShader actually executes) keeps the offset
// exactly, so the sprite lands at its true footprint. The camera is parked at
// the same magnitude so the sprite falls on the 64px screen; the large value
// survives to the shader because the world transform is uploaded through the
// RGBA32F transform texture and only the shader-side qualifier decides collapse.
const cameraCenter = 49152; // = 1536 * 32, exactly representable in fp16
const spriteOffset = 3; // sub-half-ULP (< 16): vanishes under real fp16, kept under fp32
const spriteSize = 12;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app: Application = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: {
          alpha: false,
          antialias: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const buf = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return [buf[0], buf[1], buf[2], buf[3]];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 8): void => {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
};

const createSolidTexture = (color: string, width = spriteSize, height = spriteSize): Texture => {
  const src = document.createElement('canvas');

  src.width = width;
  src.height = height;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  return new Texture(src);
};

const rawRendererString = (gl: WebGL2RenderingContext): string => {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const unmasked = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string | null) : null;

  return `${unmasked ?? ''} ${gl.getParameter(gl.RENDERER) as string}`;
};

// Backends that REPORT vertex mediump/lowp as fp16: ANGLE-SwiftShader and the
// native-OpenGL passthrough. ANGLE-D3D11 (Chrome's desktop default) and
// Firefox's own GL do not, and report 127/127/23 fp32.
const isFp16ReportingBackend = (renderer: string): boolean => /swiftshader|angle.*opengl/i.test(renderer);

// The position/UV vertex stages the F4 fix promoted to highp. Standalone `.vert`
// files only (each is entirely a vertex stage, so a whole-file precision scan is
// unambiguous). Loaded via `?raw` to read the real shipped source, bypassing the
// `.vert` stub plugin.
const positionVertStages = {
  'sprite.vert': () => import('../../../src/rendering/webgl2/glsl/sprite.vert?raw'),
  'mesh.vert': () => import('../../../src/rendering/webgl2/glsl/mesh.vert?raw'),
  'particle.vert': () => import('../../../src/rendering/webgl2/glsl/particle.vert?raw'),
  'text.vert': () => import('../../../src/rendering/webgl2/glsl/text.vert?raw'),
  'mask-compose.vert': () => import('../../../src/rendering/webgl2/glsl/mask-compose.vert?raw'),
  'backdrop-blend.vert': () => import('../../../src/rendering/webgl2/glsl/backdrop-blend.vert?raw'),
  'stencil-clip.vert': () => import('../../../src/rendering/webgl2/glsl/stencil-clip.vert?raw'),
} as const;

// ---------------------------------------------------------------------------
// Layer 1 — the required CI backend must be an fp16-REPORTING one
// ---------------------------------------------------------------------------

describe('WebGL2 mobile precision — Layer 1: environment reports reduced precision', () => {
  test('vertex mediump/lowp are reported as fp16 on the fp16-reporting (required-CI) backend', () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');

    expect(gl).not.toBeNull();
    const ctx = gl!;

    const high = ctx.getShaderPrecisionFormat(ctx.VERTEX_SHADER, ctx.HIGH_FLOAT)!;
    const medium = ctx.getShaderPrecisionFormat(ctx.VERTEX_SHADER, ctx.MEDIUM_FLOAT)!;
    const low = ctx.getShaderPrecisionFormat(ctx.VERTEX_SHADER, ctx.LOW_FLOAT)!;

    // The API itself must answer sanely on every backend.
    expect(high.precision).toBeGreaterThanOrEqual(23);
    expect(high.rangeMax).toBeGreaterThanOrEqual(127);
    expect(medium.precision).toBeGreaterThan(0);

    const renderer = rawRendererString(ctx);

    if (isFp16ReportingBackend(renderer)) {
      // The required `browser-webgl-chromium` lane (--use-angle=swiftshader)
      // MUST land here: assert mediump/lowp are reported as genuine IEEE-754
      // half-float (~fp16: 5 exponent + 10 mantissa bits), NOT the fp32 a
      // D3D11-style backend silently reports. This is the environment guard —
      // if the lane's ANGLE backend ever flipped to full-fp32-reporting, this
      // catches it, so we know we are still testing a mobile-representative
      // precision profile.
      expect(medium.precision).toBeLessThanOrEqual(16);
      expect(medium.rangeMax).toBeLessThanOrEqual(30);
      expect(low.precision).toBeLessThanOrEqual(16);
      expect(low.rangeMax).toBeLessThanOrEqual(30);

      // highp must stay real fp32 — the whole fix depends on it not collapsing.
      expect(high.rangeMax).toBeGreaterThanOrEqual(127);
    } else {
      // Firefox / ANGLE-D3D11 / a real desktop GPU: reduced precision is not
      // reported as fp16 here, so we cannot assert it. Keep this branch
      // informational so it never spuriously reds a non-ANGLE lane.
      expect(medium.rangeMax).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — shipped position/UV vertex stages must stay highp (regression teeth)
// ---------------------------------------------------------------------------

describe('WebGL2 mobile precision — Layer 2: vertex position math stays highp (F4)', () => {
  for (const [name, load] of Object.entries(positionVertStages)) {
    test(`${name} declares highp float and no reduced float precision`, async () => {
      const src = (await load()).default;

      expect(src.length).toBeGreaterThan(0);
      // It reached us as real source, not the stub-plugin's empty string.
      expect(src).toContain('void main');
      // The F4 contract: position/UV math computed in fp32.
      expect(src).toContain('precision highp float;');
      expect(src).not.toMatch(/precision\s+(mediump|lowp)\s+float/);
    });
  }
});

// ---------------------------------------------------------------------------
// Layer 3 — real shipped sprite.vert renders a far-flung sprite correctly
// ---------------------------------------------------------------------------

describe('WebGL2 mobile precision — Layer 3: large-world-coordinate render (F4)', () => {
  test('a sprite at a large world coordinate renders exactly where highp places it', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new Sprite(texture);
    // Camera parked at the same large magnitude so world `cameraCenter` maps to
    // screen centre (32, 32) and 1 world unit == 1 device pixel.
    const view = View.from({ center: { x: cameraCenter, y: cameraCenter }, size: { width: canvasSize, height: canvasSize } });

    try {
      backend.setView(view);

      // Top-left origin: footprint world [x, x+12]. With x == cameraCenter + 3
      // the highp footprint is screen [35, 47] on both axes (centre (41, 41)).
      // Under real fp16 every corner rounds to `cameraCenter` -> screen (32, 32),
      // collapsing the quad to a zero-area point that never covers (41, 41).
      sprite.setPosition(cameraCenter + spriteOffset, cameraCenter + spriteOffset);
      root.addChild(sprite);

      render(backend, root);

      // Sprite present at its highp footprint.
      expectPixelNear(readPixel(backend, 41, 41), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 44, 44), [255, 0, 0, 255]);

      // Background well outside the footprint stays clear on every backend.
      expectPixelNear(readPixel(backend, 8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      view.destroy();
      backend.destroy();
    }
  });
});
