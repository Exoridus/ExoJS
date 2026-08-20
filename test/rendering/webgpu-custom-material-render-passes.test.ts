/**
 * WebGPU custom-material batches share a render pass.
 *
 * Every custom-material flush used to end (and submit) its own render pass, so
 * a scene whose sprites carry materials paid one `beginRenderPass` +
 * `queue.submit` per BATCH instead of one per frame. The custom path binds a
 * single base texture, so it also flushes on every base-texture change - the
 * two together turn N sprites over N textures into N render passes.
 *
 * The submit existed to order one hazard: a batch re-uploads its material's
 * user-uniform buffer at offset 0, and two draws in one submit would both read
 * the last write. That is a write-after-read hazard on a specific buffer, not a
 * property of custom batches - an unchanged material writes nothing at all.
 *
 * These tests drive the REAL WebGpuBackend + sprite renderer against a mock
 * device (see webgpuMockEnvironment) and require that batches which write
 * nothing share one pass, while a batch that does rewrite a buffer an earlier
 * draw in the open pass already read still gets its own.
 */

import { Color } from '#core/Color';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { BlendModes } from '#rendering/types';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createCanvasTexture, createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

const renderFrame = (backend: WebGpuBackend, nodes: readonly RenderNode[]): void => {
  backend.resetStats();
  backend.clear(Color.black);

  for (const node of nodes) {
    node.render(backend);
  }

  backend.flush();
};

// Fragment-only WGSL: the engine prepends the canonical sprite vertex module.
const spriteFragmentWgsl = `
struct UserUniforms { color: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let base = sampleBase(input.textureSlot, input.texcoord);
  return vec4<f32>(base.rgb * u_user.color.rgb, 1.0);
}
`.trim();

const createMaterial = (color: Float32Array): SpriteMaterial =>
  new SpriteMaterial({
    shader: new ShaderSource({ wgsl: spriteFragmentWgsl }),
    uniforms: { u_userColor: color },
  });

describe('WebGPU custom-material batches and render passes', () => {
  test('sprites on distinct base textures merge into one draw in one render pass', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const material = createMaterial(new Float32Array([1, 0, 0.5, 1]));
      const nodes = [new Sprite(createCanvasTexture()), new Sprite(createCanvasTexture()), new Sprite(createCanvasTexture())];

      for (const sprite of nodes) {
        sprite.material = material;
      }

      // Warmup: first frame creates the material's buffer and uploads it once.
      renderFrame(backend, nodes);

      const drawMark = environment.drawIndexedCount();

      renderFrame(backend, nodes);

      // The custom path rotates base textures through its slot table, so three
      // distinct textures collapse into a single instanced draw.
      expect(environment.drawIndexedCount()).toBe(drawMark + 1);
      // And nothing wrote a buffer an earlier draw reads, so one pass carries it.
      expect(backend.stats.renderPasses).toBe(1);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('distinct materials with unchanged uniforms share one render pass', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const texture = createCanvasTexture();
      const nodes = [new Sprite(texture), new Sprite(texture), new Sprite(texture)];

      nodes[0]!.material = createMaterial(new Float32Array([1, 0, 0, 1]));
      nodes[1]!.material = createMaterial(new Float32Array([0, 1, 0, 1]));
      nodes[2]!.material = createMaterial(new Float32Array([0, 0, 1, 1]));

      renderFrame(backend, nodes);

      const drawMark = environment.drawIndexedCount();

      renderFrame(backend, nodes);

      expect(environment.drawIndexedCount()).toBe(drawMark + 3);
      expect(backend.stats.renderPasses).toBe(1);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a default batch and a custom batch share one render pass', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const texture = createCanvasTexture();
      const plain = new Sprite(texture);
      const custom = new Sprite(createCanvasTexture());

      custom.material = createMaterial(new Float32Array([1, 1, 0, 1]));

      // Warmup: the first frame legitimately splits the pass, because a texture
      // sampled by a batch is uploaded lazily and that upload would retroactively
      // change draws already recorded.
      renderFrame(backend, [plain, custom, new Sprite(texture)]);
      renderFrame(backend, [plain, custom, new Sprite(texture)]);

      expect(backend.stats.renderPasses).toBe(1);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a material rewritten between two of its own batches gets a fresh pass for the second', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const material = createMaterial(new Float32Array([1, 0, 0, 1]));
      const texture = createCanvasTexture();
      const nodes = [new Sprite(texture), new Sprite(texture), new Sprite(texture)];

      // Distinct blend modes, so each sprite starts a new batch of the SAME
      // material - a base-texture change no longer does that now that the
      // custom path rotates base textures through its slot table.
      nodes[0]!.blendMode = BlendModes.Normal;
      nodes[1]!.blendMode = BlendModes.Additive;
      nodes[2]!.blendMode = BlendModes.Multiply;

      for (const sprite of nodes) {
        sprite.material = material;
      }

      // Warmup, so the lazy texture upload is not what splits the pass below.
      renderFrame(backend, nodes);

      // Rendering the next sprite flushes the previous batch. Mutating the
      // uniforms between the second and third render means the flush of the
      // SECOND batch rewrites the very buffer the FIRST batch's draw - already
      // recorded into the open pass - reads.
      backend.resetStats();
      backend.clear(Color.black);
      nodes[0]!.render(backend);
      nodes[1]!.render(backend);
      material.uniforms.u_userColor = new Float32Array([0, 1, 0, 1]);
      nodes[2]!.render(backend);
      backend.flush();

      expect(backend.stats.renderPasses).toBe(2);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
