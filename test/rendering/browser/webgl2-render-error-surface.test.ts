/**
 * Render-fail surface (S3 diagnostics, minimal slice) — browser lane, real
 * WebGL2 driver (SwiftShader/ANGLE on Chromium, native GL on Firefox):
 * a custom material with intentionally broken GLSL must surface as a thrown
 * RenderError with code 'shader-compile' and the real driver log in detail.
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { Mesh } from '#rendering/mesh/Mesh';
import { RenderError } from '#rendering/RenderError';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// The browser project rewrites `.vert`/`.frag` imports to empty strings, so the
// default engine shaders the backend compiles on connect must be mocked with
// valid sources (pattern: webgl2-custom-mesh-material.test.ts). Only the mesh
// sources are exercised here; the others mirror the engine's real attribute
// interfaces but are inert.
const canvasSize = 64;
const defaultWebGlAttributes: WebGLContextAttributes = {
  antialias: false,
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

// Valid vertex stage; the failure is isolated to the fragment stage below.
const validVertex = `#version 300 es
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

// Intentionally broken: `vec3 =` assignment to an undeclared identifier and a
// missing semicolon guarantee a compile error on every real GLSL compiler.
const brokenFragment = `#version 300 es
precision mediump float;
in vec2 v_texcoord;
layout(location = 0) out vec4 fragColor;
void main() {
  fragColor = someUndeclaredFunction(v_texcoord)
  this is not glsl at all;
}`;

describe('render-error surface WebGL2 browser', () => {
  test('drawing a mesh with broken custom GLSL throws a structured RenderError from flush', async () => {
    const backend = await createBackend();
    const material = new MeshMaterial({
      shader: new ShaderSource({ glsl: { vertex: validVertex, fragment: brokenFragment } }),
    });
    const mesh = new Mesh({
      vertices: new Float32Array([0, 0, 16, 0, 16, 16, 0, 0, 16, 16, 0, 16]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
      material,
    });

    try {
      mesh.setPosition(24, 24);

      backend.resetStats();
      backend.clear(Color.black);

      let thrown: unknown = null;

      try {
        mesh.render(backend);
        backend.flush();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(RenderError);

      const renderError = thrown as RenderError;

      expect(renderError.code).toBe('shader-compile');
      expect(renderError.message.toLowerCase()).toContain('shader');
      // Real SwiftShader/ANGLE (Chromium) and native (Firefox) info-log text
      // differs — assert loosely on the driver log presence.
      expect(renderError.detail ?? '').toMatch(/ERROR|error/);
    } finally {
      mesh.destroy();
      material.destroy();

      try {
        backend.destroy();
      } catch {
        // destroy() re-flushes the active renderer, which re-binds the broken
        // shader — the same persistent RenderError. Expected here.
      }
    }
  });
});
