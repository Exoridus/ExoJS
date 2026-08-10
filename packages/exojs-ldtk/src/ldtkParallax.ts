// LDtk → runtime parallax conversion.
//
// LDtk's `parallaxFactorX`/`parallaxFactorY` (declared on `defs.layers[]`,
// range `[-1, 1]`) describe "how much slower this layer scrolls relative to
// the camera", with `0` — the LDtk default — meaning "no parallax, scrolls at
// normal camera speed". LDtk itself does not mandate a rendering formula for
// this value: its own reference implementation (`ldtk-haxe-api`) only carries
// the raw field through and leaves interpretation to the consuming game.
//
// The runtime `TileLayer`/`ObjectLayer` model (shared with the Tiled adapter)
// instead uses `parallaxX`/`parallaxY` with the opposite convention: `1` (the
// default) means "no parallax, normal camera speed", and render code derives
// the on-screen shift as `camCenter * (1 - parallaxX)` — see
// `ChunkStreamer.ts` / `TileLayerNode.ts` / `ImageLayerNode.ts` in
// `@codexo/exojs-tilemap`. The two conventions share the same "no parallax"
// origin (LDtk `0` ↔ runtime `1`), so `runtimeFactor = 1 - ldtkFactor` is the
// direct, order-preserving conversion between them: a layer with a larger
// LDtk factor lags the camera more, which is exactly a smaller runtime
// `parallaxX`/`parallaxY`.

import type { LdtkData } from './LdtkData';

/** Resolved runtime parallax factors for one LDtk layer instance. */
export interface LdtkLayerParallax {
  readonly parallaxX: number;
  readonly parallaxY: number;
}

/**
 * Resolve the runtime `parallaxX`/`parallaxY` for the layer definition
 * identified by `layerDefUid`, converting from LDtk's `parallaxFactorX`/
 * `parallaxFactorY` convention to the runtime `TileLayer`/`ObjectLayer`
 * convention — see the module doc comment for the formula and why it exists.
 *
 * Falls back to `{ parallaxX: 1, parallaxY: 1 }` (no parallax) when the layer
 * definition cannot be found or declares no parallax factors, matching
 * LDtk's own default.
 */
export function resolveLdtkLayerParallax(data: LdtkData, layerDefUid: number): LdtkLayerParallax {
  const layerDef = data.defs.layers.find(def => def.uid === layerDefUid);
  const factorX = layerDef?.parallaxFactorX ?? 0;
  const factorY = layerDef?.parallaxFactorY ?? 0;
  return { parallaxX: 1 - factorX, parallaxY: 1 - factorY };
}
