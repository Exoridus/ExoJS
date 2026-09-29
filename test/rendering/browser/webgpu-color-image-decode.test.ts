import { defineColorImageDecodeProbes } from './_colorImageDecodeProbes';
import { openWebGpuColorHarness } from './_colorProbeHarness';

defineColorImageDecodeProbes('WebGPU', openWebGpuColorHarness);
