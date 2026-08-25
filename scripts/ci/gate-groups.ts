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
    'typecheck:workers',
    'typecheck:type-tests',
    'typecheck:packages',
    'typecheck:test',
    'typecheck:scripts',
  ],
  lint: ['lint:all', 'lint:source-hygiene', 'lint:inline-source', 'lint:shaders', 'format:check'],
  sync: ['docs:api:check', 'examples:sync:check'],
  // `full-bundle:exports:check` reads every bundled package's built ESM barrel,
  // so it needs the same built dist this group's job already provides.
  site: ['typecheck:site', 'typecheck:site-scripts', 'full-bundle:exports:check'],
} as const satisfies Record<string, readonly string[]>;

export type GateGroup = keyof typeof GATE_GROUPS;

/** Group names in run order, which is also the order `gates all` uses. */
export const GATE_GROUP_NAMES = Object.keys(GATE_GROUPS) as GateGroup[];
