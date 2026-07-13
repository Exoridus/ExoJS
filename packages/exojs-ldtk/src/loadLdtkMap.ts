import { Asset } from '@codexo/exojs';
import { type AssetLoaderContext, TextureRegion } from '@codexo/exojs';
import { TileSet } from '@codexo/exojs-tilemap';

import type { LdtkData, LdtkLevel, LdtkTilesetDef } from './LdtkData';
import { getLdtkLevelEntries } from './ldtkLevelEntries';
import type { LdtkMap } from './LdtkMap';
import { ldtkToTileMap } from './ldtkToTileMap';
import { resolveLdtkUrl } from './url';

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
  // No atlas image (null or empty relPath): skip — tiles cannot render.
  if (def.relPath === null || def.relPath === '') return null;

  const imageUrl = resolveLdtkUrl(def.relPath, ldtkSource);
  const texture = await context.loader.load(Asset.kind('texture', imageUrl));

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
  // Already-inlined level, or no external file to fetch: return as-is.
  if (level.layerInstances !== null || level.externalRelPath === undefined || level.externalRelPath === '') {
    return level;
  }

  const externalUrl = resolveLdtkUrl(level.externalRelPath, ldtkSource);
  // Typed without deep validation (fetchJson<T> is an unvalidated assertion,
  // matching the root document's fetch below) — structural errors surface as
  // runtime exceptions during conversion.
  const external = await context.fetchJson<LdtkLevel>(externalUrl);
  const fieldInstances = external.fieldInstances ?? level.fieldInstances;

  return {
    ...level,
    layerInstances: external.layerInstances,
    ...(fieldInstances !== undefined && { fieldInstances }),
  };
}

/**
 * Rebuild an {@link LdtkData} document with its levels replaced by
 * `resolvedLevels` (external `.ldtkl` payloads merged in via
 * {@link loadExternalLevel}), preserving whichever root shape the source
 * document used — single-world (`levels`) or multi-world (`worlds[].levels`).
 *
 * `resolvedLevels` must be in the same flattened order
 * {@link getLdtkLevelEntries} produced for `data` — each world's slice is
 * recovered by walking `data.worlds` in that same order, so a second pass
 * through {@link getLdtkLevelEntries} (performed inside {@link ldtkToTileMap})
 * reproduces an identical flattened list, now with external levels resolved.
 */
function withResolvedLevels(data: LdtkData, resolvedLevels: readonly LdtkLevel[]): LdtkData {
  if (data.worlds && data.worlds.length > 0) {
    let cursor = 0;
    const worlds = data.worlds.map((world) => {
      const levels = resolvedLevels.slice(cursor, cursor + world.levels.length);
      cursor += world.levels.length;
      return { ...world, levels };
    });
    return { ...data, worlds };
  }

  return { ...data, levels: resolvedLevels };
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
  // Iterate the flattened level list (not raw data.levels) so multi-world
  // documents — whose levels live under worlds[].levels, with an empty root
  // levels[] — still get their external .ldtkl files resolved.
  const [tilesetEntries, resolvedLevels] = await Promise.all([
    Promise.all(
      data.defs.tilesets.map(async (def) => {
        const ts = await loadLdtkTileset(def, source, context);
        return [def.uid, ts] as const;
      }),
    ),
    Promise.all(
      getLdtkLevelEntries(data).map((entry) => loadExternalLevel(entry.level, source, context)),
    ),
  ]);

  const tilesets = new Map<number, TileSet>();
  for (const [uid, ts] of tilesetEntries) {
    if (ts !== null) tilesets.set(uid, ts);
  }

  return ldtkToTileMap(withResolvedLevels(data, resolvedLevels), { source, tilesets });
}
