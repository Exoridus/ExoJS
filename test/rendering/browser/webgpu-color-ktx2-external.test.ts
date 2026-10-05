import { defineColorKtx2ExternalProbes } from './_colorKtx2ExternalProbes';
import { openWebGpuColorHarness } from './_colorProbeHarness';

defineColorKtx2ExternalProbes('WebGPU', openWebGpuColorHarness);
