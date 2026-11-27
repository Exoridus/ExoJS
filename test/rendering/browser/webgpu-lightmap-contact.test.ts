/**
 * WebGPU contact-shadow coverage for the lightmap renderer. See
 * `_lightmapContactSuite.ts` for the expectations both backends share.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { describeLightmapContact } from './_lightmapContactSuite';

describeLightmapContact('webgpu');
