/**
 * Single source of truth for the static verification gates.
 *
 * These gates run in two places with two different shapes: the pre-push hook
 * wants all of them in one sequential pass, while CI wants them spread across
 * parallel jobs. Writing the command lists out in both places is what let the
 * required CI gate drift below the local hook — CI claimed parity in a comment
 * while silently omitting gates.
 *
 * So the lists live here, grouped by the CI job that owns them:
 *
 *   pnpm gates all        -> every group, sequentially (what `verify:quick` runs)
 *   pnpm gates typecheck  -> the Typecheck job
 *   pnpm gates lint       -> the Lint job
 *   pnpm gates sync       -> the Sync Checks job
 *   pnpm gates site       -> the Site build job
 *
 * Adding a gate means adding it to one group here. It then runs locally and in
 * CI with no second edit. Adding a whole *group* still needs a CI job to invoke
 * it — that is the one remaining manual step, and an unclaimed group is far
 * more visible than a missing command inside an existing list.
 *
 * The group boundary is not cosmetic: `site` is separate because the site
 * consumes `@codexo/exojs` as a workspace package whose `types` point at
 * `dist/esm/index.d.ts`, so it can only run in a job that has the built dist.
 * That is why it cannot simply join the ungated typecheck job.
 */
import { spawnSync } from 'node:child_process';

/** Package.json script names per owning CI job. Order within a group is the run order. */
const GATE_GROUPS = {
  typecheck: ['typecheck', 'typecheck:guides', 'typecheck:examples', 'typecheck:type-tests', 'typecheck:packages', 'typecheck:test'],
  lint: ['lint:all', 'format:check'],
  sync: ['docs:api:check', 'examples:sync:check'],
  site: ['typecheck:site'],
} as const satisfies Record<string, readonly string[]>;

type GateGroup = keyof typeof GATE_GROUPS;

const groupNames = Object.keys(GATE_GROUPS) as GateGroup[];
const requested = process.argv[2];

if (!requested) {
  console.error(`Usage: pnpm gates <all|${groupNames.join('|')}>`);
  process.exit(2);
}

if (requested !== 'all' && !groupNames.includes(requested as GateGroup)) {
  console.error(`Unknown gate group '${requested}'. Known groups: all, ${groupNames.join(', ')}`);
  process.exit(2);
}

const selected = requested === 'all' ? groupNames : [requested as GateGroup];
const scripts = selected.flatMap(group => GATE_GROUPS[group]);

console.log(`Running ${scripts.length} gate(s) from group(s): ${selected.join(', ')}\n`);

for (const script of scripts) {
  console.log(`\n=== pnpm ${script} ===\n`);

  // `shell: true` so the pnpm shim resolves on Windows as well as on CI.
  const result = spawnSync('pnpm', ['run', script], { stdio: 'inherit', shell: true });

  if (result.status !== 0) {
    console.error(`\nGate failed: pnpm ${script} (exit code ${result.status ?? 'signal'})`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nAll ${scripts.length} gate(s) passed.`);
