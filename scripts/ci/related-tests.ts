import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { posix } from 'node:path';

const GRAPH_MODULE = /\.(?:[cm]?[jt]sx?|vert|frag|glsl|wgsl|json)$/;
const SOURCE_TREE = /^(?:src|test|examples)\/|^packages\/[^/]+\/(?:src|test)\/|^site\/src\//;
const COMMIT = /^(?:[a-f\d]{40}|[a-f\d]{64})$/i;

/** A planning hint only; the Vite selector independently verifies every actual changed input. */
export const isRelatedEligible = (files: readonly string[], exists: (file: string) => boolean = existsSync): boolean =>
  files.length > 0 &&
  files.every(
    file =>
      posix.normalize(file) === file &&
      SOURCE_TREE.test(file) &&
      GRAPH_MODULE.test(file) &&
      !/\.d\.[cm]?ts$/.test(file) &&
      !file.includes('\0') &&
      exists(file),
  );

export interface RelatedBase {
  readonly ref: string;
  readonly full: boolean;
}

/** Only a verified object id crosses into a shell command; an unknown ref forces full qualification. */
export const resolveRelatedBase = (base: string, cwd = process.cwd()): RelatedBase => {
  const result = spawnSync('git', ['merge-base', '--', base, 'HEAD'], { cwd, encoding: 'utf8', timeout: 30_000 });
  const ref = result.stdout?.trim();

  return result.status === 0 && ref && COMMIT.test(ref) ? { ref, full: false } : { ref: 'HEAD', full: true };
};

export interface AffectedCommandOptions {
  readonly base: RelatedBase;
  readonly projects: readonly string[];
  readonly name: string;
  readonly full?: boolean;
  readonly serial?: boolean;
}

/** One discovery and execution pass; file paths remain inside the NUL-safe Git reader and Vite graph. */
export const affectedTestCommand = ({ base, projects, name, full = false, serial = false }: AffectedCommandOptions): string => {
  if ((!COMMIT.test(base.ref) && !(base.ref === 'HEAD' && base.full)) || !/^[a-z][a-z\d-]*$/i.test(name)) {
    throw new Error('Affected-test commands require a verified base and a fixed report name.');
  }

  if (!projects.length || projects.some(project => !/^[a-z\d][a-z\d.*_-]*$/i.test(project))) {
    throw new Error('Affected-test commands require explicit, shell-safe project names.');
  }

  return [
    'node --import tsx scripts/ci/affected-plan.ts --run',
    `--base ${base.ref}`,
    full || base.full ? '--full' : '',
    `--output .workspace/affected-tests/local-${name}.json`,
    '--',
    ...[...new Set(projects)].map(project => `--project="${project}"`),
    serial ? '--no-file-parallelism' : '',
  ]
    .filter(Boolean)
    .join(' ');
};
