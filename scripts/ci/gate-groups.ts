/**
 * The static verification gates, grouped by the CI job that owns them.
 *
 * This module holds data only, with no side effects, so tests can import the
 * groups and assert against them without the CLI in `gates.ts` running. See
 * that file for why the lists live in one place and what the group boundary
 * means.
 */

/** Package.json script names per owning CI job. Order within a group is the run order. */
export const GATE_GROUPS = {
  typecheck: [
    'typecheck',
    'typecheck:guides',
    'typecheck:examples',
    'typecheck:templates',
    'typecheck:workers',
    'typecheck:type-tests',
    'typecheck:packages',
    'typecheck:test',
    'typecheck:scripts',
  ],
  // Cheapest first (seconds each), `lint:all` last (about a minute), so a
  // trivial failure surfaces before the expensive ESLint pass starts.
  lint: [
    'lint:changelog',
    'lint:shaders',
    'verify:bench-results',
    'lint:file-symbols',
    'lint:config-paths',
    'lint:js-files',
    'lint:inline-source',
    'lint:source-hygiene',
    'format:check',
    'lint:react:shadow',
    'lint:exojs:shadow',
    'lint:all',
  ],
  // `perf:smoke` runs the benchmarks for their EXIT CODE, not their numbers -
  // a shared runner measures nothing meaningful. Every one of these executes
  // engine source in-process, so they rot silently against an API change or a
  // module-resolution change and no other lane touches them.
  sync: [
    'typecheck:native-api',
    'docs:api:check',
    'docs:history:check',
    'examples:sync:check',
    'legacy-shims:check',
    'assets:compact:check',
    'perf:smoke',
  ],
  // `dist:check` runs the freshness gate: a dist that lags the sources fails
  // in seconds here rather than after the site typecheck. The site job already
  // builds dist, so the check is a fast verification, and the hybrid-runtime
  // export completeness of the built tree is covered by the CI build job's
  // `test:release-dist`.
  site: ['dist:check', 'typecheck:site', 'typecheck:site-scripts'],
} as const satisfies Record<string, readonly string[]>;

export type GateGroup = keyof typeof GATE_GROUPS;

/** Group names in run order, which is also the order `gates all` uses. */
export const GATE_GROUP_NAMES = Object.keys(GATE_GROUPS) as GateGroup[];

/**
 * Gates that read only tracked files: none needs the built `dist`, a browser or
 * a compiler, and each finishes in seconds. A selection runs these first, ahead
 * of any `dist` rebuild, so a formatting or hygiene failure is reported before
 * the expensive work starts.
 */
export const FAST_GATES: readonly string[] = [
  'lint:changelog',
  'lint:shaders',
  'verify:bench-results',
  'lint:file-symbols',
  'lint:config-paths',
  'lint:js-files',
  'lint:inline-source',
  'lint:source-hygiene',
  'format:check',
];

/** Stable ordering for a gate selection: the fast gates first, everything else in the given order. */
export const orderGates = (names: readonly string[]): string[] => [
  ...FAST_GATES.filter(name => names.includes(name)),
  ...names.filter(name => !FAST_GATES.includes(name)),
];
