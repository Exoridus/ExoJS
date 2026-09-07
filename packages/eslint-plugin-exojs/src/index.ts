// ExoJS's own ESLint rules: mistakes the type system either cannot reach at
// all (an async override of a hook whose return type is plain `void`, a
// compiler bivariance hole) or that a syntactic check catches without paying
// for type information in every consumer project (everything else here).
//
// No rule in this plugin uses the TypeScript type checker, deliberately. Type
// information would answer questions these rules have to approximate - whether
// an imported `RenderPass` is really the engine's, whether a base class three
// files up eventually extends one - but it costs lint time in every project
// that installs this plugin, for mistakes that a class's own `extends` clause
// and a handful of distinctive method names already identify. Each rule states
// what its syntactic approximation therefore lets through.
//
// `correct-extension-binding`, a third rule an early brief for this plugin
// described, is not here. An extension is registered only through
// `ApplicationOptions.extensions` at Application construction - there is no
// `app.use`, and `installExtensions` always calls `extension.install(app)` as a
// genuine method call, so the framework itself never detaches `install` from
// its descriptor. The only way to reproduce a detached-`this` bug here is to
// hand-assign a bound class method under a fresh object literal's `install`
// key - the generic "method read off an object and passed around loses its
// `this`" mistake, which `@typescript-eslint/unbound-method` already catches,
// type-aware, and which the engine's own config already enables. A rule scoped
// to `install` specifically would either duplicate that coverage exactly or
// have to widen into the same generic problem `unbound-method` already owns.
import type { Linter } from 'eslint';

import { noAsyncRenderHook } from './rules/no-async-render-hook.js';
import { noAsyncUpdate } from './rules/no-async-update.js';
import { noDeprecatedApi } from './rules/no-deprecated-api.js';
import { noSelfEnabledCheck } from './rules/no-self-enabled-check.js';
import { noUnregisteredSystem } from './rules/no-unregistered-system.js';
import { requireSuperDestroy } from './rules/require-super-destroy.js';

/**
 * The ExoJS plugin object.
 *
 * Register it under the prefix `exo`; every rule name below and every message
 * in this package assumes it.
 */
export const exoPlugin = {
  rules: {
    'no-async-render-hook': noAsyncRenderHook,
    'no-async-update': noAsyncUpdate,
    'no-deprecated-api': noDeprecatedApi,
    'no-self-enabled-check': noSelfEnabledCheck,
    'no-unregistered-system': noUnregisteredSystem,
    'require-super-destroy': requireSuperDestroy,
  },
};

/**
 * Correctness rules: an authoring mistake the engine cannot reject at compile
 * time and will not report at runtime either.
 *
 * Every entry is `error`. These describe code that does not do what it says,
 * not a style preference, and a warning that nobody's CI fails on is a comment.
 */
const RECOMMENDED_RULES: Linter.RulesRecord = {
  'exo/no-async-update': 'error',
  'exo/no-async-render-hook': 'error',
  'exo/no-self-enabled-check': 'error',
  'exo/require-super-destroy': 'error',
  'exo/no-unregistered-system': 'error',
};

/**
 * Available tiers.
 *
 * `strict` is `recommended` plus the migration rules - checks that are about
 * moving off an API rather than about code being wrong today. Deprecation is
 * opt-in across the ecosystem (`eslint:recommended` carries no deprecation rule
 * at all, and `@typescript-eslint/no-deprecated` appears only in
 * `strict-type-checked`), which is why it is a separate tier - but it is
 * `error` there, and it is `error` here.
 */
export type ExoRulesTier = 'recommended' | 'strict';

/** Options for {@link exoRulesConfig}. */
export interface ExoRulesConfigOptions {
  /** Globs the rules apply to. */
  readonly files: string[];
  /**
   * The table `no-deprecated-api` checks `@codexo/exojs` imports against -
   * generate it with {@link collectDeprecatedExports} from whatever source is
   * at hand: the engine's own `.ts` sources in this repository, or the shipped
   * `.d.ts` files of an installed `@codexo/exojs` in a consumer project. An
   * empty table leaves the rule wired in but never firing.
   */
  readonly deprecatedApi?: Record<string, string>;
  /** Defaults to `recommended`. */
  readonly tier?: ExoRulesTier;
}

/**
 * Turns the ExoJS rules on for `files`.
 *
 * Registers the plugin as well as the rules. Two calls in one resolved config
 * are safe - they register the same plugin object - but a single call covering
 * every glob is simpler to read.
 */
export function exoRulesConfig({ files, deprecatedApi = {}, tier = 'recommended' }: ExoRulesConfigOptions): Linter.Config[] {
  const rules: Linter.RulesRecord = { ...RECOMMENDED_RULES };

  if (tier === 'strict') {
    rules['exo/no-deprecated-api'] = ['error', { source: '@codexo/exojs', deprecated: deprecatedApi }];
  }

  return [{ files, plugins: { exo: exoPlugin }, rules }];
}

export { collectDeprecatedExports, collectDeprecatedExportsFromSource } from './deprecatedApi.js';
export { EXO_DESTROY_BASE_CLASSES } from './rules/require-super-destroy.js';
