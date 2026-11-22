// Engine-only rules deliberately remain a separate plugin namespace.
// No consumer configuration registers this entry by default.
import { exoEnginePlugin } from './index.js';

export default {
  meta: { name: 'exojs-engine' },
  rules: exoEnginePlugin.rules,
};
