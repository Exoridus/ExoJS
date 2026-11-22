import { resolve } from 'node:path';

import { packageRoot, resolveCatalog } from '../../../packages/exojs-demo-assets/scripts/catalog.ts';
import { copyStandardMedia } from '../../../packages/exojs-demo-assets/scripts/generate.ts';

// Projects have separate module runners but share the Node process. Prepare the
// real package media once before either WebGL project imports the guide modules.
const prepared = Symbol.for('exojs.test.guide-media-prepared');
const processState = globalThis as typeof globalThis & { [prepared]?: boolean };

export const setup = (): void => {
  if (processState[prepared]) {
    return;
  }

  const count = copyStandardMedia(resolveCatalog(), resolve(packageRoot, 'media'));

  processState[prepared] = true;
  console.info(`[guide-media] prepared ${count} hash-checked standard package files`);
};
