/**
 * WebGL2: depth written by a mesh material and read back as a texture.
 *
 * Two quads with depth-writing materials at different clip-space z go into a
 * depth-enabled RenderTexture; a second pass samples that target's
 * `depthTexture` and writes it out as greyscale. What is asserted is the
 * ORDERING - nearer is darker, untouched stays at the far plane - because the
 * stored value is the backend's own window-space mapping and differs from
 * WebGPU's for the same z.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import { RenderingContext } from '#rendering/RenderingContext';
import { Shader } from '#rendering/shader/Shader';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';

const canvasSize = 64;

/** A material whose vertex stage pins every fragment at one clip-space depth. */
const depthWriter = (z: number): MeshMaterial =>
  new MeshMaterial({
    writesDepth: true,
    shader: new Shader({
      glsl: {
        vertex: `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_position;
uniform mat3 u_projection;
uniform mat3 u_translation;
void main() {
  gl_Position = vec4((u_projection * u_translation * vec3(a_position, 1.0)).xy, ${z.toFixed(2)}, 1.0);
}`,
        fragment: `#version 300 es
precision mediump float;
layout(location = 0) out vec4 fragColor;
void main() { fragColor = vec4(0.0, 0.0, 0.0, 1.0); }`,
      },
    }),
  });

/** Reads the depth attachment of `source` and writes it out as greyscale. */
const depthReader = (source: RenderTexture): MeshMaterial =>
  new MeshMaterial({
    shader: new Shader({
      glsl: {
        vertex: `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
uniform mat3 u_projection;
uniform mat3 u_translation;
out vec2 v_texcoord;
void main() {
  gl_Position = vec4((u_projection * u_translation * vec3(a_position, 1.0)).xy, 0.0, 1.0);
  v_texcoord = a_texcoord;
}`,
        fragment: `#version 300 es
precision mediump float;
uniform sampler2D u_depth;
in vec2 v_texcoord;
layout(location = 0) out vec4 fragColor;
void main() {
  float depth = texture(u_depth, v_texcoord).r;
  fragColor = vec4(depth, depth, depth, 1.0);
}`,
      },
    }),
    textures: { u_depth: source.depthTexture! },
  });

const quad = (width: number, height: number, material: MeshMaterial): Mesh =>
  new Mesh({
    vertices: new Float32Array([0, 0, width, 0, width, height, 0, 0, width, height, 0, height]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
    material,
  });

describe('WebGL2 depth attachment', () => {
  test('a depth-writing material fills the attachment and a later pass samples it', async () => {
    const backend: WebGl2Backend = await createWebGl2TestBackend(canvasSize);
    const target = new RenderTexture(canvasSize, canvasSize, { depth: true });
    const context = new RenderingContext(backend);

    const nearMaterial = depthWriter(0.1);
    const farMaterial = depthWriter(0.9);
    const near = quad(24, canvasSize, nearMaterial);
    const far = quad(24, canvasSize, farMaterial);
    const scene = new Container();

    far.setPosition(24, 0);
    scene.addChild(near, far);

    const readerMaterial = depthReader(target);
    const display = quad(canvasSize, canvasSize, readerMaterial);

    try {
      context.renderTo(scene, { target, clear: Color.black });
      backend.flush();

      renderWebGl2Once(backend, display);

      const nearPixel = readWebGl2Pixel(backend, 12, 32);
      const farPixel = readWebGl2Pixel(backend, 36, 32);
      const untouched = readWebGl2Pixel(backend, 56, 32);

      // Nearer geometry is the smaller depth, and the strip nothing covered
      // still holds the clear value at the far plane.
      expect(nearPixel[0]).toBeLessThan(farPixel[0]);
      expect(farPixel[0]).toBeLessThan(untouched[0]);
      expect(untouched[0]).toBe(255);
    } finally {
      display.destroy();
      readerMaterial.destroy();
      scene.destroy();
      nearMaterial.destroy();
      farMaterial.destroy();
      target.destroy();
      backend.destroy();
    }
  });

  test('a target without the opt-in reports no depth texture and still draws', async () => {
    const backend: WebGl2Backend = await createWebGl2TestBackend(canvasSize);
    const target = new RenderTexture(canvasSize, canvasSize);
    const context = new RenderingContext(backend);
    const material = depthWriter(0.5);
    const mesh = quad(24, 24, material);

    try {
      expect(target.depthTexture).toBeNull();

      context.renderTo(mesh, { target, clear: Color.black });
      backend.flush();

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
    } finally {
      mesh.destroy();
      material.destroy();
      target.destroy();
      backend.destroy();
    }
  });
});
