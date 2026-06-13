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
 * previous `bundler: 🟢` substring match — exit code 0, types fine, but the
 * marker string no longer present), so the version is also pinned. Invoked via
 * `pnpm dlx` (no permanent dependency added).
 */
import type { CommandRunner } from './command-runner.ts';

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
 * reported problem is scoped to the `bundler` resolution — the latter catches a
 * bundler defect that an `--ignore-rules` entry would otherwise hide from the
 * exit code. The JSON `problems` array lists every problem regardless of
 * `--ignore-rules` (that flag only affects the exit code), so the bundler scope
 * is asserted explicitly here.
 */
export const interpretAttwJson = (stdout: string): { ok: boolean; detail?: string } => {
  const start = stdout.indexOf('{');
  if (start === -1) return { ok: false, detail: 'no attw json on stdout' };

  let analysis: AttwAnalysis | undefined;
  try {
    analysis = (JSON.parse(stdout.slice(start)) as { analysis?: AttwAnalysis }).analysis;
  } catch {
    return { ok: false, detail: 'unparseable attw json' };
  }

  const entrypoints = analysis?.entrypoints ? Object.values(analysis.entrypoints) : [];
  if (entrypoints.length === 0) return { ok: false, detail: 'no entrypoints analyzed' };

  const unresolved = entrypoints.filter(e => e?.resolutions?.bundler?.resolution == null).length;
  const problems = Array.isArray(analysis?.problems) ? analysis.problems : [];
  const bundlerProblem = problems.find(p => p?.resolutionKind === 'bundler' || p?.resolutionOption === 'bundler');

  if (unresolved === 0 && !bundlerProblem) return { ok: true };

  const reasons = [
    unresolved > 0 ? `${unresolved} entrypoint(s) with no bundler resolution` : '',
    bundlerProblem ? `bundler problem: ${bundlerProblem.kind ?? 'unknown'}` : '',
  ].filter(Boolean);
  return { ok: false, detail: reasons.join('; ') };
};

export const checkTarballTypes = (runner: CommandRunner, tarball: string): AttwResult => {
  const result = runner.run({
    command: 'pnpm',
    args: ['dlx', `@arethetypeswrong/cli@${ATTW_VERSION}`, tarball, '--ignore-rules', ...IGNORED_RULES, '--format', 'json'],
  });

  const interpreted = interpretAttwJson(result.stdout || result.stderr);
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
