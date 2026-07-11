/**
 * WebGL2 renderer-matrix browser tests — RetainedContainer under ROTATION,
 * mirroring webgpu-rotated-retained-group.test.ts 1:1 (review findings
 * F3/B-01 + B-07 cross-backend gate for the per-group matrix).
 *
 * WebGL2 uploads the group matrix via Matrix.toArray(false) and is the
 * ground truth; both files assert the SAME expected pixels for a rotated
 * RetainedContainer over a sprite, a single mesh, a static-geometry mesh
 * pair and bitmap text.
 *
 * Group transform: SceneNode.setRotation(θ) builds (a, b, c, d) =
 * (cosθ, sinθ, -sinθ, cosθ), so position (32, 32) + rotation 90° maps
 * child-local (x, y) to world (32 + y, 32 - x); the TRANSPOSED application
 * would map it to (32 - y, 32 + x) — the black-checked artifact positions.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { BitmapText, type BmFontData } from '#rendering/text/BitmapText';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader mocks
//
// The vitest shaderPlugin replaces every .vert/.frag import with
// `export default ""`, and `WebGl2Backend#initialize` connects the renderer
// registry eagerly, so every registered renderer's program needs valid GLSL.
// The mesh sources are the REAL production sources (u_group included); the
// sprite/text sources carry the u_group multiply exactly like production
// (copied from webgl2-retained-container.test.ts).
// ---------------------------------------------------------------------------

const shaderSources = vi.hoisted(() => ({
  spriteVert: `#version 300 es
precision mediump float;
in vec4 a_localBounds;
in vec4 a_uvBounds;
in vec4 a_color;
in uint a_textureSlot;
in uint a_nodeIndex;
uniform mat3 u_projection;
uniform mat3 u_group;
uniform sampler2D u_transforms;
out vec2 v_uv;
out vec4 v_color;
flat out uint v_textureSlot;
void main() {
  vec2 local;
  if (gl_VertexID == 0) local = vec2(a_localBounds.x, a_localBounds.y);
  else if (gl_VertexID == 1) local = vec2(a_localBounds.z, a_localBounds.y);
  else if (gl_VertexID == 2) local = vec2(a_localBounds.x, a_localBounds.w);
  else local = vec2(a_localBounds.z, a_localBounds.w);
  vec2 uv;
  if (gl_VertexID == 0) uv = vec2(a_uvBounds.x, a_uvBounds.y);
  else if (gl_VertexID == 1) uv = vec2(a_uvBounds.z, a_uvBounds.y);
  else if (gl_VertexID == 2) uv = vec2(a_uvBounds.x, a_uvBounds.w);
  else uv = vec2(a_uvBounds.z, a_uvBounds.w);
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  vec2 world = vec2(m0.x * local.x + m0.y * local.y + m1.x, m0.z * local.x + m0.w * local.y + m1.y);
  vec3 clip = u_projection * u_group * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = uv; v_color = a_color; v_textureSlot = a_textureSlot;
}`,

  spriteFrag: `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
flat in uint v_textureSlot;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform sampler2D u_texture2;
uniform sampler2D u_texture3;
uniform sampler2D u_texture4;
uniform sampler2D u_texture5;
uniform sampler2D u_texture6;
uniform sampler2D u_texture7;
out vec4 outColor;
vec4 sampleTexture(uint slot, vec2 uv) {
  if (slot == uint(0)) return texture(u_texture0, uv);
  if (slot == uint(1)) return texture(u_texture1, uv);
  if (slot == uint(2)) return texture(u_texture2, uv);
  if (slot == uint(3)) return texture(u_texture3, uv);
  if (slot == uint(4)) return texture(u_texture4, uv);
  if (slot == uint(5)) return texture(u_texture5, uv);
  if (slot == uint(6)) return texture(u_texture6, uv);
  return texture(u_texture7, uv);
}
void main() { outColor = sampleTexture(v_textureSlot, v_uv) * v_color; }`,

  // Real production mesh.vert (canonical TransformSlot column order + u_group).
  meshVert: `#version 300 es
precision lowp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
layout(location = 6) in uint a_nodeIndex;

uniform mat3 u_projection;
uniform mat3 u_group;
uniform sampler2D u_transforms;

out vec2 v_texcoord;
out vec4 v_color;
out vec4 v_tint;

void main(void) {
    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
    mat3 transform = mat3(
        m0.x, m0.z, 0.0,
        m0.y, m0.w, 0.0,
        m1.x, m1.y, 1.0
    );

    gl_Position = vec4((u_projection * u_group * transform * vec3(a_position, 1.0)).xy, 0.0, 1.0);
    v_texcoord = a_texcoord;
    v_color = a_color;
    v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,

  // Real production mesh.frag.
  meshFrag: `#version 300 es
precision lowp float;

uniform sampler2D u_texture;

in vec2 v_texcoord;
in vec4 v_color;
in vec4 v_tint;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec4 base = texture(u_texture, v_texcoord) * v_color * v_tint;
    fragColor = vec4(base.rgb * base.a, base.a);
}`,

  textVert: `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in float a_nodeIndex;
uniform mat3 u_projection;
uniform mat3 u_group;
out vec2 v_uv;
void main() {
  float ni = a_nodeIndex;
  vec3 clip = u_projection * u_group * vec3(a_position + vec2(ni * 0.0), 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0); v_uv = a_texcoord;
}`,

  textFrag: `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv); }`,
}));

vi.mock('#rendering/webgl2/glsl/sprite.vert', () => ({ default: shaderSources.spriteVert }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', () => ({ default: shaderSources.spriteFrag }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: shaderSources.meshVert }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: shaderSources.meshFrag }));
vi.mock('#rendering/webgl2/glsl/text.vert', () => ({ default: shaderSources.textVert }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', () => ({ default: shaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', () => ({ default: shaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', () => ({ default: shaderSources.textFrag }));

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = {
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
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 12): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

const createSolidTexture = (color: string, size: number): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

// A BitmapText whose single glyph 'A' fills the whole `size`×`size` atlas
// page at the line origin, so its quad covers (0,0)–(size,size) before any
// node/group transform (same fixture as webgl2-retained-container.test.ts).
const createSolidBitmapText = (color: string, size: number): { text: BitmapText; texture: Texture } => {
  const texture = createSolidTexture(color, size);
  const fontData: BmFontData = {
    pages: ['atlas_0.png'],
    chars: new Map([[65, { x: 0, y: 0, width: size, height: size, xOffset: 0, yOffset: 0, xAdvance: size, page: 0 }]]),
    kernings: new Map(),
    lineHeight: size,
    base: size,
  };

  return { text: new BitmapText('A', new BmFont(fontData, [texture])), texture };
};

// A solid-color quad (two triangles) in local space with vertex colors; the
// default mesh path samples the 1×1 white texture, so the output is the
// vertex color. usage defaults to 'static' — the instanced-batch requirement.
const coloredQuad = (x0: number, y0: number, x1: number, y1: number, rgba: RgbaTuple): Geometry => {
  const stride = 12;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y0],
    [x1, y1],
    [x0, y1],
  ];
  const buffer = new ArrayBuffer(corners.length * stride);
  const view = new DataView(buffer);

  corners.forEach(([x, y], index) => {
    const base = index * stride;

    view.setFloat32(base + 0, x, true);
    view.setFloat32(base + 4, y, true);
    view.setUint8(base + 8, rgba[0]);
    view.setUint8(base + 9, rgba[1]);
    view.setUint8(base + 10, rgba[2]);
    view.setUint8(base + 11, rgba[3]);
  });

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 8 },
    ],
    vertexData: buffer,
    stride,
  });
};

const buildRotatedGroup = (): { root: Container; group: RetainedContainer } => {
  const root = new Container();
  const group = new RetainedContainer();

  group.setPosition(32, 32);
  group.setRotation(90);
  root.addChild(group);

  return { root, group };
};

describe('WebGL2 renderer matrix: rotated RetainedContainer cells', () => {
  test('sprite in a rotated group renders at the rotated position and tracks rotation updates', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16);
    const { root, group } = buildRotatedGroup();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      render(backend, root);

      // Local (0..16)² → world x∈(32,48), y∈(16,32).
      expectPixelNear(readPixel(backend, 40, 24), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 40, 40), [0, 0, 0, 255]); // unrotated position stays empty
      expectPixelNear(readPixel(backend, 24, 40), [0, 0, 0, 255]); // transposed-artifact region stays empty

      // Rotation update on the retained group: -90° maps local (x, y) to
      // world (32 - y, 32 + x) → x∈(16,32), y∈(32,48).
      group.setRotation(-90);
      render(backend, root);

      expectPixelNear(readPixel(backend, 24, 40), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 40, 24), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('single mesh in a rotated group renders at the rotated position', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#00ff00', 16);
    const { root, group } = buildRotatedGroup();
    const mesh = new Mesh({
      vertices: new Float32Array([0, 0, 16, 0, 16, 16, 0, 0, 16, 16, 0, 16]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
      texture,
    });

    try {
      group.addChild(mesh);
      render(backend, root);

      expectPixelNear(readPixel(backend, 40, 24), [0, 255, 0, 255]); // rotated position
      expectPixelNear(readPixel(backend, 24, 40), [0, 0, 0, 255]); // transposed-artifact region
      expectPixelNear(readPixel(backend, 40, 40), [0, 0, 0, 255]); // unrotated position
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('static-geometry mesh pair in a rotated group renders both instances rotated', async () => {
    const backend = await createBackend();
    const geometry = coloredQuad(0, 0, 16, 16, [255, 0, 0, 255]);
    const { root, group } = buildRotatedGroup();
    const meshA = new Mesh({ geometry });
    const meshB = new Mesh({ geometry });

    try {
      // meshA local (0..16)²              → world x∈(32,48), y∈(16,32)
      // meshB local x∈(0,16), y∈(-32,-16) → world x∈(0,16), y∈(16,32)
      meshB.setPosition(0, -32);
      group.addChild(meshA);
      group.addChild(meshB);
      render(backend, root);

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expectPixelNear(readPixel(backend, 40, 24), [255, 0, 0, 255]); // meshA rotated center
      expectPixelNear(readPixel(backend, 8, 24), [255, 0, 0, 255]); // meshB rotated center
      expectPixelNear(readPixel(backend, 24, 40), [0, 0, 0, 255]); // transposed meshA artifact region
      expectPixelNear(readPixel(backend, 40, 40), [0, 0, 0, 255]); // unrotated meshA position
    } finally {
      root.destroy();
      geometry.destroy();
      backend.destroy();
    }
  });

  test('bitmap text in a rotated group renders at the rotated position', async () => {
    const backend = await createBackend();
    const { text, texture } = createSolidBitmapText('#ff0000', 32);
    const { root, group } = buildRotatedGroup();

    try {
      group.addChild(text);
      render(backend, root);

      // Glyph local (0..32)² → world x∈(32,64), y∈(0,32).
      expectPixelNear(readPixel(backend, 48, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 16, 48), [0, 0, 0, 255]); // transposed-artifact region
      expectPixelNear(readPixel(backend, 48, 48), [0, 0, 0, 255]); // unrotated position
    } finally {
      text.destroy();
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
