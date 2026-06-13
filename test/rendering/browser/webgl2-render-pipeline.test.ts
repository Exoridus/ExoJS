import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderNodePass } from '#rendering/RenderNodePass';
import { RenderPipeline } from '#rendering/RenderPipeline';
import type { RenderTarget } from '#rendering/RenderTarget';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// Simplified shaders mocked in place of the real .vert/.frag string imports
// (the test environment has no loader for them). Hoisted so the sync vi.mock
// factories below can reference them.
const shaderSources = vi.hoisted(() => ({
  spriteVertexSource: `#version 300 es
precision mediump float;
in vec4 a_localBounds;
in vec4 a_uvBounds;
in vec4 a_color;
in uint a_textureSlot;
in uint a_nodeIndex;
uniform mat3 u_projection;
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
  vec3 clip = u_projection * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = uv;
  v_color = a_color;
  v_textureSlot = a_textureSlot;
}`,
  spriteFragmentSource: `#version 300 es
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
void main() {
  outColor = sampleTexture(v_textureSlot, v_uv) * v_color;
}`,
  meshVertexSource: `#version 300 es
precision mediump float;
in vec2 a_position;
in vec2 a_texcoord;
in vec4 a_color;
in uint a_nodeIndex;
uniform mat3 u_projection;
uniform sampler2D u_transforms;
out vec2 v_uv;
out vec4 v_color;
out vec4 v_tint;
void main() {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  mat3 transform = mat3(m0.x, m0.z, 0.0, m0.y, m0.w, 0.0, m1.x, m1.y, 1.0);
  vec3 world = transform * vec3(a_position, 1.0);
  vec3 clip = u_projection * world;
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_texcoord;
  v_color = a_color;
  v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,
  meshFragmentSource: `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
in vec4 v_tint;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_uv) * v_color * v_tint;
}`,
  particleVertexSource: `#version 300 es
precision mediump float;
in vec2 a_translation;
in vec2 a_scale;
in float a_rotation;
in vec4 a_color;
in vec2 a_uvMin;
in vec2 a_uvMax;
uniform mat3 u_projection;
uniform mat3 u_systemTransform;
uniform vec4 u_localBounds;
out vec2 v_uv;
out vec4 v_color;
void main() {
  vec2 corner;
  if (gl_VertexID == 0) corner = vec2(0.0, 0.0);
  else if (gl_VertexID == 1) corner = vec2(1.0, 0.0);
  else if (gl_VertexID == 2) corner = vec2(1.0, 1.0);
  else corner = vec2(0.0, 1.0);
  vec2 local = mix(u_localBounds.xy, u_localBounds.zw, corner);
  local *= a_scale;
  float angle = radians(a_rotation);
  mat2 rotationMatrix = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  vec2 worldPos = (u_systemTransform * vec3(rotationMatrix * local + a_translation, 1.0)).xy;
  vec3 clip = u_projection * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = mix(a_uvMin, a_uvMax, corner);
  v_color = a_color;
}`,
  particleFragmentSource: `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_uv) * v_color;
}`,
  textVertexSource: `#version 300 es
precision mediump float;
in vec2 a_position;
in vec2 a_texcoord;
in float a_nodeIndex;
uniform mat3 u_projection;
out vec2 v_uv;
void main() {
  float nodeIndex = a_nodeIndex;
  vec3 clip = u_projection * vec3(a_position + vec2(nodeIndex * 0.0), 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_texcoord;
}`,
  textFragmentSource: `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_uv);
}`,
}));

vi.mock('#rendering/webgl2/glsl/sprite.vert', () => ({ default: shaderSources.spriteVertexSource }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', () => ({ default: shaderSources.spriteFragmentSource }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: shaderSources.meshVertexSource }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: shaderSources.meshFragmentSource }));
vi.mock('#rendering/webgl2/glsl/particle.vert', () => ({ default: shaderSources.particleVertexSource }));
vi.mock('#rendering/webgl2/glsl/particle.frag', () => ({ default: shaderSources.particleFragmentSource }));
vi.mock('#rendering/webgl2/glsl/text.vert', () => ({ default: shaderSources.textVertexSource }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', () => ({ default: shaderSources.textFragmentSource }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', () => ({ default: shaderSources.textFragmentSource }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', () => ({ default: shaderSources.textFragmentSource }));

const canvasSize = 64;
const center = canvasSize / 2;
const red: [number, number, number, number] = [255, 0, 0, 255];

const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
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
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: defaultWebGlAttributes,
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

type RGBATuple = [number, number, number, number];

const readPixel = (backend: WebGl2Backend, x: number, y: number): RGBATuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;
  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const readPixelFromTarget = (backend: WebGl2Backend, target: RenderTarget, x: number, y: number): RGBATuple => {
  const previousTarget = backend.renderTarget;
  backend.setRenderTarget(target);
  const pixel = new Uint8Array(4);
  const gl = backend.context;
  gl.readPixels(Math.floor(x), target.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  backend.setRenderTarget(previousTarget);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const expectPixelNear = (actual: RGBATuple, expected: RGBATuple, tolerance = 8): void => {
  for (let index = 0; index < 4; index++) {
    if (Math.abs(actual[index] - expected[index]) > tolerance) {
      throw new Error(`Pixel mismatch at channel ${index}: expected ${expected.toString()}, got ${actual.toString()} (tolerance ${tolerance})`);
    }
  }
};

const createSolidSprite = (color: string): { sprite: Sprite; texture: Texture } => {
  const source = document.createElement('canvas');
  source.width = canvasSize;
  source.height = canvasSize;
  const context = source.getContext('2d');
  if (!context) throw new Error('2D context is required to create test textures.');
  context.fillStyle = color;
  context.fillRect(0, 0, canvasSize, canvasSize);
  const texture = new Texture(source);
  const sprite = new Sprite(texture).setPosition(0, 0);

  return { sprite, texture };
};

describe('RenderPipeline WebGL2 browser pixels', () => {
  test('a target RenderNodePass renders the node into the off-screen texture', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const target = new RenderTexture(canvasSize, canvasSize);
    const { sprite, texture } = createSolidSprite('#ff0000');

    new RenderPipeline().addPass(new RenderNodePass(sprite, { target, clear: Color.black })).execute(context);

    expectPixelNear(readPixelFromTarget(backend, target, center, center), red);

    target.destroy();
    texture.destroy();
    backend.destroy();
  });

  test('golden parity: pipeline target render equals the imperative BackendTargetPass path', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const pipelineTarget = new RenderTexture(canvasSize, canvasSize);
    const imperativeTarget = new RenderTexture(canvasSize, canvasSize);
    const { sprite, texture } = createSolidSprite('#ff0000');

    new RenderPipeline().addPass(new RenderNodePass(sprite, { target: pipelineTarget, clear: Color.black })).execute(context);

    backend.execute(
      new BackendTargetPass(
        passBackend => {
          sprite.render(passBackend);
        },
        { target: imperativeTarget, view: imperativeTarget.view, clearColor: Color.black },
      ),
    );

    const samples: Array<[number, number]> = [
      [4, 4],
      [center, center],
      [canvasSize - 4, canvasSize - 4],
    ];

    for (const [x, y] of samples) {
      const pipelinePixel = readPixelFromTarget(backend, pipelineTarget, x, y);
      const imperativePixel = readPixelFromTarget(backend, imperativeTarget, x, y);
      expectPixelNear(pipelinePixel, imperativePixel, 2);
      expectPixelNear(pipelinePixel, red);
    }

    pipelineTarget.destroy();
    imperativeTarget.destroy();
    texture.destroy();
    backend.destroy();
  });

  test('a disabled pass is skipped — its target keeps its prior contents', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const target = new RenderTexture(canvasSize, canvasSize);
    const { sprite, texture } = createSolidSprite('#ff0000');

    backend.setRenderTarget(target);
    backend.clear(new Color(0, 0, 255));
    backend.setRenderTarget(backend.renderTarget);

    const disabled = new RenderNodePass(sprite, { target, clear: Color.black, enabled: false });
    new RenderPipeline().addPass(disabled).execute(context);

    expectPixelNear(readPixelFromTarget(backend, target, center, center), [0, 0, 255, 255]);

    target.destroy();
    texture.destroy();
    backend.destroy();
  });

  test('a non-target RenderNodePass renders into the active target (canvas)', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const { sprite, texture } = createSolidSprite('#ff0000');

    new RenderPipeline().addPass(new RenderNodePass(sprite, { clear: Color.black })).execute(context);
    backend.flush();

    expectPixelNear(readPixel(backend, center, center), red);

    texture.destroy();
    backend.destroy();
  });

  test('a nested pipeline renders its children to the active target', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const { sprite, texture } = createSolidSprite('#ff0000');

    const inner = new RenderPipeline({ label: 'inner' }).addPass(new RenderNodePass(sprite, { clear: Color.black }));
    new RenderPipeline({ label: 'frame' }).addPass(inner).execute(context);
    backend.flush();

    expectPixelNear(readPixel(backend, center, center), red);

    texture.destroy();
    backend.destroy();
  });
});
