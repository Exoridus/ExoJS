/**
 * Single source of truth for the static verification gates.
 *
 * These gates run in two places with two different shapes: the pre-push hook
 * wants all of them in one sequential pass, while CI wants them spread across
 * parallel jobs. Writing the command lists out in both places is what let the
 * required CI gate drift below the local hook - CI claimed parity in a comment
 * while silently omitting gates.
 *
 * So the lists live in `gate-groups.ts`, grouped by the CI job that owns them:
 *
 *   pnpm gates all        -> every group, sequentially (what `verify:quick` runs)
 *   pnpm gates typecheck  -> the Typecheck job
 *   pnpm gates lint       -> the Lint job
 *   pnpm gates sync       -> the Sync Checks job
 *   pnpm gates site       -> the Site build job
 *
 * Adding a gate means adding it to one group there. It then runs locally and in
 * CI with no second edit. Adding a whole *group* still needs a CI job to invoke
 * it - that is the one remaining manual step, and `test/ci/gate-parity.test.ts`
 * fails on a group no job claims rather than letting it stop running in CI.
 *
 * The group boundary is not cosmetic: `site` is separate because the site
 * consumes `@codexo/exojs` as a workspace package whose `types` point at
 * `dist/esm/index.d.ts`, so it can only run in a job that has the built dist.
 * That is why it cannot simply join the ungated typecheck job.
 */
import { GATE_GROUP_NAMES, GATE_GROUPS, type GateGroup } from './gate-groups.ts';
import { readOutputOptions } from '../lib/output.ts';
import { runCommand } from '../lib/run-command.ts';

const groupNames = GATE_GROUP_NAMES;
const outputOptions = readOutputOptions(process.argv.slice(2));
const requested = outputOptions.argv[0];

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

if (outputOptions.mode !== 'silent') {
  console.log(`Running ${scripts.length} gate(s) from group(s): ${selected.join(', ')}\n`);
}

const main = async (): Promise<void> => {
  for (const script of scripts) {
    if (outputOptions.mode === 'normal' || outputOptions.mode === 'verbose') {
      console.log(`\n=== pnpm ${script} ===\n`);
    }

    // `shell: true` so the pnpm shim resolves on Windows as well as on CI.
    const result = await runCommand({
      label: `gates-${script}`,
      command: 'pnpm',
      args: ['run', script],
      output: outputOptions.mode,
    });

    if (result.status !== 0) {
      if (outputOptions.mode === 'normal' || outputOptions.mode === 'verbose') {
        console.error(`\nGate failed: pnpm ${script} (exit code ${result.status})`);
      }
      process.exit(result.status);
    }
  }

  if (outputOptions.mode !== 'silent') console.log(`\nAll ${scripts.length} gate(s) passed.`);
};

await main();
