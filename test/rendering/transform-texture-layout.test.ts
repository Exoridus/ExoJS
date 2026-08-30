import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { RenderError } from '#rendering/RenderError';
import { INSTANCE_TRANSFORM_GLSL } from '#rendering/shader/instanceContract';
import {
  createTransformTextureLayout,
  resolveTransformTextureGlsl,
  tintTextureRect,
  TRANSFORM_ROWS_PER_TEXTURE_LINE,
  TRANSFORM_TEXELS_PER_ROW,
  TRANSFORM_TEXTURE_GLSL,
  TRANSFORM_TEXTURE_GLSL_INCLUDE,
  transformTextureRect,
} from '#rendering/shader/transformTextureLayout';
import { spriteVertexGlsl } from '#rendering/sprite/materialSources';
import { TRANSFORM_FLOATS_PER_ROW } from '#rendering/TransformBuffer';

// The limit the reproduced defect was measured against (desktop Chromium /
// RTX 5070 Ti): past this many rows the old height-indexed texture failed
// allocation with GL_INVALID_VALUE and every transform fetch read an incomplete
// texture, so the scene rendered black.
const measuredMaxTextureSize = 16384;

// The CPU mirror of the shader's addressing, written out independently of the
// production helpers so a change to those cannot silently redefine what the
// tests consider correct.
const expectedTexel = (row: number, texel: number) => ({
  x: (row % TRANSFORM_ROWS_PER_TEXTURE_LINE) * TRANSFORM_TEXELS_PER_ROW + texel,
  y: Math.floor(row / TRANSFORM_ROWS_PER_TEXTURE_LINE),
});

/** Every shader-bearing source file below `directory`, skipping build output. */
const walkSources = function* (directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        yield* walkSources(path);
      }
    } else if (/\.(ts|vert|frag|glsl)$/.test(entry.name)) {
      yield path;
    }
  }
};

describe('transform texture layout', () => {
  test('a row store far past MAX_TEXTURE_SIZE still fits both texture dimensions', () => {
    // The regression itself: 2^18 rows is well over the 16384 the old layout
    // could address, and is the order the reproduced scenes (scrolling-world at
    // ~250k visible nodes) actually reach.
    const layout = createTransformTextureLayout(262144, measuredMaxTextureSize);

    expect(layout.rowsPerLine).toBe(TRANSFORM_ROWS_PER_TEXTURE_LINE);
    expect(layout.transformWidth).toBe(TRANSFORM_ROWS_PER_TEXTURE_LINE * TRANSFORM_TEXELS_PER_ROW);
    expect(layout.transformHeight).toBe(262144 / TRANSFORM_ROWS_PER_TEXTURE_LINE);
    expect(layout.transformWidth).toBeLessThanOrEqual(measuredMaxTextureSize);
    expect(layout.transformHeight).toBeLessThanOrEqual(measuredMaxTextureSize);
    expect(layout.tintWidth).toBe(TRANSFORM_ROWS_PER_TEXTURE_LINE);
    expect(layout.tintHeight).toBe(layout.transformHeight);
  });

  test('the packing factor fits the width every conformant WebGL2 context guarantees', () => {
    // 2048 is the spec floor for MAX_TEXTURE_SIZE. The shader addresses rows
    // with a compile-time constant, so the layout has to be valid on the
    // smallest conformant context as well as a desktop one.
    const minimal = createTransformTextureLayout(TRANSFORM_ROWS_PER_TEXTURE_LINE * 2, 2048);

    expect(minimal.transformWidth).toBeLessThanOrEqual(2048);
    expect(minimal.transformHeight).toBe(2);
  });

  test('a capacity below one texture line stays a single line, which is what makes the shader constant safe', () => {
    // Both row stores double from 16, so a sub-line capacity is always a
    // divisor of the packing factor: every row index is then < rowsPerLine and
    // the shader's `row % rowsPerLine` / `row / rowsPerLine` reduce to `row`/`0`.
    for (const capacity of [16, 64, 512, TRANSFORM_ROWS_PER_TEXTURE_LINE]) {
      const layout = createTransformTextureLayout(capacity, measuredMaxTextureSize);

      expect(layout.rowsPerLine).toBe(capacity);
      expect(layout.transformHeight).toBe(1);
      expect(layout.transformWidth).toBe(capacity * TRANSFORM_TEXELS_PER_ROW);

      // Highest valid row still addresses inside the allocated width.
      expect(expectedTexel(capacity - 1, TRANSFORM_TEXELS_PER_ROW - 1).x).toBeLessThan(layout.transformWidth);
      expect(expectedTexel(capacity - 1, 0).y).toBe(0);
    }
  });

  test('a capacity beyond even the 2D representation fails loudly instead of rendering black', () => {
    const beyond = TRANSFORM_ROWS_PER_TEXTURE_LINE * (measuredMaxTextureSize + 1);

    expect(() => createTransformTextureLayout(beyond, measuredMaxTextureSize)).toThrow(RenderError);
    expect(() => createTransformTextureLayout(beyond, measuredMaxTextureSize)).toThrow(/MAX_TEXTURE_SIZE/);
  });

  test('the texture is exactly the size of its tightly packed backing array', () => {
    // DataTexture rejects a buffer whose length does not match its dimensions,
    // so this is what guarantees the linear CPU stores need no re-packing to be
    // uploaded as a 2D texture.
    for (const capacity of [16, 1024, 4096, 262144]) {
      const layout = createTransformTextureLayout(capacity, measuredMaxTextureSize);
      const transformTexels = layout.transformWidth * layout.transformHeight;

      expect(transformTexels * 4).toBe(capacity * TRANSFORM_FLOATS_PER_ROW);
      expect(layout.tintWidth * layout.tintHeight).toBe(capacity);
    }
  });
});

describe('transform texture dirty-range mapping', () => {
  const layout = createTransformTextureLayout(262144, measuredMaxTextureSize);

  test('a single high row maps to one texel pair, not a whole line', () => {
    // The O(k) transform patch must not degrade into a full-line upload just
    // because the row sits past the first texture line.
    const row = 20000;
    const rect = transformTextureRect(layout, row, 1);

    expect(rect).toEqual({ ...expectedTexel(row, 0), width: TRANSFORM_TEXELS_PER_ROW, height: 1 });
    expect(tintTextureRect(layout, row, 1)).toEqual({ x: row % TRANSFORM_ROWS_PER_TEXTURE_LINE, y: rect.y, width: 1, height: 1 });
  });

  test('a range inside one line uploads exactly its rows', () => {
    const rect = transformTextureRect(layout, 1030, 4);

    expect(rect).toEqual({ x: 6 * TRANSFORM_TEXELS_PER_ROW, y: 1, width: 4 * TRANSFORM_TEXELS_PER_ROW, height: 1 });
  });

  test('a range crossing a line boundary widens to whole lines and still covers every row', () => {
    const firstRow = TRANSFORM_ROWS_PER_TEXTURE_LINE - 2;
    const rowCount = 5;
    const rect = transformTextureRect(layout, firstRow, rowCount);

    expect(rect).toEqual({ x: 0, y: 0, width: layout.transformWidth, height: 2 });

    // Coverage, stated as the row-index property rather than the rectangle: the
    // widened rect must contain both ends of the logical range.
    for (const row of [firstRow, firstRow + rowCount - 1]) {
      const texel = expectedTexel(row, 0);

      expect(texel.y).toBeGreaterThanOrEqual(rect.y);
      expect(texel.y).toBeLessThan(rect.y + rect.height);
      expect(texel.x).toBeGreaterThanOrEqual(rect.x);
      expect(texel.x).toBeLessThan(rect.x + rect.width);
    }
  });

  test('a full-store range is one full-width rect (the contiguous upload fast path)', () => {
    const rect = transformTextureRect(layout, 0, layout.rowCapacity);

    expect(rect).toEqual({ x: 0, y: 0, width: layout.transformWidth, height: layout.transformHeight });
  });
});

describe('transform texture GLSL include', () => {
  test('the include expands to helpers built from the same constants the CPU uses', () => {
    expect(TRANSFORM_TEXTURE_GLSL).toContain(`const int EXO_TRANSFORM_ROWS_PER_LINE = ${TRANSFORM_ROWS_PER_TEXTURE_LINE};`);
    expect(TRANSFORM_TEXTURE_GLSL).toContain(`const int EXO_TRANSFORM_TEXELS_PER_ROW = ${TRANSFORM_TEXELS_PER_ROW};`);
  });

  test.each([
    ['sprite material vertex stage', spriteVertexGlsl],
    ['instanced-batch contract', INSTANCE_TRANSFORM_GLSL],
  ])('%s carries the include and no hand-rolled row addressing', (_name, source) => {
    expect(source).toContain(TRANSFORM_TEXTURE_GLSL_INCLUDE);
    // The pre-fix addressing: a row index used directly as the y coordinate.
    expect(source).not.toMatch(/texelFetch\(u_transforms, ivec2\(\d+, row\)/);
    expect(source).not.toMatch(/texelFetch\(u_tintTexture, ivec2\(0, row\)/);
  });

  test('every shader source in the repo that reads the shared store goes through the helpers', () => {
    // A source scan rather than a list of imports: the consuming sources are
    // spread across .vert files, template literals in renderers, and a separate
    // package, and only a scan can fail when a NEW one hand-rolls the mapping.
    // (Text has its own per-node store - `u_nodeData` - and is untouched.)
    const roots = [resolve(import.meta.dirname, '../../src'), resolve(import.meta.dirname, '../../packages')];
    const offenders: string[] = [];
    const consumers: string[] = [];

    for (const root of roots) {
      for (const file of walkSources(root)) {
        const source = readFileSync(file, 'utf8');

        if (!source.includes('texelFetch(u_transforms')) {
          continue;
        }

        consumers.push(file);

        const usesHelper = source.includes('exoTransformTexel(row');
        const carriesInclude = source.includes(TRANSFORM_TEXTURE_GLSL_INCLUDE) || source.includes('TRANSFORM_TEXTURE_GLSL_INCLUDE');

        if (!usesHelper || !carriesInclude) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
    // Guards the scan itself: a glob that stopped matching would otherwise pass
    // by finding nothing.
    expect(consumers.length).toBeGreaterThanOrEqual(6);
  });

  test('resolving is idempotent in effect and leaves no directive behind', () => {
    const once = resolveTransformTextureGlsl(spriteVertexGlsl);

    expect(once).not.toContain(TRANSFORM_TEXTURE_GLSL_INCLUDE);
    expect(resolveTransformTextureGlsl(once)).toBe(once);
  });

  test('a source without the directive is passed through untouched', () => {
    const source = '#version 300 es\nvoid main() {}';

    expect(resolveTransformTextureGlsl(source)).toBe(source);
  });
});
