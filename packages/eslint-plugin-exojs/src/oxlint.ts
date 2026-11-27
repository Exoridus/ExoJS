// Opt-in Oxlint bridge for the same source-level ExoJS rule implementations.
// The default ESLint integration remains authoritative until diagnostic parity is proven.
import { exoPlugin } from './index.js';

export default {
  meta: { name: 'exojs' },
  rules: exoPlugin.rules,
};
