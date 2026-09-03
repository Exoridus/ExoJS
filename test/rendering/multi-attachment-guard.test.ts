import { logger } from '#core/Logger';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { Mesh } from '#rendering/mesh/Mesh';
import { assertDrawsAllAttachments, assertSingleAttachmentCompose } from '#rendering/multiAttachmentGuard';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderError } from '#rendering/RenderError';
import { Sprite } from '#rendering/sprite/Sprite';

const GLSL_VERTEX = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const singleOutputGlsl = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }
`;

const dualOutputGlsl = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragNormal;
void main() {}
`;

const singleOutputWgsl = /* wgsl */ `
@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0);
}
`;

const dualOutputWgsl = /* wgsl */ `
struct FragmentOutput {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
};

@fragment
fn fs_main() -> FragmentOutput {
  return FragmentOutput(vec4<f32>(1.0), vec4<f32>(0.0));
}
`;

const meshWithShader = (glslFragment: string, wgsl: string): Mesh => {
  const shader = new ShaderSource({ glsl: { vertex: GLSL_VERTEX, fragment: glslFragment }, wgsl });
  const material = new MeshMaterial({ shader });

  return new Mesh({ vertices: new Float32Array([0, 0, 10, 0, 10, 10]), material });
};

describe('multiAttachmentGuard', () => {
  afterEach(() => {
    logger._resetOnce();
    vi.restoreAllMocks();
  });

  describe('assertDrawsAllAttachments', () => {
    test('throws for a plain Sprite (no material)', () => {
      const sprite = new Sprite(null);

      expect(() => assertDrawsAllAttachments(sprite, 2, RenderBackendType.WebGl2)).toThrow(RenderError);
    });

    test('does not throw for a Mesh with a material', () => {
      const mesh = meshWithShader(dualOutputGlsl, dualOutputWgsl);

      expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGl2)).not.toThrow();
    });

    test('warns once when the GLSL fragment shader under-declares outputs for WebGL2', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const mesh = meshWithShader(singleOutputGlsl, dualOutputWgsl);

      assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGl2);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('declares 1 output');
    });

    test('warns once when the WGSL fragment shader under-declares outputs for WebGPU', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const mesh = meshWithShader(dualOutputGlsl, singleOutputWgsl);

      assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGpu);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    test('does not warn when the declared outputs cover the attachment count', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const mesh = meshWithShader(dualOutputGlsl, dualOutputWgsl);

      assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGl2);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('only warns once for the same shader and attachment count', () => {
      // `once` dedup happens inside Logger, one layer below `warn()` itself, so
      // asserting on a sink (what actually reaches a consumer) is what proves
      // dedup - a spy on `warn()` would see both calls regardless.
      const received: unknown[] = [];
      const removeSink = logger.addSink(entry => received.push(entry));
      const mesh = meshWithShader(singleOutputGlsl, dualOutputWgsl);

      assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGl2);
      assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGl2);

      expect(received).toHaveLength(1);
      removeSink();
    });
  });

  describe('assertSingleAttachmentCompose', () => {
    test('always throws', () => {
      expect(() => assertSingleAttachmentCompose('AlphaMask', 2, RenderBackendType.WebGl2)).toThrow(RenderError);
    });
  });
});
