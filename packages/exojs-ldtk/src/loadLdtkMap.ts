import { type AssetLoaderContext, Texture, TextureRegion } from '@codexo/exojs';
import { TileSet } from '@codexo/exojs-tilemap';

import type { LdtkData, LdtkLevel, LdtkTilesetDef } from './LdtkData';
import type { LdtkMap } from './LdtkMap';
import { ldtkToTileMap } from './ldtkToTileMap';

// ── URL resolution ────────────────────────────────────────────────────────────

/**
 * Resolve a tileset-relative path against the base `.ldtk` URL.
 * Mirrors the approach used by the Tiled adapter.
 */
function resolveLdtkUrl(relPath: string, baseUrl: string): string {
  return new URL(relPath, baseUrl).href;
}

// ── Tileset loading ───────────────────────────────────────────────────────────

/**
 * Load one LDtk tileset definition into a runtime {@link TileSet}.
 * Returns `null` when the tileset has no atlas image (`relPath` is null or
 * empty) — those entries are silently skipped and their tiles will not render.
 */
async function loadLdtkTileset(
  def: LdtkTilesetDef,
  ldtkSource: string,
  context: AssetLoaderContext,
): Promise<TileSet | null> {
  if (!def.relPath) return null;

  const imageUrl = resolveLdtkUrl(def.relPath, ldtkSource);
  const texture = (await context.loader.load(Texture, imageUrl)) as Texture;

  const tileSize = def.tileGridSize;
  const spacing = def.spacing ?? 0;
  const margin = def.padding ?? 0;

  // Compute columns / tileCount from atlas dimensions.
  const innerWidth = def.pxWid - margin * 2;
  const innerHeight = def.pxHei - margin * 2;
  const columns = Math.floor((innerWidth + spacing) / (tileSize + spacing));
  const rows = Math.floor((innerHeight + spacing) / (tileSize + spacing));

  if (columns <= 0 || rows <= 0) return null;

  const tileCount = columns * rows;
  const region = new TextureRegion(texture, {
    x: 0,
    y: 0,
    width: def.pxWid,
    height: def.pxHei,
  });

  return new TileSet({
    name: def.identifier,
    texture: region,
    tileWidth: tileSize,
    tileHeight: tileSize,
    tileCount,
    columns,
    spacing,
    margin,
  });
}

// ── External level loading ───────────────────────────────────────────────────

/**
 * Resolve a level's external `.ldtkl` payload and merge its layer/field data
 * into the level record.
 *
 * LDtk's "Save levels to separate files" project option nulls out
 * `layerInstances` on the root document; the real layer data lives in a
 * sibling `<levelIdentifier>.ldtkl` file referenced by {@link LdtkLevel.externalRelPath}.
 * That file also carries its own `fieldInstances`, which is authoritative —
 * the root document's copy is typically stripped or stale for externalized
 * levels. Levels that already carry `layerInstances` (not externalized) are
 * returned unchanged.
 */
async function loadExternalLevel(
  level: LdtkLevel,
  ldtkSource: string,
  context: AssetLoaderContext,
): Promise<LdtkLevel> {
  if (level.layerInstances !== null || !level.externalRelPath) return level;

  const externalUrl = resolveLdtkUrl(level.externalRelPath, ldtkSource);
  // Cast without deep validation, matching the root document's fetch below —
  // structural errors surface as runtime exceptions during conversion.
  const external = (await context.fetchJson(externalUrl)) as LdtkLevel;
  const fieldInstances = external.fieldInstances ?? level.fieldInstances;

  return {
    ...level,
    layerInstances: external.layerInstances,
    ...(fieldInstances !== undefined && { fieldInstances }),
  };
}

// ── Public loader ─────────────────────────────────────────────────────────────

/**
 * Fetch a `.ldtk` file, load all referenced tileset images, resolve any
 * externalized (`.ldtkl`) levels, and return a fully assembled {@link LdtkMap}
 * with one runtime {@link import('@codexo/exojs-tilemap').TileMap} per level.
 *
 * Tilesets without an atlas image (`relPath = null`) are silently skipped;
 * their tiles will not appear in the rendered output.
 * @internal
 */
export async function loadLdtkMap(
  source: string,
  context: AssetLoaderContext,
): Promise<LdtkMap> {
  const raw = await context.fetchJson(source);
  // Cast without deep validation — structural errors surface as runtime
  // exceptions when we access fields during conversion.
  const data = raw as LdtkData;

  // Load all referenced tilesets and resolve externalized levels concurrently.
  const [tilesetEntries, levels] = await Promise.all([
    Promise.all(
      data.defs.tilesets.map(async (def) => {
        const ts = await loadLdtkTileset(def, source, context);
        return [def.uid, ts] as const;
      }),
    ),
    Promise.all(data.levels.map((level) => loadExternalLevel(level, source, context))),
  ]);

  const tilesets = new Map<number, TileSet>();
  for (const [uid, ts] of tilesetEntries) {
    if (ts !== null) tilesets.set(uid, ts);
  }

  return ldtkToTileMap({ ...data, levels }, { source, tilesets });
}
