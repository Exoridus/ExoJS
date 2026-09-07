import { logger } from '#core/Logger';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import { assertDrawsAllAttachments, assertSingleAttachmentCompose } from '#rendering/multiAttachmentGuard';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderError } from '#rendering/RenderError';
import { Shader } from '#rendering/shader/Shader';
import { Sprite } from '#rendering/sprite/Sprite';

// `?raw` reads the shipped files independently of whichever shader plugin the
// active Vitest project wires in, so this covers the real default sources.
import meshFragment from '../../src/rendering/webgl2/shaders/mesh.frag?raw';
import meshVertex from '../../src/rendering/webgl2/shaders/mesh.vert?raw';
import meshWgsl from '../../src/rendering/webgpu/shaders/mesh.wgsl?raw';

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

// An array output covers one location per element, so this declares two. The
// reflection cannot see them, which is what makes it the "cannot tell" shape.
const unresolvableGlsl = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 fragColor[2];
void main() { fragColor[0] = vec4(1.0); fragColor[1] = vec4(0.0); }
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

const unresolvableWgsl = /* wgsl */ `
@fragment
fn fs_main() -> ImportedOutput {
  return ImportedOutput();
}
`;

const meshWithShader = (glslFragment: string, wgsl: string): Mesh => {
  const shader = new Shader({ glsl: { vertex: GLSL_VERTEX, fragment: glslFragment }, wgsl });
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

    test('does not throw when the declared outputs cover the attachment count', () => {
      const mesh = meshWithShader(dualOutputGlsl, dualOutputWgsl);

      expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGl2)).not.toThrow();
      expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGpu)).not.toThrow();
    });

    test('does not throw when the shader declares more outputs than the target has attachments', () => {
      const mesh = meshWithShader(dualOutputGlsl, dualOutputWgsl);

      expect(() => assertDrawsAllAttachments(mesh, 1, RenderBackendType.WebGl2)).not.toThrow();
    });

    test('throws when the GLSL fragment shader under-declares outputs for WebGL2', () => {
      const mesh = meshWithShader(singleOutputGlsl, dualOutputWgsl);

      expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGl2)).toThrow(/declares 1 output\(s\) but the active render target has 2/);
    });

    test('throws when the WGSL fragment shader under-declares outputs for WebGPU', () => {
      const mesh = meshWithShader(dualOutputGlsl, singleOutputWgsl);

      expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGpu)).toThrow(RenderError);
    });

    // The languages are reflected independently, so an under-declaration in one
    // must not refuse the backend that reads the other.
    test('judges each backend against its own language', () => {
      const mesh = meshWithShader(singleOutputGlsl, dualOutputWgsl);

      expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGpu)).not.toThrow();
    });

    test('carries the backend on the thrown RenderError', () => {
      const mesh = meshWithShader(dualOutputGlsl, singleOutputWgsl);

      expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGpu)).toThrow(
        expect.objectContaining({ code: 'unsupported-format', backendType: RenderBackendType.WebGpu }),
      );
    });

    test('warns instead of throwing when the GLSL outputs cannot be resolved', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const mesh = meshWithShader(unresolvableGlsl, dualOutputWgsl);

      expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGl2)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('Could not determine');
    });

    test('warns instead of throwing when the WGSL outputs cannot be resolved', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const mesh = meshWithShader(dualOutputGlsl, unresolvableWgsl);

      expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGpu)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    // The backend raises its own, more specific error for a missing language;
    // an unresolved-reflection warning would mislabel it.
    test('stays silent when the shader does not carry the active backend language', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const shader = new Shader({ glsl: { vertex: GLSL_VERTEX, fragment: dualOutputGlsl } });
      const mesh = new Mesh({ vertices: new Float32Array([0, 0, 10, 0, 10, 10]), material: new MeshMaterial({ shader }) });

      expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGpu)).not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();
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
      const mesh = meshWithShader(unresolvableGlsl, dualOutputWgsl);

      assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGl2);
      assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGl2);

      expect(received).toHaveLength(1);
      removeSink();
    });

    // The guard's refusal of every material-less drawable rests on the stock
    // mesh/sprite programs writing a single attachment. If one ever grows a
    // second output, that justification has to be revisited here first.
    describe('default mesh material sources', () => {
      test('declare exactly one fragment output in both languages', () => {
        const shader = new Shader({ glsl: { vertex: meshVertex, fragment: meshFragment }, wgsl: meshWgsl });

        expect(shader.fragmentOutputs).toEqual({ glsl: 1, wgsl: 1 });
      });

      test('are refused by both backends against a two-attachment target', () => {
        const shader = new Shader({ glsl: { vertex: meshVertex, fragment: meshFragment }, wgsl: meshWgsl });
        const mesh = new Mesh({ vertices: new Float32Array([0, 0, 10, 0, 10, 10]), material: new MeshMaterial({ shader }) });

        expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGl2)).toThrow(RenderError);
        expect(() => assertDrawsAllAttachments(mesh, 2, RenderBackendType.WebGpu)).toThrow(RenderError);
      });

      test('satisfy a single-attachment target', () => {
        const shader = new Shader({ glsl: { vertex: meshVertex, fragment: meshFragment }, wgsl: meshWgsl });
        const mesh = new Mesh({ vertices: new Float32Array([0, 0, 10, 0, 10, 10]), material: new MeshMaterial({ shader }) });

        expect(() => assertDrawsAllAttachments(mesh, 1, RenderBackendType.WebGl2)).not.toThrow();
        expect(() => assertDrawsAllAttachments(mesh, 1, RenderBackendType.WebGpu)).not.toThrow();
      });
    });
  });

  describe('assertSingleAttachmentCompose', () => {
    test('always throws', () => {
      expect(() => assertSingleAttachmentCompose('AlphaMask', 2, RenderBackendType.WebGl2)).toThrow(RenderError);
    });
  });
});
