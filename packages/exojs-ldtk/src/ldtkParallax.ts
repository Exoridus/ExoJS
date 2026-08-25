// LDtk → runtime parallax conversion.
//
// LDtk's `parallaxFactorX`/`parallaxFactorY` (declared on `defs.layers[]`,
// range `[-1, 1]`) use `0` for normal camera speed. The runtime tilemap model
// uses the opposite convention: `1` is normal speed, and render code derives
// the camera-relative shift as `camCenter * (1 - parallaxX)`. Therefore the
// scroll conversion is `runtimeFactor = 1 - ldtkFactor`.
//
// LDtk's editor applies one uniform scale derived from the horizontal factor:
// `max(0.01, 1 - parallaxFactorX)`. Scaling happens around the layer origin.
// When scaling is disabled, the editor offsets the unscaled layer by half its
// dimensions times the factor so its centre follows the same parallax path.

import type { LdtkData } from './LdtkData';

/** Resolved runtime parallax transform for one LDtk layer instance. */
export interface LdtkLayerParallax {
  readonly parallaxX: number;
  readonly parallaxY: number;
  readonly parallaxScale: number;
  /** Definition offset plus LDtk's unscaled-parallax centre compensation. */
  readonly offsetX: number;
  /** Definition offset plus LDtk's unscaled-parallax centre compensation. */
  readonly offsetY: number;
}

/**
 * Resolve the runtime parallax transform for a layer instance. Missing
 * definitions and factors use LDtk's defaults: no shift and scale `1`.
 */
export const resolveLdtkLayerParallax = (
  data: LdtkData,
  layer: {
    readonly layerDefUid: number;
    readonly __cWid: number;
    readonly __cHei: number;
    readonly __gridSize: number;
  },
): LdtkLayerParallax => {
  const layerDef = data.defs.layers.find(def => def.uid === layer.layerDefUid);
  const factorX = layerDef?.parallaxFactorX ?? 0;
  const factorY = layerDef?.parallaxFactorY ?? 0;
  const scaling = layerDef?.parallaxScaling ?? true;

  return {
    parallaxX: 1 - factorX,
    parallaxY: 1 - factorY,
    parallaxScale: scaling && factorX !== 0 ? Math.max(0.01, 1 - factorX) : 1,
    offsetX: (layerDef?.pxOffsetX ?? 0) + (scaling ? 0 : -layer.__cWid * layer.__gridSize * 0.5 * factorX),
    offsetY: (layerDef?.pxOffsetY ?? 0) + (scaling ? 0 : -layer.__cHei * layer.__gridSize * 0.5 * factorY),
  };
};
