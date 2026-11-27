/**
 * `@arethetypeswrong/cli` gate for the packed tarballs.
 *
 * ExoJS ships browser/bundler-first ESM. The `bundler` resolution must be green
 * for every entrypoint; the `node16`/`node10` resolutions surface a documented,
 * accepted limitation (extensionless relative barrel re-exports), so the three
 * rules that encode exactly those symptoms are ignored. We additionally assert
 * the positive bundler signal so an ignored rule can never mask a genuine
 * bundler regression.
 *
 * The check parses attw's machine-readable `--format json` output rather than
 * scraping the human-rendered text: attw's text/table rendering is not stable
 * across versions (a `@latest` bump changed the layout and silently broke the
 * previous `bundler: 🟢` substring match - exit code 0, types fine, but the
 * marker string no longer present), so the version is also pinned. Invoked via
 * `pnpm dlx` (no permanent dependency added).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { CommandRunner } from './command-runner.ts';
import { sha256File } from './manifest.ts';

/** Pinned so the JSON shape and behaviour cannot drift mid-release. */
const ATTW_VERSION = '0.18.3';

const IGNORED_RULES = ['no-resolution', 'internal-resolution-error', 'cjs-resolves-to-esm'] as const;

export interface AttwResult {
  tarball: string;
  ok: boolean;
  detail?: string;
}

interface AttwResolution {
  resolution: { fileName: string } | null;
}

interface AttwEntrypoint {
  resolutions?: Record<string, AttwResolution | undefined>;
}

interface AttwProblem {
  kind?: string;
  /** Set on resolution-scoped problems (e.g. `bundler`, `node16-cjs`). */
  resolutionKind?: string;
  /** Set on option-scoped problems (e.g. `InternalResolutionError` → `node16`). */
  resolutionOption?: string;
}

interface AttwAnalysis {
  entrypoints?: Record<string, AttwEntrypoint>;
  problems?: AttwProblem[];
}

/**
 * Pure interpreter of attw's `--format json` payload for one tarball. `ok` iff
 * every entrypoint's `bundler` resolution resolved to a real file AND no
 * reported problem is scoped to the `bundler` resolution - the latter catches a
 * bundler defect that an `--ignore-rules` entry would otherwise hide from the
 * exit code. The JSON `problems` array lists every problem regardless of
 * `--ignore-rules` (that flag only affects the exit code), so the bundler scope
 * is asserted explicitly here.
 */
export const interpretAttwJson = (stdout: string): { ok: boolean; detail?: string } => {
  const start = stdout.indexOf('{');

  if (start === -1) {
    return { ok: false, detail: 'no attw json on stdout' };
  }

  let analysis: AttwAnalysis | undefined;

  try {
    analysis = (JSON.parse(stdout.slice(start)) as { analysis?: AttwAnalysis }).analysis;
  } catch {
    return { ok: false, detail: 'unparseable attw json' };
  }

  const entrypoints = analysis?.entrypoints ? Object.values(analysis.entrypoints) : [];

  if (entrypoints.length === 0) {
    return { ok: false, detail: 'no entrypoints analyzed' };
  }

  const unresolved = entrypoints.filter(e => e?.resolutions?.bundler?.resolution == null).length;
  const problems = Array.isArray(analysis?.problems) ? analysis.problems : [];
  const bundlerProblem = problems.find(p => p?.resolutionKind === 'bundler' || p?.resolutionOption === 'bundler');

  if (unresolved === 0 && !bundlerProblem) {
    return { ok: true };
  }

  const reasons = [
    unresolved > 0 ? `${unresolved} entrypoint(s) with no bundler resolution` : '',
    bundlerProblem ? `bundler problem: ${bundlerProblem.kind ?? 'unknown'}` : '',
  ].filter(Boolean);

  return { ok: false, detail: reasons.join('; ') };
};

/**
 * Everything needed to tell a broken artefact from a broken analysis.
 *
 * A red attw check on one tarball out of thirteen does not say which. This
 * prints the tarball's identity and contents, the entrypoint resolutions attw
 * actually returned, and - the decisive split - attw's verdict on the archive
 * next to its verdict on the same tree unpacked. A package that only fails as an
 * archive points at archive handling; one that fails both ways points at the
 * packed contents or at resolution itself.
 *
 * Emitted only on failure, so a green release stays quiet.
 */
const diagnoseTarball = (runner: CommandRunner, tarball: string, raw: string): void => {
  const say = (line: string): void => {
    process.stderr.write(`[attw] ${line}\n`);
  };

  const stat = statSync(tarball, { throwIfNoEntry: false });
  say(`tarball: ${resolve(tarball)}`);
  say(`bytes: ${stat?.size ?? 'MISSING'}`);
  say(`sha256: ${stat ? sha256File(tarball).sha256 : 'MISSING'}`);
  say(`cwd: ${process.cwd()}`);
  say(`environment: ${process.platform}/${process.arch} node ${process.version}`);

  // What is actually inside the archive, named exactly as it sits in the tarball.
  // Case matters: a wrong-case name resolves on Windows and not on Linux, which
  // is exactly the class of divergence this dump exists to surface. Tar always
  // reports forward slashes, so the comparison has to normalise the host's.
  let entries: string[] = [];

  try {
    entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .map(line => line.trim().replaceAll('\\', '/'))
      .filter(Boolean);
  } catch (error) {
    say(`listing failed: ${String(error)}`);
  }

  say(`entries: ${entries.length}`);

  for (const wanted of [
    'package/package.json',
    'package/dist/scaffold.d.ts',
    'package/dist/scaffold.js',
    'package/dist/index.d.ts',
    'package/dist/index.js',
  ]) {
    say(`  ${entries.includes(wanted) ? 'present' : 'ABSENT '} ${wanted}`);
  }

  const distEntries = entries.filter(e => e.startsWith('package/dist/'));
  say(`  package/dist/**: ${distEntries.length ? distEntries.join(' ') : '(none)'}`);

  // attw's own view, not this module's summary of it. The raw payload is kept
  // because a red check is exactly when the unfiltered answer is worth having.
  const start = raw.indexOf('{');

  if (start >= 0) {
    try {
      const analysis = (JSON.parse(raw.slice(start)) as { analysis?: AttwAnalysis }).analysis;
      const entrypoints = Object.entries(analysis?.entrypoints ?? {});

      if (entrypoints.length === 0) {
        say('entrypoints: (none reported)');
      }

      for (const [entrypoint, value] of entrypoints) {
        const resolutions = (value as AttwEntrypoint | undefined)?.resolutions ?? {};
        say(`entrypoint ${entrypoint}:`);

        for (const [kind, resolution] of Object.entries(resolutions)) {
          say(`  ${kind}: ${resolution?.resolution?.fileName ?? '(unresolved)'}`);
        }
      }

      say(`problems: ${JSON.stringify(analysis?.problems ?? [])}`);
    } catch (error) {
      say(`unparseable attw json: ${String(error)}`);
    }
  } else {
    say('attw produced no json');
  }

  // The decisive split: the same tree, unpacked and repacked. attw refuses a bare
  // directory without `--pack`, and its `--pack` path shells out to `npm pack`,
  // which can fail for reasons of its own - so the repack happens here, where a
  // failure is reported as such instead of being mistaken for a verdict.
  // Passes unpacked but fails as an archive and the analysis is right about the
  // package and wrong about the archive; fails both ways and the packed contents
  // are the problem.
  try {
    const staging = mkdtempSync(join(tmpdir(), 'exo-attw-'));

    try {
      execFileSync('tar', ['-xzf', tarball, '-C', staging], { stdio: 'ignore' });
      const unpacked = join(staging, 'package');
      const repacked = join(staging, 'repacked.tgz');
      // `--ignore-scripts` so the repack cannot fire the package's own `prepack`
      // build: this arm compares packaging, it must not rebuild the tree first,
      // and a failing build there would be mistaken for a packaging verdict.
      const pack = runner.run({
        command: 'pnpm',
        args: ['pack', '--pack-destination', staging, '--config.ignore-scripts=true', '--silent'],
        cwd: unpacked,
      });

      if (pack.code !== 0) {
        say(`unpacked repack failed: ${(pack.stderr || pack.stdout || '').trim().split('\n').slice(-2).join(' | ')}`);
      } else {
        const verdict = interpretAttwJson(runAndCapture(runner, repacked));
        say(`unpacked+repacked verdict: ${verdict.ok ? 'PASS' : `FAIL — ${verdict.detail ?? ''}`}`);
      }
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  } catch (error) {
    say(`unpacked run failed: ${String(error)}`);
  }
};

/** Runs attw against one target and returns its raw output, ignoring the exit code. */
const runAndCapture = (runner: CommandRunner, target: string): string => {
  const result = runner.run({
    command: 'pnpm',
    args: ['dlx', `@arethetypeswrong/cli@${ATTW_VERSION}`, target, '--ignore-rules', ...IGNORED_RULES, '--format', 'json'],
  });

  return result.stdout || result.stderr || '';
};

export const checkTarballTypes = (runner: CommandRunner, tarball: string): AttwResult => {
  const result = runner.run({
    command: 'pnpm',
    args: ['dlx', `@arethetypeswrong/cli@${ATTW_VERSION}`, tarball, '--ignore-rules', ...IGNORED_RULES, '--format', 'json'],
  });

  const raw = result.stdout || result.stderr || '';
  const interpreted = interpretAttwJson(raw);

  if (!interpreted.ok) {
    diagnoseTarball(runner, tarball, raw);
  }

  return {
    tarball,
    ok: interpreted.ok,
    detail: interpreted.ok ? undefined : `${interpreted.detail} (exit ${result.code})`,
  };
};

export const checkAllTarballTypes = (runner: CommandRunner, tarballs: string[]): { ok: boolean; results: AttwResult[] } => {
  const results = tarballs.map(t => checkTarballTypes(runner, t));

  return { ok: results.every(r => r.ok), results };
};
