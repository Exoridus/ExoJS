import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Decides whether a release tag may be published without re-running CI: the
 * tagged commit must carry the package.json version, sit on `main`, and have a
 * green `verdict` check run - the required check that only passes when every
 * lane the plan asked for succeeded on the push that brought the commit there.
 *
 * The Release workflow's `trust` job and the pre-push hook's tag path both run
 * this, so what a developer's push accepts is exactly what the workflow
 * accepts. Dependency-free and type-strippable like `lanes.ts`: plain `node`
 * runs it before any install.
 *
 * Usage: node scripts/ci/trust.ts <tag> [--main <ref>]
 *   --main defaults to `origin/main`; the caller fetches it first.
 */

const args = process.argv.slice(2);
const tag = args.find(arg => !arg.startsWith('--'));
const mainIndex = args.indexOf('--main');
const mainRef = mainIndex === -1 ? 'origin/main' : (args[mainIndex + 1] ?? 'origin/main');

const fail: (message: string) => never = message => {
  process.stdout.write(`${process.env['GITHUB_ACTIONS'] ? '::error::' : '[trust] '}${message}\n`);
  process.exit(1);
};

const capture = (command: string, commandArgs: readonly string[]): string | null => {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
};

if (!tag) fail('usage: node scripts/ci/trust.ts <tag> [--main <ref>]');

const sha = capture('git', ['rev-parse', `${tag}^{commit}`]);
if (!sha) fail(`Tag '${tag}' does not exist locally.`);

const version = `v${(JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version}`;
if (tag !== version) fail(`Tag '${tag}' does not match package.json version '${version}'.`);

const onMain = spawnSync('git', ['merge-base', '--is-ancestor', sha, mainRef], { stdio: 'ignore' });
if (onMain.status !== 0) fail(`${tag} (${sha}) is not on ${mainRef}. Releases are cut from main only.`);

const repository = process.env['GITHUB_REPOSITORY'] ?? '{owner}/{repo}';
const greenVerdicts = capture('gh', [
  'api',
  `repos/${repository}/commits/${sha}/check-runs?check_name=verdict&per_page=100`,
  '--jq',
  '[.check_runs[] | select(.conclusion == "success")] | length',
]);
if (greenVerdicts === null) fail("Could not read the tag commit's check runs - is `gh` installed and authenticated?");
if (greenVerdicts === '0') fail(`No successful 'verdict' check run on ${sha}. Let CI finish on main before tagging.`);

process.stdout.write(`${tag} = ${sha}, on ${mainRef}, verdict green.\n`);
