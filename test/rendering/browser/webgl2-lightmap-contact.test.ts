/**
 * WebGL2 contact-shadow coverage for the lightmap renderer. See
 * `_lightmapContactSuite.ts` for the expectations both backends share.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { describeLightmapContact } from './_lightmapContactSuite';

describeLightmapContact('webgl2');
