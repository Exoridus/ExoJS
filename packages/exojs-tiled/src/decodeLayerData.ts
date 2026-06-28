// Pre-validation decode pass for Tiled tile-layer data.
//
// Tiled can store tile-layer GIDs as plain CSV (a JSON array), or as a base64
// string that is optionally gzip/zlib/zstd compressed. The rest of the pipeline
// (validation, `TiledMap`, `toTileMap`) only deals with the decoded `number[]`
// GID array, so this pass runs first — during the async load phase — and
// rewrites any base64/compressed `data` (and infinite-map `chunks[].data`) into
// plain GID arrays in place. After it runs, the document looks like a CSV map to
// every downstream stage, which stays synchronous and unchanged.

import { Codec } from '@codexo/exojs';

import { TiledFormatError } from './validate';

/** Read a little-endian Uint32 GID array out of a decoded byte buffer. */
function bytesToGids(bytes: Uint8Array, source: string, path: string): number[] {
  if (bytes.length % 4 !== 0) {
    throw new TiledFormatError(source, path, `decoded tile data length ${bytes.length} is not a multiple of 4`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.length / 4;
  const gids = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    gids[i] = view.getUint32(i * 4, true); // Tiled writes little-endian.
  }
  return gids;
}

/** Decode one base64 `data` string into a GID array, applying any compression. */
async function decodeBase64Gids(
  data: string,
  compression: unknown,
  source: string,
  path: string,
): Promise<number[]> {
  let bytes = Codec.decodeBase64(data);

  if (compression === 'gzip') {
    bytes = await Codec.decompress(bytes, 'gzip');
  } else if (compression === 'zlib') {
    bytes = await Codec.decompress(bytes, 'deflate');
  } else if (compression === 'zstd') {
    throw new TiledFormatError(
      source,
      path,
      'zstd-compressed tile data is not supported (no native decoder; re-export with gzip/zlib or uncompressed)',
    );
  } else if (compression !== undefined && compression !== '') {
    throw new TiledFormatError(source, path, `unsupported tile layer compression ${JSON.stringify(compression)}`);
  }

  return bytesToGids(bytes, source, path);
}

/** Decode a single tile layer's `data` and/or `chunks[].data` in place. */
async function decodeTileLayer(layer: Record<string, unknown>, source: string, path: string): Promise<void> {
  if (layer.encoding !== 'base64') {
    return; // CSV / plain array — nothing to decode.
  }

  if (typeof layer.data === 'string') {
    layer.data = await decodeBase64Gids(layer.data, layer.compression, source, `${path}.data`);
  }

  if (Array.isArray(layer.chunks)) {
    await Promise.all(
      (layer.chunks as unknown[]).map(async (chunk, i) => {
        if (typeof chunk !== 'object' || chunk === null) return;
        const c = chunk as Record<string, unknown>;
        if (typeof c.data === 'string') {
          c.data = await decodeBase64Gids(c.data, layer.compression, source, `${path}.chunks[${i}].data`);
        }
      }),
    );
  }

  // Now that data is a plain GID array, drop the encoding/compression markers so
  // downstream validation treats it like a CSV layer.
  delete layer.encoding;
  delete layer.compression;
}

/** Recursively decode every tile layer under a `layers` array (groups nest). */
async function decodeLayers(layers: unknown, source: string, path: string): Promise<void> {
  if (!Array.isArray(layers)) {
    return;
  }
  await Promise.all(
    (layers as unknown[]).map(async (layer, i) => {
      if (typeof layer !== 'object' || layer === null) return;
      const l = layer as Record<string, unknown>;
      const layerPath = `${path}[${i}]`;
      if (l.type === 'tilelayer') {
        await decodeTileLayer(l, source, layerPath);
      } else if (l.type === 'group') {
        await decodeLayers(l.layers, source, `${layerPath}.layers`);
      }
    }),
  );
}

/**
 * Decode any base64/compressed tile-layer data in a raw Tiled map document into
 * plain GID arrays, mutating `raw` in place and returning it. Safe to call on a
 * pure-CSV map (it does nothing). Runs before validation.
 *
 * @throws {TiledFormatError} On zstd/unknown compression or malformed data.
 * @internal
 */
export async function decodeTiledLayerData(raw: unknown, source: string): Promise<unknown> {
  if (typeof raw === 'object' && raw !== null) {
    await decodeLayers((raw as Record<string, unknown>).layers, source, 'layers');
  }
  return raw;
}
