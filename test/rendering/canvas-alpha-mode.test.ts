/**
 * Canvas composite contract: `rendering.alphaMode` is the single public knob
 * that decides whether the canvas composites against the page, and both
 * backends must derive their native configuration from it alone.
 *
 * This file covers the WebGL2 mapping (context attributes). The WebGPU mapping
 * (`GPUCanvasConfiguration.alphaMode`) is covered in `webgpu-backend.test.ts`,
 * which owns the mock GPU environment.
 */
import { describe, expect, test } from 'vitest';

import type { Application, RenderingApplicationOptions } from '#core/Application';
import { resolveRenderingOptions } from '#core/Application';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

/**
 * Construct a real {@link WebGl2Backend} against a recording fake context and
 * hand back the attributes it asked `getContext('webgl2')` for.
 *
 * `rendering` is resolved through {@link resolveRenderingOptions} first —
 * the same call the real {@link Application} constructor makes — so this
 * exercises the actual public-options-to-defaults merge, not a re-typed copy
 * of it.
 */
const captureContextAttributes = (rendering: RenderingApplicationOptions): WebGLContextAttributes => {
  installFakeWebGl2Globals();

  const context = createFakeWebGl2Context(new GlRecorder());
  let captured: WebGLContextAttributes | undefined;
  const canvas = {
    width: 64,
    height: 64,
    getContext: (kind: string, attributes?: WebGLContextAttributes): WebGL2RenderingContext | null => {
      if (kind !== 'webgl2') {
        return null;
      }

      captured = attributes;

      return context;
    },
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
  } as unknown as HTMLCanvasElement;
  const app = {
    canvas,
    options: {
      canvas: { width: 64, height: 64 },
      rendering: resolveRenderingOptions(rendering),
    },
  } as unknown as Application;

  new WebGl2Backend(app);

  expect(captured).toBeDefined();

  return captured!;
};

describe('canvas alphaMode → WebGL2 context attributes', () => {
  test('defaults to an opaque canvas', () => {
    const attributes = captureContextAttributes({});

    expect(attributes.alpha).toBe(false);
    // The engine always writes premultiplied colour, so the canvas is always
    // told so — with `alpha: false` the flag is inert per the WebGL spec.
    expect(attributes.premultipliedAlpha).toBe(true);
  });

  test('maps explicit opaque to an alpha-less drawing buffer', () => {
    const attributes = captureContextAttributes({ alphaMode: 'opaque' });

    expect(attributes.alpha).toBe(false);
    expect(attributes.premultipliedAlpha).toBe(true);
  });

  test('maps premultiplied to an alpha drawing buffer composited premultiplied', () => {
    const attributes = captureContextAttributes({ alphaMode: 'premultiplied' });

    expect(attributes.alpha).toBe(true);
    expect(attributes.premultipliedAlpha).toBe(true);
  });

  test('keeps forwarding the WebGL-only attributes it does not own', () => {
    const attributes = captureContextAttributes({
      alphaMode: 'premultiplied',
      webglAttributes: { antialias: true, preserveDrawingBuffer: true, depth: true },
    });

    expect(attributes.antialias).toBe(true);
    expect(attributes.preserveDrawingBuffer).toBe(true);
    expect(attributes.depth).toBe(true);
    // Root-target stencil clipping needs a stencil buffer unconditionally.
    expect(attributes.stencil).toBe(true);
    expect(attributes.alpha).toBe(true);
  });

  test('lets alphaMode win over composite attributes smuggled in at runtime', () => {
    const attributes = captureContextAttributes({
      alphaMode: 'premultiplied',
      webglAttributes: { alpha: false, premultipliedAlpha: false } as NonNullable<RenderingApplicationOptions['webglAttributes']>,
    });

    expect(attributes.alpha).toBe(true);
    expect(attributes.premultipliedAlpha).toBe(true);
  });

  test('applies ExoJS defaults (not the browser WebGL-spec defaults) when no override is given', () => {
    const attributes = captureContextAttributes({});

    expect(attributes.antialias).toBe(false);
    expect(attributes.depth).toBe(false);
    expect(attributes.preserveDrawingBuffer).toBe(false);
    expect(attributes.stencil).toBe(true);
  });

  test('merges a partial webglAttributes override on top of the full ExoJS defaults', () => {
    const attributes = captureContextAttributes({
      webglAttributes: { antialias: true },
    });

    expect(attributes.antialias).toBe(true);
    // The rest of ExoJS's defaults must survive a partial override instead of
    // being replaced wholesale by the browser's own WebGL-spec defaults
    // (which would flip `depth` to `true`).
    expect(attributes.depth).toBe(false);
    expect(attributes.preserveDrawingBuffer).toBe(false);
  });

  test('lets the engine-owned stencil attribute win over a smuggled-in override', () => {
    const attributes = captureContextAttributes({
      webglAttributes: { stencil: false } as NonNullable<RenderingApplicationOptions['webglAttributes']>,
    });

    // Root-target stencil clipping needs a stencil buffer unconditionally —
    // the public option is not authoritative over this attribute.
    expect(attributes.stencil).toBe(true);
  });
});
