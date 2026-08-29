import { ARCHETYPES } from '../src/rendering/archetypes';
import type { ArchetypeId, ArchetypeSpec } from '../src/rendering/EngineAdapter';
import { filterChainDepth, isChurning, isTextArchetype, isTextUpdating, maskDepth, textForLeaf, usesRenderTargets } from '../src/rendering/traits';
import { maskRect, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../src/rendering/world';

const byId = Object.fromEntries(ARCHETYPES.map(archetype => [archetype.id, archetype])) as Record<ArchetypeId, ArchetypeSpec>;

describe('text archetypes', () => {
  test('the static and dynamic rows differ in exactly one field', () => {
    const staticText = byId['text-static'];
    const dynamicText = byId['text-dynamic'];
    const differing = (Object.keys({ ...staticText, ...dynamicText }) as (keyof ArchetypeSpec)[]).filter(
      key => key !== 'id' && staticText[key] !== dynamicText[key],
    );

    // `mutationFraction` differs because a static row has nothing to mutate;
    // `textUpdate` is the field under study. Anything else differing would mean
    // the delta between the rows is no longer the cost of text invalidation.
    expect(differing.sort()).toEqual(['mutationFraction', 'textUpdate']);
  });

  test('both rows carry the same glyph budget per node', () => {
    expect(byId['text-static'].textGlyphsPerNode).toBe(byId['text-dynamic'].textGlyphsPerNode);
    expect(byId['text-static'].textGlyphsPerNode).toBeGreaterThan(0);
  });

  test('only the dynamic row re-sets strings per frame', () => {
    expect(isTextArchetype(byId['text-static'])).toBe(true);
    expect(isTextArchetype(byId['text-dynamic'])).toBe(true);
    expect(isTextUpdating(byId['text-static'])).toBe(false);
    expect(isTextUpdating(byId['text-dynamic'])).toBe(true);
  });

  test('the ladder stays below the sprite ladder, since a text leaf costs far more', () => {
    expect(byId['text-static'].nodeCounts).toEqual([200, 1_000, 5_000]);
    expect(byId['text-dynamic'].nodeCounts).toEqual(byId['text-static'].nodeCounts);
  });
});

describe('textForLeaf', () => {
  test('produces exactly the requested glyph count', () => {
    for (const index of [0, 7, 999, 123_456, 9_999_999_999]) {
      expect(textForLeaf(index, 12)).toHaveLength(12);
    }
  });

  test('adjacent leaves never share a string, so a layout cache cannot absorb the archetype', () => {
    const strings = new Set(Array.from({ length: 5_000 }, (_unused, index) => textForLeaf(index, 12)));

    expect(strings.size).toBe(5_000);
  });

  test('draws only from the digit alphabet every arm shares', () => {
    expect(textForLeaf(4_711, 12)).toMatch(/^[0-9]{12}$/);
  });
});

describe('lifecycle-churn', () => {
  test('shares dynamic-heavy s mutation shape, so the delta is churn over mutation', () => {
    const churn = byId['lifecycle-churn'];
    const dynamic = byId['dynamic-heavy'];

    expect(churn.mutationFraction).toBe(dynamic.mutationFraction);
    expect(churn.nestingDepth).toBe(dynamic.nestingDepth);
    expect(churn.textureCount).toBe(dynamic.textureCount);
  });

  test('is the only archetype whose mutation is structural', () => {
    expect(ARCHETYPES.filter(isChurning).map(archetype => archetype.id)).toEqual(['lifecycle-churn']);
  });

  test('its ladder is a subset of dynamic-heavy s, so every cell has a partner to be read against', () => {
    const dynamic = new Set(byId['dynamic-heavy'].nodeCounts);

    expect(byId['lifecycle-churn'].nodeCounts.every(count => dynamic.has(count))).toBe(true);
  });
});

describe('render-target archetypes', () => {
  test('the filter rows sweep chain depth 1 / 2 / 4', () => {
    expect([filterChainDepth(byId['filter-chain-1']), filterChainDepth(byId['filter-chain-2']), filterChainDepth(byId['filter-chain-4'])]).toEqual([1, 2, 4]);
  });

  test('the filter rows are otherwise identical, so the step between them is one target pass', () => {
    const rows = [byId['filter-chain-1'], byId['filter-chain-2'], byId['filter-chain-4']];

    for (const row of rows) {
      expect(row.nestingDepth).toBe(rows[0]!.nestingDepth);
      expect(row.textureCount).toBe(rows[0]!.textureCount);
      expect(row.mutationFraction).toBe(rows[0]!.mutationFraction);
      expect(row.nodeCounts).toEqual(rows[0]!.nodeCounts);
    }
  });

  test('mask-clip nests one level less deep than its spine, leaving the root unmasked', () => {
    const mask = byId['mask-clip'];

    expect(maskDepth(mask)).toBe(mask.nestingDepth - 1);
  });

  test('exactly the filter and mask rows use render targets', () => {
    expect(
      ARCHETYPES.filter(usesRenderTargets)
        .map(archetype => archetype.id)
        .sort(),
    ).toEqual(['filter-chain-1', 'filter-chain-2', 'filter-chain-4', 'mask-clip']);
  });
});

describe('maskRect', () => {
  test('every level narrows the clip, so no nesting level is a no-op', () => {
    const rects = [0, 1, 2].map(level => maskRect(level, 3, VIEWPORT_WIDTH, VIEWPORT_HEIGHT));

    for (let level = 1; level < rects.length; level++) {
      expect(rects[level]!.width).toBeLessThan(rects[level - 1]!.width);
      expect(rects[level]!.height).toBeLessThan(rects[level - 1]!.height);
      expect(rects[level]!.x).toBeGreaterThan(rects[level - 1]!.x);
      expect(rects[level]!.y).toBeGreaterThan(rects[level - 1]!.y);
    }
  });

  test('the innermost rect still covers most of the viewport, so the row stays a clipping measurement', () => {
    const innermost = maskRect(2, 3, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    const covered = (innermost.width * innermost.height) / (VIEWPORT_WIDTH * VIEWPORT_HEIGHT);

    expect(covered).toBeGreaterThan(0.6);
  });
});
