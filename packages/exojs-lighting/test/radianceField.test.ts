import { Color, type PassContext, RenderTexture, TextureFormat, View } from '@codexo/exojs';
import { describe, expect, test, vi } from 'vitest';

import { RadianceField, type TransportBinding } from '../src/backends/radianceField';
import { PointLight } from '../src/lights/PointLight';
import { SunLight } from '../src/lights/SunLight';

/**
 * The filters are built inside {@link RadianceField.useTransport} and are not
 * part of the renderer's surface. Reading them back is what tells the walk's
 * production wiring apart from a shader contract test, which sets the same
 * terms itself and so would pass over an unwritten block.
 */
interface Walker {
  readonly uniforms: Record<string, { x: number; y: number; z: number; w: number; value: number }>;
}

interface Walkers {
  readonly cascade: Walker | null;
  readonly gather: Walker | null;
}

const walkersOf = (field: RadianceField): Walkers => ({
  cascade: field['_transportCascade'] as unknown as Walker | null,
  gather: field['_transportGather'] as unknown as Walker | null,
});

const bindingFor = (revision: number, cells: number): TransportBinding => ({
  textures: {
    uSegments: new RenderTexture(4, 1, { format: TextureFormat.Rgba32F }),
    uEmitters: new RenderTexture(4, 1, { format: TextureFormat.Rgba32F }),
    uCells: new RenderTexture(cells, cells, { format: TextureFormat.Rgba32F }),
    uIndices: new RenderTexture(4, 1, { format: TextureFormat.Rgba32F }),
    uMask: new RenderTexture(64, 48),
    uMaskCoarse: new RenderTexture(8, 6),
    uMaskSuper: new RenderTexture(2, 2),
  },
  revision,
  originX: -12,
  originY: -34,
  cellSize: 7,
  cellsX: cells,
  cellsY: cells + 1,
  maskWidth: 64,
  maskHeight: 48,
  blocksWidth: 8,
  blocksHeight: 6,
  superblocksWidth: 2,
  superblocksHeight: 2,
  tableWidth: 256,
});

const fieldWith = (bounce = 0): RadianceField =>
  new RadianceField(new RenderTexture(64, 64, { format: TextureFormat.Rgba16F }), new RenderTexture(64, 64), {
    probeSpacing: 2,
    cascades: 2,
    interval: 1,
    bounce,
  });

/** What both walking filters must be told, and where each term comes from. */
const transportTerms = (binding: TransportBinding): Record<string, readonly number[]> => ({
  uGridOrigin: [binding.originX, binding.originY],
  uGridCells: [binding.cellsX, binding.cellsY],
  uMaskCells: [binding.maskWidth, binding.maskHeight],
  uMaskBlocks: [binding.blocksWidth, binding.blocksHeight],
  uMaskSuperblocks: [binding.superblocksWidth, binding.superblocksHeight],
});

const expectWalkTerms = (walker: Walker | null, binding: TransportBinding): void => {
  expect(walker).not.toBeNull();

  const written = Object.fromEntries(
    Object.keys(transportTerms(binding)).map(name => [name, [walker!.uniforms[name]!.x, walker!.uniforms[name]!.y]]),
  );

  expect(written).toEqual(transportTerms(binding));
  expect(walker!.uniforms['uCellSize']!.value).toBe(binding.cellSize);
  expect(walker!.uniforms['uTableWidth']!.value).toBe(binding.tableWidth);
};

describe('RadianceField transport wiring', () => {
  test('keeps raw directions separate from one compact angular mean per finest probe', () => {
    const field = fieldWith();
    const view = new View(32, 32, 64, 64);

    field.useTransport(bindingFor(1, 9));
    field.update(view, new View(32, 32, 80, 80), 1, Color.black);

    const [raw, compact] = field['_chain'];
    const gather = walkersOf(field).gather;

    expect([raw.width, raw.height]).toEqual([64, 64]);
    expect([compact.width, compact.height]).toEqual([32, 32]);
    expect(gather!.uniforms['uTile']!.value).toBe(1);

    field.destroy();
  });

  test('publishes the walk terms to the receiver reconstruction as well as to the chain', () => {
    const field = fieldWith();
    const binding = bindingFor(1, 9);
    const view = new View(32, 32, 64, 64);

    field.useTransport(binding);
    field.update(view, new View(32, 32, 80, 80), 1, Color.black);

    const { cascade, gather } = walkersOf(field);

    expectWalkTerms(cascade, binding);
    expectWalkTerms(gather, binding);

    field.destroy();
  });

  test('reads the occluder mask through the field view both filters were given', () => {
    const field = fieldWith();
    const fieldView = new View(20, 10, 80, 80);
    const camera = new View(32, 32, 64, 64);

    camera.rotation = 0.4;
    fieldView.rotation = 0.4;
    field.useTransport(bindingFor(1, 9));
    field.update(camera, fieldView, 1, Color.black);

    const { cascade, gather } = walkersOf(field);
    const expected = fieldView.getTransform();
    // The block holds f32, and a rotated view's terms are computed in f64.
    const stored = (value: number): number => Math.fround(value);

    for (const walker of [cascade, gather]) {
      expect([walker!.uniforms['uMaskBasis']!.x, walker!.uniforms['uMaskBasis']!.y]).toEqual([stored(expected.a), stored(expected.b)]);
      expect([walker!.uniforms['uMaskBasis']!.z, walker!.uniforms['uMaskBasis']!.w]).toEqual([stored(expected.c), stored(expected.d)]);
      expect([walker!.uniforms['uMaskOffset']!.x, walker!.uniforms['uMaskOffset']!.y]).toEqual([stored(expected.x), stored(expected.y)]);
    }

    field.destroy();
  });

  test('counts only the sources that emit, on the terms the tables place them by', () => {
    const field = fieldWith();
    const lights = [
      new PointLight({ radius: 100 }),
      new PointLight({ radius: 100, intensity: 0 }),
      new PointLight({ radius: 100, intensity: -1 }),
      new PointLight({ radius: 100, intensity: Number.NaN }),
      new PointLight({ radius: 100, enabled: false }),
    ];

    expect(field.collectSources(lights)).toBe(1);
    expect(field.emitterCount).toBe(1);

    field.destroy();
  });

  test('follows a moved camera and a table that outgrew its texture', () => {
    const field = fieldWith();
    const camera = new View(32, 32, 64, 64);

    field.useTransport(bindingFor(1, 9));
    field.update(camera, new View(32, 32, 80, 80), 1, Color.black);

    camera.center.set(400, 260);

    const grown = bindingFor(2, 40);

    field.useTransport(grown);
    field.update(camera, new View(400, 260, 80, 80), 1, Color.black);

    const { cascade, gather } = walkersOf(field);

    expectWalkTerms(cascade, grown);
    expectWalkTerms(gather, grown);

    field.destroy();
  });

  test('a bright, hard-edged sun stays finite in half-float radiance', () => {
    const field = fieldWith();

    field.useTransport(bindingFor(1, 9));
    field.collectSources([new SunLight({ intensity: 100, softness: 0 })]);
    field.update(new View(32, 32, 64, 64), new View(32, 32, 80, 80), 1, Color.black);

    const sun = walkersOf(field).cascade!.uniforms['uSun']!;
    const colour = walkersOf(field).cascade!.uniforms['uSunColor']!;

    expect(Number.isFinite(sun.w)).toBe(true);
    expect(sun.w * Math.max(1, colour.x, colour.y, colour.z)).toBeLessThanOrEqual(65504);

    field.destroy();
  });

  test('separates incoming bounce history from normal-mapped display light', () => {
    const field = fieldWith(0.9);
    const view = new View(32, 32, 64, 64);
    const fieldView = new View(32, 32, 80, 80);
    const normals = new RenderTexture(64, 64);
    const display = field['_target'];
    const cascadeHistory = (): RenderTexture | undefined =>
      (
        field['_transportCascade'] as unknown as {
          _bindings: { textures: Record<string, RenderTexture> };
        }
      )._bindings.textures['uHistory'];

    field.useTransport(bindingFor(1, 9));
    field.update(view, fieldView, 1, Color.black);

    expect(field['_bounceHistory']).toBeNull();
    expect(cascadeHistory()).toBe(display);

    field.useNormals(normals);
    const history = field['_bounceHistory'];

    expect(history).not.toBeNull();
    expect(history).not.toBe(display);
    expect(cascadeHistory()).toBe(history);
    expect(field['_history']).toBe(false);

    field.update(view, fieldView, 1, Color.black);
    expect([history!.width, history!.height]).toEqual([display.width, display.height]);
    expect(field['_transportCascade']!.uniforms.uHistoryValid.value).toBe(0);

    const calls: Array<{ stage: string; output: RenderTexture }> = [];
    const filters = [
      ['cascade', field['_transportCascade']],
      ['average', field['_average']],
      ['plain', field['_transportGather']],
      ['shaded', field['_normalGather']],
    ] as const;
    const spies = filters.map(([stage, filter]) =>
      vi.spyOn(filter!, 'apply').mockImplementation((_backend, _input, output) => {
        calls.push({ stage, output });
      }),
    );

    field['_build']({ backend: {} } as unknown as PassContext);

    // Two cascades, each exactly once. The extra unweighted average and gather
    // write history without ever overriding the normal-weighted display.
    expect(calls.map(call => call.stage)).toEqual(['cascade', 'average', 'cascade', 'average', 'plain', 'shaded']);
    expect(calls.find(call => call.stage === 'plain')?.output).toBe(history);
    expect(calls.find(call => call.stage === 'shaded')?.output).toBe(display);
    expect(field['_history']).toBe(true);

    field.update(view, fieldView, 1, Color.black);
    expect(field['_transportCascade']!.uniforms.uHistoryValid.value).toBe(1);

    field.useNormals(null);

    // Switching back must not treat last frame's normal-shaded display as
    // unweighted incoming radiance. One feedback frame is invalidated.
    expect(field['_bounceHistory']).toBeNull();
    expect(cascadeHistory()).toBe(display);
    expect(field['_history']).toBe(false);
    expect(history!.destroyed).toBe(true);

    calls.length = 0;
    field.update(view, fieldView, 1, Color.black);
    expect(field['_transportCascade']!.uniforms.uHistoryValid.value).toBe(0);
    field['_build']({ backend: {} } as unknown as PassContext);

    expect(calls.map(call => call.stage)).toEqual(['cascade', 'average', 'cascade', 'average', 'plain']);
    expect(calls.find(call => call.stage === 'plain')?.output).toBe(display);

    for (const spy of spies) {
      spy.mockRestore();
    }

    normals.destroy();
    field.destroy();
  });

  test('keeps the previous fast gather and memory usage when bounce is disabled', () => {
    const field = fieldWith(0);
    const normals = new RenderTexture(64, 64);

    field.useTransport(bindingFor(1, 9));
    field.useNormals(normals);
    field.update(new View(32, 32, 64, 64), new View(32, 32, 80, 80), 1, Color.black);

    expect(field['_bounceHistory']).toBeNull();
    expect(field['_normalGather']).not.toBeNull();
    expect(
      (
        field['_transportCascade'] as unknown as {
          _bindings: { textures: Record<string, RenderTexture> };
        }
      )._bindings.textures['uHistory'],
    ).toBe(field['_target']);

    normals.destroy();
    field.destroy();
  });
});
