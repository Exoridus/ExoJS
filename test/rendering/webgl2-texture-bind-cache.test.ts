/**
 * WebGL2 per-unit texture bind cache.
 *
 * A logical bind used to cost two `gl.bindTexture` calls - `_syncTexture` bound
 * unconditionally and `bindTexture` bound the very same handle again - and the
 * backend remembered only the single last-bound texture, so nothing was ever
 * skipped across units. These tests drive the REAL `WebGl2Backend` against the
 * recording fake context and count the `gl.bindTexture` calls per unit, which
 * is exactly the state the defect showed up in.
 *
 * The cache is keyed on the `WebGLTexture` handle rather than the user-side
 * `Texture`, so a `releaseGpu` cycle - same `Texture`, brand new handle - must
 * still re-bind; that is asserted here too.
 */

import type { Application } from '#core/Application';
import { DataTexture } from '#rendering/texture/DataTexture';
import { TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

interface RecordedBind {
  /** Texture unit that was active when the bind was issued. */
  readonly unit: number;
  readonly handle: unknown;
}

interface BindHarness {
  readonly backend: WebGl2Backend;
  /** Every `gl.bindTexture` issued since the last {@link reset}, in order. */
  readonly binds: RecordedBind[];
  readonly recorder: GlRecorder;
  reset(): void;
  destroy(): void;
}

const createBindHarness = (): BindHarness => {
  installFakeWebGl2Globals();

  const recorder = new GlRecorder();
  const context = createFakeWebGl2Context(recorder);
  const binds: RecordedBind[] = [];
  const mutable = context as unknown as Record<string, unknown>;

  // The fake context is a Proxy with no `set` trap, so these land on its target
  // and every backend call goes through the spies.
  const originalActiveTexture = context.activeTexture.bind(context) as (unit: number) => void;
  const originalBindTexture = context.bindTexture.bind(context) as (target: number, handle: unknown) => void;
  let activeUnit = 0;

  mutable['activeTexture'] = (unit: number): void => {
    activeUnit = unit - context.TEXTURE0;
    originalActiveTexture(unit);
  };
  mutable['bindTexture'] = (target: number, handle: unknown): void => {
    binds.push({ unit: activeUnit, handle });
    originalBindTexture(target, handle);
  };

  const app = {
    canvas: createFakeCanvas(64, 64, context),
    options: { canvas: { width: 64, height: 64 }, rendering: { debug: false } },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  binds.length = 0;

  return {
    backend,
    binds,
    recorder,
    reset(): void {
      binds.length = 0;
    },
    destroy(): void {
      backend.destroy();
    },
  };
};

const createTexture = (): DataTexture<TextureFormat.Rgba8> => new DataTexture({ width: 4, height: 4, format: TextureFormat.Rgba8 });

describe('WebGL2 texture bind cache', () => {
  let harness: BindHarness;

  beforeEach(() => {
    harness = createBindHarness();
  });

  afterEach(() => {
    harness.destroy();
  });

  test('a logical bind issues exactly one gl.bindTexture', () => {
    const texture = createTexture();

    harness.backend.bindTexture(texture, 0);

    expect(harness.binds).toHaveLength(1);

    texture.destroy();
  });

  test('re-binding the same texture to the same unit issues no further gl.bindTexture', () => {
    const texture = createTexture();

    harness.backend.bindTexture(texture, 0);
    harness.reset();

    harness.backend.bindTexture(texture, 0);
    harness.backend.bindTexture(texture, 0);

    expect(harness.binds).toEqual([]);

    texture.destroy();
  });

  test('the same texture on a second unit binds again — the cache is per unit, not global', () => {
    const texture = createTexture();

    harness.backend.bindTexture(texture, 0);
    harness.reset();

    harness.backend.bindTexture(texture, 1);

    expect(harness.binds).toHaveLength(1);
    expect(harness.binds[0]!.unit).toBe(1);

    texture.destroy();
  });

  test('a unit remembers its binding across a detour to another unit', () => {
    const first = createTexture();
    const second = createTexture();

    harness.backend.bindTexture(first, 0);
    harness.backend.bindTexture(second, 1);
    harness.reset();

    // Unit 0 still holds `first` and unit 1 still holds `second`; neither
    // needs a re-bind, even though the "last bound texture" is `second`.
    harness.backend.bindTexture(first, 0);
    harness.backend.bindTexture(second, 1);

    expect(harness.binds).toEqual([]);

    first.destroy();
    second.destroy();
  });

  test('a texture upload still runs when the bind itself is skipped', () => {
    const texture = createTexture();

    harness.backend.bindTexture(texture, 0);
    harness.reset();

    const uploadsBefore = harness.recorder.textureUploads;

    texture.commitRect(0, 1, 4, 1);
    harness.backend.bindTexture(texture, 0);

    // Only the bind is cached: the version bump must still reach GL, and it
    // targets the texture the cache knows is already bound to unit 0.
    expect(harness.binds).toEqual([]);
    expect(harness.recorder.textureUploads).toBe(uploadsBefore + 1);

    texture.destroy();
  });

  test('unbinding a unit is cached too', () => {
    const texture = createTexture();

    harness.backend.bindTexture(texture, 0);
    harness.reset();

    harness.backend.bindTexture(null, 0);
    harness.backend.bindTexture(null, 0);

    expect(harness.binds).toEqual([{ unit: 0, handle: null }]);

    texture.destroy();
  });

  test('releasing a texture drops its cached handle, so the next bind re-binds', () => {
    const texture = createTexture();

    harness.backend.bindTexture(texture, 0);
    harness.reset();

    // The handle is deleted and re-created; the same `Texture` identity must
    // not short-circuit the bind of its new handle.
    texture.releaseGpu();
    harness.backend.bindTexture(texture, 0);

    expect(harness.binds).toHaveLength(1);
    expect(harness.binds[0]!.unit).toBe(0);

    texture.destroy();
  });

  test('a raw handle bound through the backend takes over the unit coherently', () => {
    const texture = createTexture();
    const raw = harness.backend.context.createTexture()!;

    harness.backend.bindTexture(texture, 1);
    harness.reset();

    harness.backend.setActiveTextureUnit(1).bindRawTexture(raw);
    // Repeating the raw bind is skipped ...
    harness.backend.bindRawTexture(raw);
    // ... but the managed texture has to take unit 1 back.
    harness.backend.bindTexture(texture, 1);

    expect(harness.binds).toHaveLength(2);
    expect(harness.binds[0]).toEqual({ unit: 1, handle: raw });
    expect(harness.binds[1]!.unit).toBe(1);
    expect(harness.binds[1]!.handle).not.toBe(raw);

    texture.destroy();
  });
});
