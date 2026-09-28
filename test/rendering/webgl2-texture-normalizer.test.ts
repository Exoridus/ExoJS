import { afterEach, describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { RenderError } from '#rendering/RenderError';
import { isFullyOpaqueLevel } from '#rendering/texture/pixelPayload';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

interface Allocation {
  readonly level: number;
  readonly internalFormat: number;
  readonly width: number;
  readonly height: number;
  /** `null` for the uninitialized allocation a normalization pass fills. */
  readonly data: ArrayBufferView | null;
}

interface Harness {
  readonly backend: WebGl2Backend;
  readonly gl: WebGL2RenderingContext;
  readonly allocations: Allocation[];
  readonly subUploads: Array<{ x: number; y: number; width: number; height: number; data: ArrayBufferView | null }>;
  /**
   * Viewport writes, each attributed to the framebuffer that was bound at the
   * time. A pass and the restore around it write to different framebuffers, so
   * this is what tells the pass's own rect apart from the borrowed one.
   */
  readonly viewports: Array<{ readonly framebuffer: object | null; readonly rect: number[] }>;
  readonly framebufferBinds: Array<object | null>;
  readonly pixelStores: Array<readonly [number, number | boolean]>;
  /**
   * Ordered `bindTexture` / `attach` / `draw` markers. Ordering is the whole
   * point of a feedback-loop guard, so it cannot be read off the individual
   * counters.
   */
  readonly events: string[];
  readonly textureCreates: () => number;
  readonly programCreates: () => number;
  readonly framebufferCreates: () => number;
  readonly draws: () => number;
  /** Force the next program link to fail, as a driver would report one. */
  readonly failNextLink: { value: boolean };
  /** Forget everything recorded so far, keeping the GL state the fake models. */
  clearRecords(): void;
  destroy(): void;
}

const createHarness = (): Harness => {
  installFakeWebGl2Globals();

  const context = createFakeWebGl2Context(new GlRecorder());
  const mutable = context as unknown as Record<string, unknown>;
  const allocations: Allocation[] = [];
  const subUploads: NonNullable<Harness['subUploads']> = [];
  const viewports: NonNullable<Harness['viewports']> = [];
  const framebufferBinds: Array<object | null> = [];
  const pixelStores: Array<readonly [number, number | boolean]> = [];
  const events: string[] = [];
  const failNextLink = { value: false };
  let draws = 0;
  let textureCreates = 0;
  let programCreates = 0;
  let framebufferCreates = 0;
  let activeUnit = 0;
  let boundFramebuffer: object | null = null;
  const boundByUnit = new Map<number, object | null>();

  const originalProgramParameter = mutable['getProgramParameter'] as (program: object, pname: number) => unknown;
  const originalCreateTexture = mutable['createTexture'] as () => object;
  const originalCreateProgram = mutable['createProgram'] as () => object;
  const originalCreateFramebuffer = mutable['createFramebuffer'] as () => object;
  const originalActiveTexture = mutable['activeTexture'] as (unit: number) => void;
  const originalBindTexture = mutable['bindTexture'] as (target: number, texture: object | null) => void;
  // The recording wrappers delegate: the fake's own model is what
  // `getParameter` answers a save/restore query from, so a wrapper that stopped
  // updating it would make every restoration assertion vacuous.
  const originalViewport = mutable['viewport'] as (x: number, y: number, width: number, height: number) => void;
  const originalBindFramebuffer = mutable['bindFramebuffer'] as (target: number, framebuffer: object | null) => void;

  mutable['getProgramParameter'] = (program: object, pname: number): unknown => (failNextLink.value ? false : originalProgramParameter(program, pname));
  mutable['createTexture'] = (): object => {
    textureCreates++;

    return originalCreateTexture();
  };
  mutable['createProgram'] = (): object => {
    programCreates++;

    return originalCreateProgram();
  };
  mutable['createFramebuffer'] = (): object => {
    framebufferCreates++;

    return originalCreateFramebuffer();
  };
  mutable['texImage2D'] = (...args: unknown[]): void => {
    // Two overloads reach this: the sized one
    // (target, level, internalFormat, width, height, border, format, type, data?)
    // and the DOM-source one (target, level, internalFormat, format, type, source),
    // whose extent comes from the source itself.
    if (args.length === 6) {
      const source = args[5] as { width: number; height: number };

      allocations.push({ level: args[1] as number, internalFormat: args[2] as number, width: source.width, height: source.height, data: null });

      return;
    }

    allocations.push({
      level: args[1] as number,
      internalFormat: args[2] as number,
      width: args[3] as number,
      height: args[4] as number,
      data: (args[8] ?? null) as ArrayBufferView | null,
    });
  };
  mutable['texSubImage2D'] = (...args: unknown[]): void => {
    // texSubImage2D(target, level, x, y, width, height, format, type, data, srcOffset?)
    subUploads.push({
      x: args[2] as number,
      y: args[3] as number,
      width: args[4] as number,
      height: args[5] as number,
      data: (args[8] ?? null) as ArrayBufferView | null,
    });
  };
  mutable['viewport'] = (x: number, y: number, width: number, height: number): void => {
    viewports.push({ framebuffer: boundFramebuffer, rect: [x, y, width, height] });
    originalViewport(x, y, width, height);
  };
  mutable['bindFramebuffer'] = (target: number, framebuffer: object | null): void => {
    boundFramebuffer = framebuffer;
    framebufferBinds.push(framebuffer);
    originalBindFramebuffer(target, framebuffer);
  };
  mutable['pixelStorei'] = (pname: number, value: number | boolean): void => {
    pixelStores.push([pname, value]);
  };
  mutable['activeTexture'] = (unit: number): void => {
    activeUnit = unit - context.TEXTURE0;
    originalActiveTexture(unit);
  };
  mutable['bindTexture'] = (target: number, texture: object | null): void => {
    boundByUnit.set(activeUnit, texture);
    events.push(texture === null ? `unbind@${activeUnit}` : `bind@${activeUnit}`);
    originalBindTexture(target, texture);
  };
  mutable['framebufferTexture2D'] = (_target: number, _attachment: number, _face: number, texture: object | null): void => {
    events.push(texture === null ? 'detach' : 'attach');
  };
  mutable['drawArrays'] = (): void => {
    draws++;
    events.push('draw');
  };

  const app = {
    canvas: createFakeCanvas(64, 64, context),
    options: { canvas: { width: 64, height: 64 }, rendering: { debug: false } },
  } as unknown as Application;
  const backend = new WebGl2Backend(app);

  const clearRecords = (): void => {
    allocations.length = 0;
    subUploads.length = 0;
    viewports.length = 0;
    framebufferBinds.length = 0;
    pixelStores.length = 0;
    events.length = 0;
    draws = 0;
    textureCreates = 0;
    programCreates = 0;
    framebufferCreates = 0;
  };

  clearRecords();

  return {
    backend,
    gl: context,
    allocations,
    subUploads,
    viewports,
    framebufferBinds,
    pixelStores,
    events,
    textureCreates: () => textureCreates,
    programCreates: () => programCreates,
    framebufferCreates: () => framebufferCreates,
    draws: () => draws,
    failNextLink,
    clearRecords,
    destroy(): void {
      backend.destroy();
    },
  };
};

/** The sRGB code for a linear value - the acceptance case is stated in linear terms. */
const srgbOf = (linear: number): number => Math.round(255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055));

const straightTexture = (
  bytes: number[],
  options: { colorSpace?: 'srgb' | 'linear-srgb'; alphaMode?: 'straight' | 'premultiplied'; premultiplyAlpha?: boolean } = {},
): Texture =>
  Texture.fromPixels(
    {
      colorSpace: options.colorSpace ?? 'srgb',
      alphaMode: options.alphaMode ?? 'straight',
      levels: [{ data: new Uint8Array(bytes), width: 1, height: 1 }],
    },
    options.premultiplyAlpha === undefined ? undefined : { premultiplyAlpha: options.premultiplyAlpha },
  );

describe('WebGL2 managed-colour alpha normalization', () => {
  let harness: Harness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  const passViewports = (): number[][] => harness!.viewports.filter(entry => entry.framebuffer !== null).map(entry => entry.rect);

  test('runs one unblended 1:1 pass from straight sRGB bytes into an sRGB destination', () => {
    harness = createHarness();
    const texture = straightTexture([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 64]);

    harness.backend.bindTexture(texture, 0);

    // The level is allocated uninitialized and written by the pass, so it never
    // briefly holds straight colour a sampler could read. The second allocation
    // is the staging texture, sized to hold the straight source.
    expect(harness.allocations).toEqual([
      { level: 0, internalFormat: harness.gl.SRGB8_ALPHA8, width: 1, height: 1, data: null },
      { level: 0, internalFormat: harness.gl.SRGB8_ALPHA8, width: 1, height: 1, data: null },
    ]);
    expect(harness.draws()).toBe(1);
    // The straight bytes reach the staging texture through a sub-upload, and no
    // browser premultiply flag is set: alpha would otherwise be applied twice.
    expect(harness.subUploads).toHaveLength(1);
    expect(harness.pixelStores).toEqual([]);

    texture.destroy();
  });

  test('normalizes a linear-srgb payload through an RGBA8 destination, without a transfer function', () => {
    harness = createHarness();
    const texture = straightTexture([128, 128, 128, 128], { colorSpace: 'linear-srgb' });

    harness.backend.bindTexture(texture, 0);

    expect(harness.allocations[0]?.internalFormat).toBe(harness.gl.RGBA8);
    expect(harness.draws()).toBe(1);

    texture.destroy();
  });

  test('skips a source that is already premultiplied instead of multiplying twice', () => {
    harness = createHarness();
    const texture = straightTexture([64, 32, 16, 64], { alphaMode: 'premultiplied' });

    harness.backend.bindTexture(texture, 0);

    expect(harness.draws()).toBe(0);
    expect(harness.allocations).toEqual([{ level: 0, internalFormat: harness.gl.SRGB8_ALPHA8, width: 1, height: 1, data: new Uint8Array([64, 32, 16, 64]) }]);

    texture.destroy();
  });

  test('skips a source that asks for no normalization', () => {
    harness = createHarness();
    const texture = straightTexture([64, 32, 16, 64], { premultiplyAlpha: false });

    harness.backend.bindTexture(texture, 0);

    expect(harness.draws()).toBe(0);
    expect(harness.allocations[0]?.data).toEqual(new Uint8Array([64, 32, 16, 64]));

    texture.destroy();
  });

  test('skips a fully opaque level, which multiplying by alpha cannot change', () => {
    harness = createHarness();
    const texture = straightTexture([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 255]);

    harness.backend.bindTexture(texture, 0);

    expect(harness.draws()).toBe(0);
    expect(harness.allocations[0]?.data).toEqual(new Uint8Array([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 255]));

    texture.destroy();
  });

  test('never sends numeric data through the pass', () => {
    harness = createHarness();
    const texture = Texture.fromPixels({
      colorSpace: 'none',
      alphaMode: 'straight',
      levels: [{ data: new Uint8Array([128, 128, 255, 255]), width: 1, height: 1 }],
    });

    harness.backend.bindTexture(texture, 0);

    expect(harness.draws()).toBe(0);
    expect(harness.allocations[0]?.internalFormat).toBe(harness.gl.RGBA8);

    texture.destroy();
  });

  test('refuses to normalize numeric data even when the caller asks for it', () => {
    harness = createHarness();
    const texture = Texture.fromPixels({
      colorSpace: 'none',
      alphaMode: 'straight',
      levels: [{ data: new Uint8Array([128, 128, 255, 255]), width: 1, height: 1 }],
    });

    expect(() => texture.setPremultiplyAlpha(true)).toThrow(/numeric texture data/i);

    texture.destroy();
  });

  test('normalizes every authored mip level separately, sharing one staging texture', () => {
    harness = createHarness();
    const texture = Texture.fromPixels({
      colorSpace: 'srgb',
      alphaMode: 'straight',
      levels: [
        { data: new Uint8Array(4 * 4 * 4).fill(64), width: 4, height: 4 },
        { data: new Uint8Array(2 * 2 * 4).fill(64), width: 2, height: 2 },
      ],
    });

    harness.backend.bindTexture(texture, 0);

    expect(harness.draws()).toBe(2);
    expect(passViewports()).toEqual([
      [0, 0, 4, 4],
      [0, 0, 2, 2],
    ]);
    // One destination plus ONE staging texture: a per-level staging allocation
    // would show up here as a third create.
    expect(harness.textureCreates()).toBe(2);
    // The smaller level is staged into the larger one's top-left corner.
    expect(harness.subUploads.map(upload => [upload.width, upload.height])).toEqual([
      [4, 4],
      [2, 2],
    ]);
    expect(harness.allocations.filter(allocation => allocation.data === null)).toHaveLength(3);

    texture.destroy();
  });

  test('normalizes a browser image source instead of letting the browser premultiply it', () => {
    harness = createHarness();
    const texture = new Texture({ width: 2, height: 2 } as unknown as HTMLCanvasElement, { colorSpace: 'srgb' });

    harness.backend.bindTexture(texture, 0);

    expect(harness.draws()).toBe(1);
    // The pass supplies the premultiply itself, so the browser's own flag has to
    // be off - it would multiply colour the pass is about to multiply again.
    expect(harness.pixelStores).toContainEqual([harness.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false]);
    expect(harness.pixelStores).not.toContainEqual([harness.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true]);
    expect(passViewports()).toEqual([[0, 0, 2, 2]]);

    texture.destroy();
  });

  test('leaves an implicit browser source on the pre-activation upload path', () => {
    harness = createHarness();
    const texture = new Texture({ width: 2, height: 2 } as unknown as HTMLCanvasElement);

    harness.backend.bindTexture(texture, 0);

    // The activation gate stays closed until R41, so an ordinary decoded image
    // keeps legacy RGBA8 storage and the browser's own premultiply: the pass
    // would decode and re-encode for a destination that has no transfer function
    // to begin with.
    expect(harness.draws()).toBe(0);
    expect(harness.allocations).toEqual([{ level: 0, internalFormat: harness.gl.RGBA8, width: 2, height: 2, data: null }]);
    expect(harness.pixelStores).toContainEqual([harness.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true]);
    expect(harness.textureCreates()).toBe(1);

    texture.destroy();
  });

  test('premultiplies a linear-srgb browser source with the browser flag, not a pass', () => {
    harness = createHarness();
    const texture = new Texture({ width: 2, height: 2 } as unknown as HTMLCanvasElement, { colorSpace: 'linear-srgb' });

    harness.backend.bindTexture(texture, 0);

    // Declared linear colour has no encode on write, so the free flag already
    // produces linearRGB * alpha - and the staged bytes are what the flag sees.
    expect(harness.draws()).toBe(0);
    expect(harness.allocations[0]?.internalFormat).toBe(harness.gl.RGBA8);
    expect(harness.pixelStores).toContainEqual([harness.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true]);

    texture.destroy();
  });

  test('restores the framebuffer, viewport, blend state and active unit it borrowed', () => {
    harness = createHarness();
    const texture = straightTexture([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 64]);

    harness.backend.bindTexture(texture, 0);

    // Framebuffer: the pass's own, then the default one it found.
    expect(harness.framebufferBinds[0]).not.toBeNull();
    expect(harness.framebufferBinds.at(-1)).toBeNull();
    // Viewport: the level-sized rect under the pass's framebuffer, and the
    // borrowed rect back in force afterwards.
    expect(passViewports()).toEqual([[0, 0, 1, 1]]);
    expect(harness.gl.getParameter(harness.gl.BLEND)).toBe(true);
    expect(harness.gl.getParameter(harness.gl.ACTIVE_TEXTURE)).toBe(harness.gl.TEXTURE0);
    // The attachment is dropped from the pass's own framebuffer, not the
    // restored one, so no framebuffer is left holding a borrowed level.
    expect(harness.events.at(-1)).toBe('detach');

    texture.destroy();
  });

  test('leaves the context exactly as it found it', () => {
    harness = createHarness();
    const texture = straightTexture([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 64]);
    const gl = harness.gl;
    const before = {
      framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING),
      viewport: [...(gl.getParameter(gl.VIEWPORT) as Int32Array)],
      program: gl.getParameter(gl.CURRENT_PROGRAM),
      array: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
      buffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
      unit: gl.getParameter(gl.ACTIVE_TEXTURE),
      blend: gl.getParameter(gl.BLEND),
    };

    harness.backend.bindTexture(texture, 0);

    expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(before.framebuffer);
    expect([...(gl.getParameter(gl.VIEWPORT) as Int32Array)]).toEqual(before.viewport);
    expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBe(before.program);
    expect(gl.getParameter(gl.VERTEX_ARRAY_BINDING)).toBe(before.array);
    expect(gl.getParameter(gl.ARRAY_BUFFER_BINDING)).toBe(before.buffer);
    expect(gl.getParameter(gl.ACTIVE_TEXTURE)).toBe(before.unit);
    expect(gl.getParameter(gl.BLEND)).toBe(before.blend);

    texture.destroy();
  });

  test('releases the destination from its sampler unit before attaching it', () => {
    harness = createHarness();
    const texture = straightTexture([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 64]);

    harness.backend.bindTexture(texture, 2);
    harness.clearRecords();

    // A texture still bound for sampling while it is the pass's colour
    // attachment is a feedback loop, and GL drops the draw over it - silently,
    // as far as the caller is concerned.
    texture.updateSource();
    harness.backend.bindTexture(texture, 2);

    const attachIndex = harness.events.indexOf('attach');
    const drawIndex = harness.events.indexOf('draw');

    expect(drawIndex).toBeGreaterThan(-1);
    expect(attachIndex).toBeGreaterThan(-1);
    expect(harness.events.indexOf('unbind@2')).toBeGreaterThan(-1);
    expect(harness.events.indexOf('unbind@2')).toBeLessThan(attachIndex);
    expect(attachIndex).toBeLessThan(drawIndex);

    texture.destroy();
  });

  test('reports a link failure as a RenderError rather than drawing with a broken program', () => {
    harness = createHarness();
    harness.failNextLink.value = true;
    const texture = straightTexture([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 64]);

    expect(() => harness?.backend.bindTexture(texture, 0)).toThrow(RenderError);
    expect(harness.draws()).toBe(0);

    texture.destroy();
  });

  test('builds one program and one framebuffer across repeated uploads', () => {
    harness = createHarness();
    const texture = straightTexture([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 64]);

    harness.backend.bindTexture(texture, 0);
    texture.updateSource();
    harness.backend.bindTexture(texture, 0);

    expect(harness.programCreates()).toBe(1);
    expect(harness.framebufferCreates()).toBe(1);
    // Two passes, one program: the pass is per upload, not per program build.
    expect(harness.draws()).toBe(2);

    texture.destroy();
  });
});

describe('isFullyOpaqueLevel', () => {
  test('reads alpha on every fourth byte of one RGBA8 level', () => {
    expect(isFullyOpaqueLevel(new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]))).toBe(true);
    expect(isFullyOpaqueLevel(new Uint8Array([0, 0, 0, 255, 0, 0, 0, 254]))).toBe(false);
    expect(isFullyOpaqueLevel(new Uint8Array([0, 0, 0, 0]))).toBe(false);
    expect(isFullyOpaqueLevel(new Uint8Array([]))).toBe(true);
  });
});
