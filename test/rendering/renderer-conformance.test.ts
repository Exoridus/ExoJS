/**
 * Renderer conformance for the core renderer bindings.
 *
 * One suite per binding `buildCoreRendererBindings` produces, run against the
 * real WebGL2 backend on the recording fake GL context. The batch size is
 * deliberately tiny so the overflow scenario reaches the "batch full, flush and
 * keep going" boundary in a handful of draws instead of thousands; nothing else
 * about the contract depends on it.
 *
 * Not covered here:
 * - `Text`, which shares its binding with `BitmapText`. Its glyphs come from a
 *   runtime SDF rasterisation through a real 2D canvas, which jsdom does not
 *   implement, so a `Text` node would submit an empty run and prove nothing.
 *   `BitmapText` carries the same renderer over a pre-built atlas and stands in.
 * - the WebGPU half of every binding: there is no Node double for it, so it
 *   belongs to the browser lanes.
 */
import { describe, expect, it } from 'vitest';

import type { RendererBinding } from '#extensions/Extension';
import { Container } from '#rendering/Container';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';
import type { DrawableConstructor } from '#rendering/Renderer';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { BitmapText } from '#rendering/text/BitmapText';
import { BmFont, type BmFontData } from '#rendering/text/BmFont';
import { Text } from '#rendering/text/Text';
import { Video } from '#rendering/video/Video';

import { makeRegion, makeTexture } from '../perf/rendering/fixtures';
import { describeRendererConformance } from '../support/renderer-conformance';

const batchSize = 16;
const coreBindings = buildCoreRendererBindings({ spriteRendererBatchSize: batchSize });

const bindingFor = (target: DrawableConstructor): RendererBinding => {
  const binding = coreBindings.find(candidate => candidate.targets.includes(target as DrawableConstructor));

  expect(binding, `buildCoreRendererBindings must declare a binding for ${target.name}`).toBeDefined();

  return binding!;
};

/** A single-glyph bitmap font over a plain sized texture - no rasterisation, no atlas upload. */
const makeBitmapFont = (glyphSize = 32): BmFont => {
  const fontData: BmFontData = {
    pages: ['atlas_0.png'],
    chars: new Map([[65, { x: 0, y: 0, width: glyphSize, height: glyphSize, xOffset: 0, yOffset: 0, xAdvance: glyphSize, page: 0 }]]),
    kernings: new Map(),
    lineHeight: glyphSize,
    base: glyphSize,
  };

  return new BmFont(fontData, [makeTexture(glyphSize)]);
};

const makeArrayMesh = (size = 64): Mesh =>
  new Mesh({
    vertices: new Float32Array([0, 0, size, 0, size, size, 0, size]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    texture: makeTexture(size),
  });

/** Interleaved position + texcoord + colour quad, in the layout the mesh renderer's default shader reads. */
const makeStaticQuadGeometry = (size = 64): Geometry => {
  const stride = 20;
  const buffer = new ArrayBuffer(4 * stride);
  const view = new DataView(buffer);

  (
    [
      [0, 0, 0, 0],
      [size, 0, 1, 0],
      [size, size, 1, 1],
      [0, size, 0, 1],
    ] as const
  ).forEach((vertex, index) => {
    const base = index * stride;

    view.setFloat32(base + 0, vertex[0], true);
    view.setFloat32(base + 4, vertex[1], true);
    view.setFloat32(base + 8, vertex[2], true);
    view.setFloat32(base + 12, vertex[3], true);
    view.setUint32(base + 16, 0xffffffff, true);
  });

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 16 },
    ],
    vertexData: buffer,
    stride,
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    usage: 'static',
  });
};

describe('core renderer bindings', () => {
  it('covers every core binding with a conformance suite', () => {
    const covered = new Set<DrawableConstructor>([Sprite, Video, Mesh, Text, BitmapText, NineSliceSprite, RepeatingSprite]);
    const declared = coreBindings.flatMap(binding => binding.targets);

    expect(
      declared.filter(target => !covered.has(target)).map(target => target.name),
      'a new core renderer binding needs a conformance suite in this file',
    ).toEqual([]);
  });
});

describeRendererConformance('Sprite', bindingFor(Sprite), {
  drawables: () => [new Sprite(makeTexture()), new Sprite(makeTexture(32))],
  overflowCount: batchSize * 3,
});

describeRendererConformance('Video', bindingFor(Video), {
  drawables: () => [],
});

describeRendererConformance('Mesh', bindingFor(Mesh), {
  // No overflow scenario: the mesh renderer draws per drawable rather than
  // packing a shared batch, so it has no capacity to overrun. Both storage
  // forms are sampled - only the shared static geometry is retained-recordable.
  drawables: () => {
    const geometry = makeStaticQuadGeometry();

    return [new Mesh({ geometry, texture: makeTexture() }), makeArrayMesh(48)];
  },
  // The mesh renderer records only its static batch, which the plan optimizer
  // selects by group index, so the capture scenario has to go through a plan:
  // several meshes over one shared static geometry and one texture.
  retainedScene: () => {
    const geometry = makeStaticQuadGeometry();
    const texture = makeTexture();
    const root = new Container();

    for (let index = 0; index < 3; index++) {
      const mesh = new Mesh({ geometry, texture });

      mesh.setPosition(index * 96, 0);
      root.addChild(mesh);
    }

    return root;
  },
});

describeRendererConformance('Text/BitmapText', bindingFor(Text), {
  // One shared font: the text renderer records a single batch per capture
  // bundle, so runs over two atlases would be two batches and poison it.
  drawables: () => {
    const font = makeBitmapFont();

    return [new BitmapText('AAAA', font), new BitmapText('AA', font)];
  },
});

describeRendererConformance('NineSliceSprite', bindingFor(NineSliceSprite), {
  drawables: () => [
    new NineSliceSprite(makeTexture(), { slices: 16, width: 96, height: 96, modes: { edges: 'stretch', center: 'stretch' } }),
    new NineSliceSprite(makeTexture(32), { slices: 8, width: 64, height: 64, modes: { edges: 'stretch', center: 'stretch' } }),
  ],
  overflowCount: batchSize,
});

describeRendererConformance('RepeatingSprite', bindingFor(RepeatingSprite), {
  // Both resolved strategies: a bare texture takes the shader path, a region
  // the geometry path, and only the latter admits retained recording.
  drawables: () => [
    new RepeatingSprite(makeRegion(makeTexture()), { width: 128, height: 128, modeX: 'repeat', modeY: 'repeat' }),
    new RepeatingSprite(makeTexture(), { width: 128, height: 128, modeX: 'repeat', modeY: 'repeat' }),
  ],
  overflowCount: batchSize * 2,
});
