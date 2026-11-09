import type { DebugLayers, DebugOverlay, PerformanceLayer } from '@codexo/exojs/debug';

declare const overlay: DebugOverlay;

const layers: DebugLayers = overlay.layers;
const performance: PerformanceLayer = layers.performance;

export { performance };
