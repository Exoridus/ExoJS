// ExoJS's own ESLint rules: mistakes the type system either cannot reach at
// all (no-async-update, a compiler bivariance hole - see that rule for the
// details typescript-eslint's own recommendation not to enable `no-undef` on
// TypeScript code echoes) or that a syntactic check catches without paying
// for type information in every consumer project (no-deprecated-api, layered
// under the type-aware `@typescript-eslint/no-deprecated` this repository
// already runs, not a replacement for it).
//
// `correct-extension-binding`, the third rule the introducing brief for this
// plugin described, is not here. An extension is registered only through
// `ApplicationOptions.extensions` at Application construction - there is no
// `app.use`, and `installExtensions` (`src/extensions/lifetime.ts`) always
// calls `extension.install(app)` as a genuine method call, so the framework
// itself never detaches `install` from its descriptor. The only way to
// reproduce a detached-`this` bug here is to hand-assign a bound class
// method under a fresh object literal's `install` key - the generic
// "method read off an object and passed around loses its `this`" mistake,
// which `@typescript-eslint/unbound-method` already catches, type-aware, and
// which this repository and `extensionSourceConfig` already enable. A rule
// scoped to `install` specifically would either duplicate that coverage
// exactly or have to widen into the same generic problem `unbound-method`
// already owns.
import { noAsyncUpdate } from './rules/no-async-update.js';
import { noDeprecatedApi } from './rules/no-deprecated-api.js';

/** The ExoJS plugin object, registered under the `exo` prefix below. */
export const exoPlugin = {
  rules: {
    'no-async-update': noAsyncUpdate,
    'no-deprecated-api': noDeprecatedApi,
  },
};

/**
 * Turns the ExoJS plugin's rules on for `files`.
 *
 * `deprecatedApi` is the table `no-deprecated-api` checks `@codexo/exojs`
 * imports against - generate it with {@link collectDeprecatedExports} (see
 * `deprecatedApi.js`) from whatever source the caller has: this repository's
 * own `.ts` sources, or a consumer's installed `.d.ts` files. An empty table
 * (the default) leaves the rule wired in but never firing, which is exactly
 * its state today - nothing in the engine is deprecated yet.
 * @param {{ files: string[], deprecatedApi?: Record<string, string> }} options
 * @returns {object[]}
 */
export function exoRulesConfig({ files, deprecatedApi = {} }) {
  return [
    {
      files,
      plugins: { exo: exoPlugin },
      rules: {
        'exo/no-async-update': 'error',
        'exo/no-deprecated-api': ['error', { source: '@codexo/exojs', deprecated: deprecatedApi }],
      },
    },
  ];
}

export { collectDeprecatedExports, collectDeprecatedExportsFromSource } from './deprecatedApi.js';
