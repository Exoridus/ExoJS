import type { AssetFactoryContext } from '@codexo/exojs';
import { Asset, logger, TextureRegion } from '@codexo/exojs';
import { TileSet } from '@codexo/exojs-tilemap';

import type { LdtkData, LdtkLevel, LdtkTilesetDef } from './LdtkData';
import { getLdtkLevelEntries } from './ldtkLevelEntries';
import type { LdtkMap } from './LdtkMap';
import { ldtkToTileMap } from './ldtkToTileMap';
import { resolveLdtkUrl } from './url';
import { LdtkFormatError, validateLdtkData, validateLdtkLevelData } from './validate';

// ── Tileset loading ───────────────────────────────────────────────────────────

/**
 * Load one LDtk tileset definition into a runtime {@link TileSet}.
 *
 * Returns `null` only for an embed-atlas tileset (`relPath` null or empty),
 * whose image ships with the LDtk editor and cannot be resolved from the
 * document - that case warns rather than passing unnoticed, because every tile
 * drawn from it is missing from the runtime map.
 *
 * @throws {LdtkFormatError} when the tileset names an atlas that cannot yield a
 * single tile (its declared size is smaller than one padded tile). Dropping it
 * would make every cell and entity referencing it vanish without a diagnostic.
 * @internal
 */
export async function loadLdtkTileset(def: LdtkTilesetDef, ldtkSource: string, context: AssetFactoryContext): Promise<TileSet | null> {
  if (def.relPath === null || def.relPath === '') {
    logger.warn(
      `LDtk: tileset "${def.identifier}" in "${ldtkSource}" has no atlas image (relPath is null) — it is an ` +
        'embed-atlas tileset whose image lives inside the LDtk editor. Every tile drawn from it is omitted ' +
        'from the runtime map. Re-export the tileset as a regular image atlas to render it.',
      { source: 'ldtk' },
    );

    return null;
  }

  const imageUrl = resolveLdtkUrl(def.relPath, ldtkSource);
  const texture = await context.dependencies.load(Asset.type('texture', imageUrl));

  const tileSize = def.tileGridSize;
  const spacing = def.spacing ?? 0;
  const margin = def.padding ?? 0;

  // Compute columns / tileCount from atlas dimensions.
  const innerWidth = def.pxWid - margin * 2;
  const innerHeight = def.pxHei - margin * 2;
  const columns = Math.floor((innerWidth + spacing) / (tileSize + spacing));
  const rows = Math.floor((innerHeight + spacing) / (tileSize + spacing));

  if (columns <= 0 || rows <= 0) {
    throw new LdtkFormatError(
      ldtkSource,
      `defs.tilesets/${def.identifier}`,
      `tileset "${def.identifier}" declares a ${def.pxWid}×${def.pxHei}px atlas with ` +
        `tileGridSize ${tileSize}, spacing ${spacing} and padding ${margin}, which does not fit a single tile`,
    );
  }

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
 * That file also carries its own `fieldInstances`, which is authoritative -
 * the root document's copy is typically stripped or stale for externalized
 * levels. Levels that already carry `layerInstances` (not externalized) are
 * returned unchanged.
 */
async function loadExternalLevel(level: LdtkLevel, ldtkSource: string, context: AssetFactoryContext): Promise<LdtkLevel> {
  // Already-inlined level, or no external file to fetch: return as-is.
  if (level.layerInstances !== null || level.externalRelPath === undefined || level.externalRelPath === null || level.externalRelPath === '') {
    return level;
  }

  const externalUrl = resolveLdtkUrl(level.externalRelPath, ldtkSource);
  // Validated against the same level shape as an inlined level, with the
  // `.ldtkl` file itself as the error source - a malformed external payload
  // must fail as loudly as a malformed root document.
  const external = validateLdtkLevelData(await context.dependencies.load(Asset.type('json', externalUrl)), externalUrl);
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
 * document used - single-world (`levels`) or multi-world (`worlds[].levels`).
 *
 * `resolvedLevels` must be in the same flattened order
 * {@link getLdtkLevelEntries} produced for `data` - each world's slice is
 * recovered by walking `data.worlds` in that same order, so a second pass
 * through {@link getLdtkLevelEntries} (performed inside {@link ldtkToTileMap})
 * reproduces an identical flattened list, now with external levels resolved.
 */
function withResolvedLevels(data: LdtkData, resolvedLevels: readonly LdtkLevel[]): LdtkData {
  if (data.worlds && data.worlds.length > 0) {
    let cursor = 0;
    const worlds = data.worlds.map(world => {
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
 * Read a `.ldtk` document, load all referenced tileset images, resolve any
 * externalized (`.ldtkl`) levels, and return a fully assembled {@link LdtkMap}
 * with one runtime {@link import('@codexo/exojs-tilemap').TileMap} per level.
 *
 * The fetched document - and every external `.ldtkl` payload - is validated
 * before use; a structural problem throws
 * {@link import('./validate').LdtkFormatError} naming the file and the
 * offending property path.
 *
 * A tileset whose declared atlas cannot hold a single tile is a
 * {@link import('./validate').LdtkFormatError} too - dropping it would make
 * every cell referencing it disappear without a diagnostic. An embed-atlas
 * tileset (`relPath = null`) is the one case that is skipped rather than
 * rejected, since its image lives inside the LDtk editor; that skip warns.
 * @internal
 */
export async function loadLdtkMap(context: AssetFactoryContext): Promise<LdtkMap> {
  const source = context.source;
  const data = validateLdtkData(await context.dependencies.load(Asset.type('json', source)), source);

  // Load all referenced tilesets and resolve externalized levels concurrently.
  // Iterate the flattened level list (not raw data.levels) so multi-world
  // documents - whose levels live under worlds[].levels, with an empty root
  // levels[] - still get their external .ldtkl files resolved.
  const [tilesetEntries, resolvedLevels] = await Promise.all([
    Promise.all(
      data.defs.tilesets.map(async def => {
        const ts = await loadLdtkTileset(def, source, context);
        return [def.uid, ts] as const;
      }),
    ),
    Promise.all(getLdtkLevelEntries(data).map(entry => loadExternalLevel(entry.level, source, context))),
  ]);

  const tilesets = new Map<number, TileSet>();
  for (const [uid, ts] of tilesetEntries) {
    if (ts !== null) tilesets.set(uid, ts);
  }

  return ldtkToTileMap(withResolvedLevels(data, resolvedLevels), { source, tilesets });
}
