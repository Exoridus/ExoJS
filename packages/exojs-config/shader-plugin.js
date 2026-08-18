// Rollup/Vite plugin that inlines shader sources (`.vert`, `.frag`, `.wgsl`) as
// JS string modules, optionally comment-stripped (see `./shader-strip.js` for
// what that removes and why it is safe).
//
// Replaces `rollup-plugin-string` for these extensions so the same load hook
// serves the production build, the test lanes and the node bench loader.
import { readFileSync } from 'node:fs';

import { isShaderId, stripShaderSource } from './shader-strip.js';

/**
 * @param {{ minify?: boolean }} [options] `minify` strips comments and layout
 *   whitespace; leave it off wherever the shipped text should stay readable
 *   (the unminified module tree, dev builds, tests).
 * @returns {import('rollup').Plugin}
 */
export function createShaderPlugin({ minify = false } = {}) {
  return {
    name: 'exojs-shader-source',
    load(id) {
      const path = id.split('?')[0];

      if (!isShaderId(path)) return null;

      const source = readFileSync(path, 'utf8');

      return {
        code: `export default ${JSON.stringify(minify ? stripShaderSource(source) : source)};`,
        map: null,
      };
    },
  };
}
