import { resolve } from 'node:path';

import { packageRoot, resolveCatalog } from '../../../packages/exojs-demo-assets/scripts/catalog.ts';
import { copyStandardMedia } from '../../../packages/exojs-demo-assets/scripts/generate.ts';

// The guide suite requests real package media before importing its modules.
// Both WebGL projects share the Node process, so the checked copy happens once.
const prepared = Symbol.for('exojs.test.guide-media-prepared');
const processState = globalThis as typeof globalThis & { [prepared]?: boolean };

export const prepareGuideMedia = (): void => {
  if (processState[prepared]) {
    return;
  }

  const count = copyStandardMedia(resolveCatalog(), resolve(packageRoot, 'media'));

  processState[prepared] = true;
  console.info(`[guide-media] prepared ${count} hash-checked standard package files`);
};
