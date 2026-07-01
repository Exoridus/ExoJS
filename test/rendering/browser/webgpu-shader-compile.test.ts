/// <reference types="@webgpu/types" />

/**
 * Real WGSL shader compile coverage.
 *
 * Mirrors `webgl2-shader-compile.test.ts` (real GLSL compile coverage) for the
 * WebGPU renderer path. Unlike `gl.compileShader`, WGSL compilation is async
 * and non-throwing: `device.createShaderModule({ code })` never throws on a
 * syntax error — the error only surfaces later, off the main thread, via
 * `shaderModule.getCompilationInfo()`. Nothing else in the test suite calls
 * that API, so a WGSL syntax error anywhere in the WebGPU renderer path would
 * ship completely silently.
 *
 * The sources under test are the actual module-level WGSL string constants
 * feeding each renderer's `createShaderModule` call (exported — and, for the
 * one call site that had it inline, hoisted — specifically so this spec can
 * import them directly instead of duplicating the WGSL text). A source edit
 * in any of those files is automatically covered here; no `.wgsl` files or
 * `import.meta.glob` are involved because these are TS string constants, not
 * separate assets.
 *
 * Two `createShaderModule` call sites are intentionally NOT covered:
 *  - `WebGpuComputePipeline.create` takes an arbitrary caller-supplied `wgsl`
 *    string as an option; it has no fixed source of its own, and currently no
 *    caller inside `src/` (it is exported SDK surface for extension authors).
 *  - `WebGpuSpriteRenderer`'s custom-material path and
 *    `WebGpuMeshRenderer._getOrCreateCustomShaderResources` compile
 *    user-authored `material.shader.wgsl` at runtime — there is no
 *    engine-owned fixed string to assert against. `spriteVertexWgsl`, the
 *    fixed prelude those custom-material shaders are prepended with, IS
 *    covered below.
 *
 * Skips gracefully when WebGPU is unavailable, matching every other browser
 * spec in this directory. Run via: pnpm test:browser:webgpu
 */

import { spriteVertexWgsl } from '#rendering/sprite/spriteMaterialSources';
import { compositorShaderSource as backdropBlendCompositorWgsl } from '#rendering/webgpu/WebGpuBackdropBlendCompositor';
import { mipmapWgsl } from '#rendering/webgpu/WebGpuBackend';
import { compositorShaderSource as maskCompositorWgsl } from '#rendering/webgpu/WebGpuMaskCompositor';
import { instancedMeshShaderSource, meshShaderSource } from '#rendering/webgpu/WebGpuMeshRenderer';
import { nineSliceShaderSource } from '#rendering/webgpu/WebGpuNineSliceSpriteRenderer';
import { commonWgsl, geoPathEntries, shaderPathEntries } from '#rendering/webgpu/WebGpuRepeatingSpriteRenderer';
import { spriteShaderSource } from '#rendering/webgpu/WebGpuSpriteRenderer';
import { stencilWriteShaderSource } from '#rendering/webgpu/WebGpuStencilClipper';
import { textShaderSource } from '#rendering/webgpu/WebGpuTextRenderer';

interface ShaderEntry {
  readonly name: string;
  readonly source: string;
}

const shaders: readonly ShaderEntry[] = [
  { name: 'WebGpuBackend mipmap pipeline', source: mipmapWgsl },
  { name: 'WebGpuBackdropBlendCompositor', source: backdropBlendCompositorWgsl },
  { name: 'WebGpuMaskCompositor', source: maskCompositorWgsl },
  { name: 'WebGpuMeshRenderer (default)', source: meshShaderSource },
  { name: 'WebGpuMeshRenderer (instanced)', source: instancedMeshShaderSource },
  { name: 'WebGpuNineSliceSpriteRenderer', source: nineSliceShaderSource },
  // Combined exactly as `onConnect` feeds `createShaderModule`: shared struct/
  // binding declarations + both entry-point sets in one module.
  { name: 'WebGpuRepeatingSpriteRenderer (combined)', source: commonWgsl + shaderPathEntries + geoPathEntries },
  { name: 'WebGpuSpriteRenderer', source: spriteShaderSource },
  { name: 'WebGpuStencilClipper', source: stencilWriteShaderSource },
  { name: 'WebGpuTextRenderer', source: textShaderSource },
  { name: 'spriteMaterialSources spriteVertexWgsl (custom-material vertex prelude)', source: spriteVertexWgsl },
];

// On the software (swiftshader / lavapipe) adapter the WebGPU device can drop
// mid-test; treat that as an unavailable-adapter skip rather than a failure,
// matching every other WebGPU browser spec in this directory.
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const requestDeviceOrSkip = async (ctx: { skip: (reason: string) => void }): Promise<GPUDevice | null> => {
  if (!navigator.gpu) {
    ctx.skip('WebGPU unavailable: navigator.gpu is absent');

    return null;
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    ctx.skip('WebGPU unavailable: requestAdapter() returned null');

    return null;
  }

  return adapter.requestDevice();
};

interface CompileResult {
  readonly errorCount: number;
  readonly log: string;
}

const compileWgsl = async (device: GPUDevice, code: string): Promise<CompileResult> => {
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter(message => message.type === 'error');
  const log = info.messages.length > 0 ? info.messages.map(message => `${message.type} ${message.lineNum}:${message.linePos} ${message.message}`).join('\n') : '<no messages>';

  return { errorCount: errors.length, log };
};

describe('WebGPU WGSL shader sources', () => {
  test('imports non-empty WGSL sources for every fixed createShaderModule call site', () => {
    // 9 renderer/compositor sources + the shared custom-material vertex
    // prelude; grows if a new WebGPU renderer is added.
    expect(shaders.length).toBeGreaterThanOrEqual(10);

    for (const { name, source } of shaders) {
      expect(source.length, `${name} is empty`).toBeGreaterThan(0);
    }
  });

  // One shader compile per `test()` call (rather than `test.each`) so each
  // gets its own device — matching the isolation-per-test pattern the other
  // WebGPU browser specs in this directory use (see `setupBackend` in
  // `webgpu-backdrop-blend.test.ts`), and keeping `ctx.skip` unambiguous.
  for (const { name, source } of shaders) {
    test(`compiles ${name}`, async ctx => {
      const device = await requestDeviceOrSkip(ctx);

      if (!device) {
        return;
      }

      try {
        const { errorCount, log } = await compileWgsl(device, source);

        expect(errorCount, `${name} failed to compile:\n${log}`).toBe(0);
      } catch (error) {
        if (isDeviceLoss(error)) {
          ctx.skip('WebGPU device lost mid-test — unstable software adapter');

          return;
        }

        throw error;
      } finally {
        device.destroy();
      }
    });
  }

  // ── Best-effort adapter-identity diagnostic ─────────────────────────────
  //
  // Closes (partially) an open uncertainty about the lavapipe CI wiring: does
  // `VK_DRIVER_FILES` actually reach the Playwright-launched Chromium child
  // process, or does Chromium silently fall back to its bundled SwiftShader
  // software adapter? `GPUAdapter.info` (and the deprecated async
  // `requestAdapterInfo()` it replaced) are the only APIs that could answer
  // this from inside a test, but support/content is inconsistent across
  // Chromium versions and can be intentionally opaque for fingerprinting
  // reasons — so this is diagnostic logging only, not a hard pass/fail gate.
  // A human should read this log line in the CI run to confirm the adapter
  // description does not say "SwiftShader".
  test('logs the requested adapter identity (informational, non-blocking)', async ctx => {
    if (!navigator.gpu) {
      ctx.skip('WebGPU unavailable: navigator.gpu is absent');

      return;
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      ctx.skip('WebGPU unavailable: requestAdapter() returned null');

      return;
    }

    const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;

    if (info) {
      console.info(
        `[webgpu-shader-compile] adapter.info: vendor="${info.vendor}" architecture="${info.architecture}" device="${info.device}" description="${info.description}"`,
      );

      return;
    }

    const legacyRequestInfo = (adapter as GPUAdapter & { requestAdapterInfo?: () => Promise<GPUAdapterInfo> }).requestAdapterInfo;

    if (typeof legacyRequestInfo === 'function') {
      const legacyInfo = await legacyRequestInfo.call(adapter);

      console.info(
        `[webgpu-shader-compile] adapter.requestAdapterInfo(): vendor="${legacyInfo.vendor}" architecture="${legacyInfo.architecture}" device="${legacyInfo.device}" description="${legacyInfo.description}"`,
      );

      return;
    }

    console.info(
      '[webgpu-shader-compile] adapter identity: neither adapter.info nor requestAdapterInfo() is available on this browser/version — cannot verify from inside the test whether lavapipe or SwiftShader served this run.',
    );
  });
});
