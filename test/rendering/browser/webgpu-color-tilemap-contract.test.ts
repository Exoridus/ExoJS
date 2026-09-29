import { openWebGpuColorHarness } from './_colorProbeHarness';
import { defineColorTilemapProbes } from './_colorTilemapProbes';

defineColorTilemapProbes('WebGPU', openWebGpuColorHarness);
