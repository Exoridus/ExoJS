import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import type { RenderTarget } from '@/rendering/RenderTarget';
import { RenderTargetPass } from '@/rendering/RenderTargetPass';
import { Sprite } from '@/rendering/sprite/Sprite';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { Texture } from '@/rendering/texture/Texture';
import { View } from '@/rendering/View';
import { WebGl2Backend } from '@/rendering/webgl2/WebGl2Backend';

const shaderSources = vi.hoisted(() => ({
  spriteVertexSource: `#version 300 es
precision mediump float;
in vec4 a_localBounds;
in vec3 a_transformAB;
in vec3 a_transformCD;
in vec4 a_uvBounds;
in vec4 a_color;
in uint a_textureSlot;
uniform mat3 u_projection;
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
  vec2 world = vec2(dot(vec3(local, 1.0), a_transformAB), dot(vec3(local, 1.0), a_transformCD));
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

vi.mock('@/rendering/webgl2/glsl/sprite.vert', () => ({ default: shaderSources.spriteVertexSource }));
vi.mock('@/rendering/webgl2/glsl/sprite.frag', () => ({ default: shaderSources.spriteFragmentSource }));
vi.mock('@/rendering/webgl2/glsl/mesh.vert', () => ({ default: shaderSources.meshVertexSource }));
vi.mock('@/rendering/webgl2/glsl/mesh.frag', () => ({ default: shaderSources.meshFragmentSource }));
vi.mock('@/rendering/webgl2/glsl/particle.vert', () => ({ default: shaderSources.particleVertexSource }));
vi.mock('@/rendering/webgl2/glsl/particle.frag', () => ({ default: shaderSources.particleFragmentSource }));
vi.mock('@/rendering/webgl2/glsl/text.vert', () => ({ default: shaderSources.textVertexSource }));
vi.mock('@/rendering/webgl2/glsl/text-color.frag', () => ({ default: shaderSources.textFragmentSource }));
vi.mock('@/rendering/webgl2/glsl/text-msdf.frag', () => ({ default: shaderSources.textFragmentSource }));
vi.mock('@/rendering/webgl2/glsl/text-sdf.frag', () => ({ default: shaderSources.textFragmentSource }));

type RGBATuple = [number, number, number, number];

const canvasSize = 64;
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
  return backend;
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RGBATuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;
  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const readPixelsFromTarget = (backend: WebGl2Backend, target: RenderTarget, x: number, y: number): RGBATuple => {
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

const createSolidTexture = (color: string, width = 16, height = 16): Texture => {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const context = source.getContext('2d');
  if (!context) throw new Error('2D context is required to create test textures.');
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return new Texture(source);
};

// A sprite that covers the whole canvas/target, so leak assertions are immune
// to render-target Y orientation: every pixel carries the same colour.
const createFullScreenSprite = (color: string): { sprite: Sprite; texture: Texture } => {
  const texture = createSolidTexture(color, canvasSize, canvasSize);
  const sprite = new Sprite(texture);

  sprite.setPosition(0, 0);

  return { sprite, texture };
};

describe('RenderTo WebGL2 browser', () => {
  test('clears, reads back, and correctly preserves RenderTexture contents', async () => {
    const backend = await createBackend();
    const rtSize = 32;
    const target = new RenderTexture(rtSize, rtSize);

    backend.setRenderTarget(target);
    backend.clear(Color.red);
    backend.setRenderTarget(backend.renderTarget);

    const pixel = readPixelsFromTarget(backend, target, 4, 4);
    expectPixelNear(pixel, [255, 0, 0, 255]);

    target.destroy();
    backend.destroy();
  });

  test('render target and view are restored after renderTo pattern', async () => {
    const backend = await createBackend();
    const rtSize = 32;
    const target = new RenderTexture(rtSize, rtSize);

    const prevTarget = backend.renderTarget;
    const prevView = backend.view;

    backend.setRenderTarget(target);
    backend.setView(target.view);
    backend.clear(Color.transparentBlack);

    // Restore state.
    backend.setRenderTarget(prevTarget);
    backend.setView(prevView);

    expect(backend.renderTarget).toBe(prevTarget);
    expect(backend.view).toBe(prevView);

    // Root canvas should be unaffected (black from init).
    const rootPixel = readPixel(backend, 8, 8);
    expectPixelNear(rootPixel, [0, 0, 0, 255]);

    target.destroy();
    backend.destroy();
  });

  test('renderTo renders a red sprite into a RenderTexture via raw GL draw', async () => {
    const backend = await createBackend();
    const gl = backend.context;
    const rtSize = 32;
    const target = new RenderTexture(rtSize, rtSize);

    backend.setRenderTarget(target);
    backend.setView(target.view);

    // Use raw GL draw to verify framebuffer write capability.
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, '#version 300 es\nprecision mediump float;\nvoid main() {\n  float x=float((gl_VertexID&1)<<2)-1.0;\n  float y=float((gl_VertexID&2)<<1)-1.0;\n  gl_Position=vec4(x,y,0.0,1.0);\n}');
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, '#version 300 es\nprecision mediump float;\nout vec4 c;\nvoid main(){c=vec4(1.0,0.0,0.0,1.0);}');
    gl.compileShader(fs);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.viewport(0, 0, rtSize, rtSize);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteProgram(prog);

    backend.setRenderTarget(backend.renderTarget);

    const pixel = readPixelsFromTarget(backend, target, rtSize / 2, rtSize / 2);
    expectPixelNear(pixel, [255, 0, 0, 255]);

    target.destroy();
    backend.destroy();
  });

  test('RenderTargetPass keeps its callback batch in the target — no cross-target leak', async () => {
    const backend = await createBackend();
    const target = new RenderTexture(canvasSize, canvasSize);
    const { sprite: spriteA, texture: textureA } = createFullScreenSprite('#ff0000');
    const { sprite: spriteB, texture: textureB } = createFullScreenSprite('#00ff00');
    const samples = [[4, 4], [32, 32], [60, 60]] as const;

    try {
      // A is buffered into the root, then a pass draws B into the off-screen
      // target. The pass restores the target via setRenderTarget without any
      // manual flush, so correctness rests entirely on the backend invariant.
      backend.clear(Color.black);
      spriteA.render(backend);

      backend.execute(
        new RenderTargetPass(
          (passBackend) => {
            spriteB.render(passBackend);
          },
          { target, view: target.view, clearColor: Color.transparentBlack },
        ),
      );

      backend.flush();

      // Root must stay fully red: B (green) must NOT have leaked back into it.
      for (const [x, y] of samples) {
        expectPixelNear(readPixel(backend, x, y), [255, 0, 0, 255]);
      }

      // Target must be fully green: B landed here and A (red) did NOT leak in.
      for (const [x, y] of samples) {
        expectPixelNear(readPixelsFromTarget(backend, target, x, y), [0, 255, 0, 255]);
      }
    } finally {
      textureA.destroy();
      textureB.destroy();
      target.destroy();
      backend.destroy();
    }
  });

  test('sprite captured into RenderTexture via backend.draw inside an outer draw-plan', async () => {
    const backend = await createBackend();
    const cacheTexture = new RenderTexture(32, 32);
    const sourceTexture = createSolidTexture('#ff0000', 16, 16);
    const captureSprite = new Sprite(sourceTexture);
    captureSprite.setPosition(16, 16);
    const captureView = new View(16, 16, 32, 32);

    type HookedBackend = WebGl2Backend & { _beginDrawPlan(n: number): void; _endDrawPlan(): void; _prepareDrawCommand(cmd: { drawable: Sprite; nodeIndex: number }): void };
    const hooked = backend as HookedBackend;

    try {
      backend.clear(Color.black);
      hooked._beginDrawPlan(1);

      try {
        backend.execute(
          new RenderTargetPass(
            (passBackend) => {
              (passBackend as HookedBackend)._prepareDrawCommand({ drawable: captureSprite, nodeIndex: 0 });
              passBackend.draw(captureSprite);
            },
            { target: cacheTexture, view: captureView, clearColor: Color.transparentBlack },
          ),
        );
      } finally {
        hooked._endDrawPlan();
      }

      let redCount = 0;
      for (let y = 0; y < 32; y += 4) {
        for (let x = 0; x < 32; x += 4) {
          const p = readPixelsFromTarget(backend, cacheTexture, x, y);
          if (p[0] > 200 && p[1] < 50) redCount++;
        }
      }
      expect(redCount).toBeGreaterThanOrEqual(8);
      expect(backend.stats.drawCalls).toBeGreaterThanOrEqual(1);
    } finally {
      sourceTexture.destroy();
      cacheTexture.destroy();
      captureView.destroy();
      backend.destroy();
    }
  });

  test('cacheAsBitmap capture+composite path keeps pixels in the right targets', async () => {
    const backend = await createBackend();
    const cacheTexture = new RenderTexture(16, 16);
    const sourceTexture = createSolidTexture('#ff0000', 16, 16);
    const captureSprite = new Sprite(sourceTexture);
    captureSprite.setPosition(16, 16);
    captureSprite.cacheAsBitmap = true;
    const captureView = new View(24, 24, 16, 16);

    type HookedBackend = WebGl2Backend & { _beginDrawPlan(n: number): void; _endDrawPlan(): void; _prepareDrawCommand(cmd: { drawable: Sprite; nodeIndex: number }): void };
    const hooked = backend as HookedBackend;

    const cacheSpriteForComposite = new Sprite(cacheTexture);
    cacheSpriteForComposite.setPosition(16, 16);

    try {
      backend.clear(Color.black);
      hooked._beginDrawPlan(1);
      try {
        backend.execute(
          new RenderTargetPass(
            (passBackend) => {
              (passBackend as HookedBackend)._prepareDrawCommand({ drawable: captureSprite, nodeIndex: 0 });
              passBackend.draw(captureSprite);
            },
            { target: cacheTexture, view: captureView, clearColor: Color.transparentBlack },
          ),
        );

        backend.draw(cacheSpriteForComposite);
      } finally {
        hooked._endDrawPlan();
      }
      backend.flush();

      let redCount = 0;
      for (let y = 0; y < 16; y += 2) {
        for (let x = 0; x < 16; x += 2) {
          const p = readPixelsFromTarget(backend, cacheTexture, x, y);
          if (p[0] > 200 && p[1] < 50) redCount++;
        }
      }
      expect(redCount).toBeGreaterThanOrEqual(48);

      const rootPixel = readPixel(backend, 20, 20);
      expectPixelNear(rootPixel, [255, 0, 0, 255]);
    } finally {
      sourceTexture.destroy();
      cacheTexture.destroy();
      captureView.destroy();
      backend.destroy();
    }
  });

  test('cacheAsBitmap sprite lands in the RenderTexture via RenderTargetPass', async () => {
    const backend = await createBackend();
    const cacheTexture = new RenderTexture(16, 16);
    const sourceTexture = createSolidTexture('#ff0000', 16, 16);
    const captureSprite = new Sprite(sourceTexture);
    captureSprite.setPosition(16, 16);
    captureSprite.cacheAsBitmap = true;
    const captureView = new View(24, 24, 16, 16);

    try {
      backend.clear(Color.black);
      backend.execute(
        new RenderTargetPass(
          (passBackend) => {
            passBackend.draw(captureSprite);
          },
          { target: cacheTexture, view: captureView, clearColor: Color.transparentBlack },
        ),
      );

      let redCount = 0;
      for (let y = 0; y < 16; y += 2) {
        for (let x = 0; x < 16; x += 2) {
          const p = readPixelsFromTarget(backend, cacheTexture, x, y);
          if (p[0] > 200 && p[1] < 50) redCount++;
        }
      }
      expect(redCount).toBeGreaterThanOrEqual(48);
      expect(backend.stats.drawCalls).toBeGreaterThanOrEqual(1);
    } finally {
      sourceTexture.destroy();
      cacheTexture.destroy();
      captureView.destroy();
      backend.destroy();
    }
  });
});

