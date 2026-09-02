/**
 * The one required check. Reads the `needs` context and the plan, and fails
 * when a job the plan asked for did not succeed - including one that was
 * skipped, which is how a path-filter regression would otherwise pass.
 *
 * Dependency-free: runs with plain `node` in a job that installs nothing.
 */

interface JobResult {
  result: 'success' | 'failure' | 'cancelled' | 'skipped';
}

const needs = JSON.parse(process.env['NEEDS'] ?? '{}') as Record<string, JobResult>;
const plan = JSON.parse(process.env['PLAN'] ?? '{}') as Record<string, string>;

/** Which plan flag says a job must have run. `plan` itself always must. */
const REQUIRED_WHEN: Record<string, string | true> = {
  plan: true,
  gates: true,
  test: 'hasTest',
  'skip-budget': 'skipBudget',
  build: 'build',
  verify: 'hasVerify',
  site: 'site',
  smoke: 'smoke',
};

let failed = false;

for (const [job, { result }] of Object.entries(needs)) {
  const when = REQUIRED_WHEN[job];
  const required = when === true || (when !== undefined && plan[when] === 'true');
  const ok = result === 'success' || (result === 'skipped' && !required);
  process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${job.padEnd(12)} ${result}${required ? '' : ' (not required)'}\n`);
  if (!ok) failed = true;
}

for (const job of Object.keys(REQUIRED_WHEN)) {
  if (!(job in needs)) {
    process.stdout.write(`FAIL ${job.padEnd(12)} missing from needs - add it to the verdict job\n`);
    failed = true;
  }
}

if (failed) {
  process.stdout.write('::error::A required CI job failed, was cancelled, or was skipped although the plan asked for it.\n');
  process.exit(1);
}

process.stdout.write('All required CI jobs satisfied.\n');
