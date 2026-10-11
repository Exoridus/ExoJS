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
import { readOutputOptions } from '../lib/output.ts';
import { runCommand } from '../lib/run-command.ts';
import { GATE_GROUP_NAMES, GATE_GROUPS, type GateGroup } from './gate-groups.ts';
import { changedFilesBetween, selectLocalPolicy } from './local-policy.ts';

const groupNames = GATE_GROUP_NAMES;
const outputOptions = readOutputOptions(process.argv.slice(2));
const requested = outputOptions.argv[0];

if (!requested) {
  console.error(`Usage: pnpm gates <all|${groupNames.join('|')}>`);
  process.exit(2);
}

if (requested !== 'all' && requested !== 'affected' && !groupNames.includes(requested as GateGroup)) {
  console.error(`Unknown gate group '${requested}'. Known groups: all, affected, ${groupNames.join(', ')}`);
  process.exit(2);
}

const selected = requested === 'all' || requested === 'affected' ? groupNames : [requested as GateGroup];
let scripts: readonly string[] = selected.flatMap(group => GATE_GROUPS[group]);
let packageTypechecks: readonly string[] = [];

if (requested === 'affected') {
  const [base, head] = outputOptions.argv.slice(1);

  try {
    const policy = selectLocalPolicy(base && head ? changedFilesBetween(base, head) : []);
    scripts = policy.gates;
    packageTypechecks = policy.packageTypechecks;
  } catch {
    // A missing or invalid range must run the complete static contract.
    scripts = groupNames.flatMap(group => GATE_GROUPS[group]);
  }
}

if (outputOptions.mode !== 'silent') {
  console.log(
    `Running ${scripts.length + packageTypechecks.length} gate(s) from ${requested === 'affected' ? 'pushed paths' : `group(s): ${selected.join(', ')}`}\n`,
  );
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

  for (const name of packageTypechecks) {
    const result = await runCommand({
      label: `gates-typecheck-${name}`,
      command: 'pnpm',
      args: ['--filter', name, 'typecheck'],
      output: outputOptions.mode,
    });

    if (result.status !== 0) {
      process.exit(result.status);
    }
  }

  if (outputOptions.mode !== 'silent') {
    console.log(`\nAll ${scripts.length + packageTypechecks.length} gate(s) passed.`);
  }
};

await main();
