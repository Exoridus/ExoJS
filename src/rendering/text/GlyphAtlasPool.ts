import { GlyphAtlas, SDF_RADIUS, type AtlasMode } from './GlyphAtlas';

/**
 * Manages one {@link GlyphAtlas} per font variant + mode combination.
 *
 * The pool key is `"${family}:${fontStyle}:${fontWeight}:${mode}"`. All text
 * nodes sharing the same font variant and mode draw from the same atlas pages,
 * so identical glyphs are rasterized only once regardless of which node first
 * requests them.
 *
 * Use {@link getDefaultGlyphAtlasPool} to obtain the shared process-wide
 * instance. Tests can mock that function to inject a fake pool.
 * @advanced
 */
export class GlyphAtlasPool {
  private readonly _atlases = new Map<string, GlyphAtlas>();
  private readonly _pageSize: number;

  public constructor(pageSize = 1024) {
    this._pageSize = pageSize;
  }

  /**
   * Returns (or lazily creates) the atlas for the given font variant and mode.
   * Defaults to `'sdf'` mode (R8 DataTexture, tiny-sdf rasterization).
   *
   * Nodes with different `sdfRadius` values get separate atlas instances so
   * each can encode a different outline/shadow reach without conflict.
   */
  public getAtlas(
    family: string,
    fontStyle: 'normal' | 'italic',
    fontWeight: string,
    mode: AtlasMode = 'sdf',
    sdfRadius = SDF_RADIUS,
  ): GlyphAtlas {
    const key = `${family}:${fontStyle}:${fontWeight}:${mode}:${sdfRadius}`;
    let atlas = this._atlases.get(key);

    if (atlas === undefined) {
      atlas = new GlyphAtlas(family, fontStyle, fontWeight, this._pageSize, mode, sdfRadius);
      this._atlases.set(key, atlas);
    }

    return atlas;
  }

  public clearAll(): void {
    for (const atlas of this._atlases.values()) {
      atlas.clear();
    }
  }
}

// ── Module-level default pool ────────────────────────────────────────────────

let _defaultPool: GlyphAtlasPool | null = null;

/**
 * Returns the shared process-wide {@link GlyphAtlasPool}, creating it lazily
 * on first call. All {@link DynamicText} instances use this pool by default.
 */
export function getDefaultGlyphAtlasPool(): GlyphAtlasPool {
  if (_defaultPool === null) {
    _defaultPool = new GlyphAtlasPool();
  }
  return _defaultPool;
}

/**
 * Override the default pool. Passing no argument (or `undefined`) causes the
 * next {@link getDefaultGlyphAtlasPool} call to create a fresh instance.
 *
 * Intended for tests: call with a mock pool in `beforeEach` and with no
 * argument in `afterEach` to restore default behaviour.
 */
export function resetDefaultGlyphAtlasPool(pool?: GlyphAtlasPool): void {
  _defaultPool = pool ?? null;
}
