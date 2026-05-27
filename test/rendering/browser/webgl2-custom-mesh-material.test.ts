import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import { Container } from '@/rendering/Container';
import { Geometry } from '@/rendering/geometry/Geometry';
import { MeshMaterial } from '@/rendering/material/MeshMaterial';
import { ShaderSource } from '@/rendering/material/ShaderSource';
import { Mesh } from '@/rendering/mesh/Mesh';
import type { RenderNode } from '@/rendering/RenderNode';
import { Texture } from '@/rendering/texture/Texture';
import { BlendModes } from '@/rendering/types';
import { WebGl2Backend } from '@/rendering/webgl2/WebGl2Backend';

// The browser project rewrites `.vert`/`.frag` imports to empty strings, so the
// default engine shaders the backend compiles on connect must be mocked with
// valid sources. The mesh sources keep the REAL pinned attribute locations
// (0/1/2) so the shared VAO matches the custom material's `layout(location=…)`.
// Every default renderer is connected on backend.initialize() and extracts its
// declared attributes, so each default shader needs valid sources with the
// exact attributes its renderer expects. The mesh sources keep the REAL pinned
// attribute locations (0/1/2) so the shared VAO matches the custom material's
// `layout(location=…)`; the sprite/particle/text sources mirror the engine's
// real attribute interfaces but are otherwise inert (never drawn here).
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
precision lowp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
layout(location = 6) in uint a_nodeIndex;
uniform mat3 u_projection;
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
  gl_Position = vec4((u_projection * transform * vec3(a_position, 1.0)).xy, 0.0, 1.0);
  v_texcoord = a_texcoord;
  v_color = a_color;
  v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,

  meshFragmentSource: `#version 300 es
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

type RgbaTuple = readonly [number, number, number, number];

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

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 5): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(tolerance);
  }
};

const createSolidTexture = (r: number, g: number, b: number, a = 255): Texture => {
  const source = document.createElement('canvas');

  source.width = 8;
  source.height = 8;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  context.fillRect(0, 0, source.width, source.height);

  return new Texture(source);
};

// Custom material: samples a user-bound texture (slot 1) and modulates it by a
// user vec4 uniform. Auto-binds u_projection/u_translation place the mesh; the
// mesh's own u_texture/u_tint are intentionally unused.
const customVertex = `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
uniform mat3 u_projection;
uniform mat3 u_translation;
out vec2 v_texcoord;
void main() {
  gl_Position = vec4((u_projection * u_translation * vec3(a_position, 1.0)).xy, 0.0, 1.0);
  v_texcoord = a_texcoord;
}`;

const customFragment = `#version 300 es
precision mediump float;
uniform sampler2D u_pattern;
uniform vec4 u_userColor;
in vec2 v_texcoord;
layout(location = 0) out vec4 fragColor;
void main() {
  vec4 sampled = texture(u_pattern, v_texcoord);
  fragColor = vec4(sampled.rgb * u_userColor.rgb, 1.0);
}`;

const createQuadMesh = (size: number, material: MeshMaterial): Mesh =>
  new Mesh({
    vertices: new Float32Array([0, 0, size, 0, size, size, 0, 0, size, size, 0, size]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
    material,
  });

const createQuadGeometry = (size: number): Geometry => {
  const stride = 20;
  const vertexCount = 6;
  const data = new ArrayBuffer(vertexCount * stride);
  const view = new DataView(data);
  const positions = [
    [0, 0, 0, 0],
    [size, 0, 1, 0],
    [size, size, 1, 1],
    [0, 0, 0, 0],
    [size, size, 1, 1],
    [0, size, 0, 1],
  ] as const;

  for (let i = 0; i < vertexCount; i++) {
    const base = i * stride;
    const [x, y, u, v] = positions[i];

    view.setFloat32(base + 0, x, true);
    view.setFloat32(base + 4, y, true);
    view.setFloat32(base + 8, u, true);
    view.setFloat32(base + 12, v, true);
    view.setUint8(base + 16, 255);
    view.setUint8(base + 17, 255);
    view.setUint8(base + 18, 255);
    view.setUint8(base + 19, 255);
  }

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 16 },
    ],
    vertexData: data,
    stride,
    usage: 'static',
  });
};

const instancedBatchVertex = `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
layout(location = 6) in uint a_nodeIndex;
uniform mat3 u_projection;
uniform sampler2D u_transforms;
out vec2 v_texcoord;
out vec4 v_tint;
void main() {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  mat3 transform = mat3(
    m0.x, m0.z, 0.0,
    m0.y, m0.w, 0.0,
    m1.x, m1.y, 1.0
  );
  gl_Position = vec4((u_projection * transform * vec3(a_position, 1.0)).xy, 0.0, 1.0);
  v_texcoord = a_texcoord;
  v_tint = texelFetch(u_transforms, ivec2(2, row), 0) * a_color;
}`;

const instancedBatchFragment = `#version 300 es
precision mediump float;
uniform sampler2D u_texture;
uniform vec4 u_userColor;
in vec2 v_texcoord;
in vec4 v_tint;
out vec4 fragColor;
void main() {
  vec4 sampled = texture(u_texture, v_texcoord) * v_tint;
  fragColor = vec4(sampled.rgb * u_userColor.rgb, sampled.a);
}`;

describe('custom MeshMaterial WebGL2 browser', () => {
  test('binds a user uniform and a user texture into a custom mesh shader', async () => {
    const backend = await createBackend();
    // Mid-gray pattern proves the texture is actually sampled (not a default
    // white/black fallback); the per-channel uniform proves uniform binding.
    const pattern = createSolidTexture(128, 128, 128);
    const material = new MeshMaterial({
      shader: new ShaderSource({ glsl: { vertex: customVertex, fragment: customFragment } }),
      uniforms: { u_userColor: [1, 0, 0.5, 1] as const },
      textures: { u_pattern: pattern },
    });
    const mesh = createQuadMesh(16, material);

    try {
      mesh.setPosition(24, 24);

      render(backend, mesh);

      // sampled (0.5,0.5,0.5) * userColor (1,0,0.5) → (0.5, 0, 0.25) → (128,0,64).
      expectPixelNear(readPixel(backend, 32, 32), [128, 0, 64, 255]);
      // Outside the quad stays clear-black.
      expectPixelNear(readPixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      mesh.destroy();
      material.destroy();
      pattern.destroy();
      backend.destroy();
    }
  });

  test('reflects mutated user uniforms on the next frame', async () => {
    const backend = await createBackend();
    const pattern = createSolidTexture(255, 255, 255);
    const material = new MeshMaterial({
      shader: new ShaderSource({ glsl: { vertex: customVertex, fragment: customFragment } }),
      uniforms: { u_userColor: [1, 0, 0, 1] as const },
      textures: { u_pattern: pattern },
    });
    const mesh = createQuadMesh(16, material);

    try {
      mesh.setPosition(24, 24);

      render(backend, mesh);
      expectPixelNear(readPixel(backend, 32, 32), [255, 0, 0, 255]);

      material.setUniform('u_userColor', [0, 0, 1, 1] as const);
      render(backend, mesh);
      expectPixelNear(readPixel(backend, 32, 32), [0, 0, 255, 255]);
    } finally {
      mesh.destroy();
      material.destroy();
      pattern.destroy();
      backend.destroy();
    }
  });

  test('batches compatible static-geometry mesh materials into one draw call', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(255, 255, 255);
    const geometry = createQuadGeometry(12);
    const material = new MeshMaterial({
      shader: new ShaderSource({ glsl: { vertex: instancedBatchVertex, fragment: instancedBatchFragment } }),
      uniforms: { u_userColor: [1, 1, 1, 1] as const },
    });
    const root = new Container();
    const a = new Mesh({ geometry, material, texture });
    const b = new Mesh({ geometry, material, texture });

    try {
      a.setPosition(8, 16);
      b.setPosition(28, 16);
      root.addChild(a, b);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readPixel(backend, 12, 20), [255, 255, 255, 255]);
      expectPixelNear(readPixel(backend, 32, 20), [255, 255, 255, 255]);
    } finally {
      root.destroy();
      material.destroy();
      geometry.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('does not batch across different groupIndex values', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(255, 255, 255);
    const geometry = createQuadGeometry(12);
    const material = new MeshMaterial({
      shader: new ShaderSource({ glsl: { vertex: instancedBatchVertex, fragment: instancedBatchFragment } }),
      uniforms: { u_userColor: [1, 1, 1, 1] as const },
    });
    const root = new Container();
    const a = new Mesh({ geometry, material, texture });
    const b = new Mesh({ geometry, material, texture });

    try {
      a.setPosition(8, 16);
      b.setPosition(28, 16);
      a.zIndex = 0;
      b.zIndex = 1;
      root.addChild(a, b);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      root.destroy();
      material.destroy();
      geometry.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('does not batch across different Geometry instances', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(255, 255, 255);
    const leftGeometry = createQuadGeometry(12);
    const rightGeometry = createQuadGeometry(12);
    const material = new MeshMaterial({
      shader: new ShaderSource({ glsl: { vertex: instancedBatchVertex, fragment: instancedBatchFragment } }),
      uniforms: { u_userColor: [1, 1, 1, 1] as const },
    });
    const root = new Container();
    const a = new Mesh({ geometry: leftGeometry, material, texture });
    const b = new Mesh({ geometry: rightGeometry, material, texture });

    try {
      a.setPosition(8, 16);
      b.setPosition(28, 16);
      root.addChild(a, b);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      root.destroy();
      material.destroy();
      leftGeometry.destroy();
      rightGeometry.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('does not batch across different material pipeline keys', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(255, 255, 255);
    const geometry = createQuadGeometry(12);
    const sharedShader = new ShaderSource({ glsl: { vertex: instancedBatchVertex, fragment: instancedBatchFragment } });
    const normalMaterial = new MeshMaterial({
      shader: sharedShader,
      uniforms: { u_userColor: [1, 1, 1, 1] as const },
      blendMode: BlendModes.Normal,
    });
    const additiveMaterial = new MeshMaterial({
      shader: sharedShader,
      uniforms: { u_userColor: [1, 1, 1, 1] as const },
      blendMode: BlendModes.Additive,
    });
    const root = new Container();
    const a = new Mesh({ geometry, material: normalMaterial, texture });
    const b = new Mesh({ geometry, material: additiveMaterial, texture });

    try {
      a.setPosition(8, 16);
      b.setPosition(28, 16);
      root.addChild(a, b);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      root.destroy();
      normalMaterial.destroy();
      additiveMaterial.destroy();
      geometry.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('does not batch across different material bind keys', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(255, 255, 255);
    const geometry = createQuadGeometry(12);
    const patternA = createSolidTexture(255, 255, 255);
    const patternB = createSolidTexture(255, 0, 0);
    const sharedShader = new ShaderSource({ glsl: { vertex: instancedBatchVertex, fragment: instancedBatchFragment } });
    const leftMaterial = new MeshMaterial({
      shader: sharedShader,
      uniforms: { u_userColor: [1, 1, 1, 1] as const },
      textures: { u_unusedPattern: patternA },
    });
    const rightMaterial = new MeshMaterial({
      shader: sharedShader,
      uniforms: { u_userColor: [1, 1, 1, 1] as const },
      textures: { u_unusedPattern: patternB },
    });
    const root = new Container();
    const a = new Mesh({ geometry, material: leftMaterial, texture });
    const b = new Mesh({ geometry, material: rightMaterial, texture });

    try {
      a.setPosition(8, 16);
      b.setPosition(28, 16);
      root.addChild(a, b);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      root.destroy();
      leftMaterial.destroy();
      rightMaterial.destroy();
      geometry.destroy();
      texture.destroy();
      patternA.destroy();
      patternB.destroy();
      backend.destroy();
    }
  });
});
