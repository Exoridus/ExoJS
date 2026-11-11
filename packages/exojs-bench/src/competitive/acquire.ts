import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';

import { resolveMatrixCells, runMatrix, SOFTWARE_LAUNCH_FLAGS } from '../rendering/driver';
import { writeReport } from '../rendering/report';
import { parsePlatformDeclaration } from '../shared/provenance';
import { competitiveMatrixOptions, type CompetitiveOptions, competitivePlan, competitiveProtocolHash } from './plan';
import type { CompetitiveRun, CompetitiveSession, HostDeclaration, SourceStamp } from './types';

const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();

const sourceStamp = (): SourceStamp => {
  const root = git('rev-parse', '--show-toplevel');

  return {
    commit: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    dirty: git('status', '--porcelain').length > 0,
    trackedDiffSha256: sha256(execFileSync('git', ['diff', '--binary', 'HEAD'])),
    workspaceLockSha256: sha256(readFileSync(resolve(root, 'pnpm-lock.yaml'))),
    competitorLockSha256: sha256(readFileSync(resolve(root, 'packages/exojs-bench/competitors/pnpm-lock.yaml'))),
  };
};

const hostStamp = (options: CompetitiveOptions): HostDeclaration => ({
  os: `${platform()} ${release()}`,
  cpu: cpus()[0]?.model ?? 'UNAVAILABLE',
  logicalCpus: cpus().length,
  totalMemoryBytes: totalmem(),
  nodeVersion: process.version,
  machine: options.machine,
  driver: options.driver,
  power: options.power,
  background: options.background,
});

const writeJson = (path: string, value: unknown): void => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const runDirectory = (out: string, index: number): string => resolve(out, `run-${String(index + 1).padStart(3, '0')}`);

/** Records captured PNG identity; visual equivalence still requires inspection against the declared scenario. */
const captureManifest = (directory: string): void => {
  const entries = readdirSync(directory)
    .filter(file => file.endsWith('.png'))
    .sort()
    .map(file => {
      const bytes = readFileSync(resolve(directory, file));
      const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

      return { file, sha256: sha256(bytes), width: png ? bytes.readUInt32BE(16) : null, height: png ? bytes.readUInt32BE(20) : null };
    });

  writeJson(resolve(directory, 'manifest.json'), { status: 'REQUIRES_VISUAL_REVIEW', entries });
};

/** One invocation owns one repetition and delegates all rendering to the established matrix driver. */
export const acquireCompetitiveRun = async (options: CompetitiveOptions, runIndex: number): Promise<CompetitiveRun> => {
  const out = runDirectory(options.out, runIndex);

  if (existsSync(out)) {
    throw new Error(`Refusing to overwrite acquisition directory '${out}'. Choose a fresh --out.`);
  }

  mkdirSync(out, { recursive: true });
  const startedAt = new Date().toISOString();
  const source = sourceStamp();
  const host = hostStamp(options);
  const protocolHash = competitiveProtocolHash(options);
  const runId = randomUUID();
  const captureDir = options.capture ? resolve(out, 'captures') : undefined;

  if (captureDir !== undefined) {
    mkdirSync(captureDir);
  }

  let outcome: CompetitiveRun['outcome'] = null;
  let error: string | null = null;
  const declaredPlatform = parsePlatformDeclaration(options.platform);

  try {
    outcome = await runMatrix({
      ...competitiveMatrixOptions(options, runIndex),
      ...(declaredPlatform !== undefined && { platform: declaredPlatform }),
      ...(options.software && { launchFlags: SOFTWARE_LAUNCH_FLAGS }),
      ...(captureDir !== undefined && { captureDir }),
      onCellResult: result => {
        appendFileSync(resolve(out, 'cells.jsonl'), `${JSON.stringify(result)}\n`);
        console.log(
          `[competitive] run ${runIndex + 1}/${options.runs}: ${result.spec.engine}/${result.spec.config} ${result.spec.backend} ${result.spec.archetype} n=${result.spec.nodeCount} cycle=${result.spec.measurement?.cycle ?? 0}: ${result.status}`,
        );
      },
    });

    if (!outcome.results.some(result => result.status === 'ok')) {
      error = 'No selected cell completed; unavailable cells remain diagnostic evidence.';
    }

    if (options.cycles === 1) {
      writeReport({ ...outcome, plan: competitivePlan(options).meta }, out);
    }
  } catch (error_) {
    error = error_ instanceof Error ? error_.message : String(error_);
  }

  if (captureDir !== undefined) {
    captureManifest(captureDir);
  }

  const sourceAfter = sourceStamp();

  if (JSON.stringify(sourceAfter) !== JSON.stringify(source)) {
    error = [
      error,
      'Source identity changed during acquisition; observations may contain different implementations and cannot be compared.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const run: CompetitiveRun = {
    schemaVersion: 1,
    runId,
    runIndex,
    protocolHash,
    startedAt,
    finishedAt: new Date().toISOString(),
    source,
    sourceAfter,
    host,
    outcome,
    error,
  };
  writeJson(resolve(out, 'acquisition.json'), run);

  return run;
};

const launchRepetition = async (argv: readonly string[], index: number): Promise<number> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [...process.execArgv, resolve(import.meta.dirname, '../runCompetitive.ts'), ...argv, `--worker=${index}`],
      { stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      signal === null ? resolvePromise(code ?? 1) : reject(new Error(`Acquisition process terminated by ${signal}.`)),
    );
  });

/** Repetitions use separate Node processes and fresh browser sessions, with deterministic randomized arm/cell order. */
export const acquireCompetitiveSession = async (options: CompetitiveOptions, argv: readonly string[]): Promise<CompetitiveSession> => {
  const out = resolve(options.out);
  const path = resolve(out, 'competitive.json');

  if (existsSync(path) || existsSync(runDirectory(out, 0))) {
    throw new Error(`Refusing to overwrite benchmark evidence in '${out}'. Choose a fresh --out.`);
  }

  mkdirSync(out, { recursive: true });
  const runs: CompetitiveRun[] = [];
  const session: CompetitiveSession = {
    schemaVersion: 1,
    kind: 'exojs-competitive',
    createdAt: new Date().toISOString(),
    protocolHash: competitiveProtocolHash(options),
    options,
    plannedCells: resolveMatrixCells(competitiveMatrixOptions(options, 0)),
    runs,
  };
  writeJson(path, session);

  for (let index = 0; index < options.runs; index++) {
    const code = await launchRepetition(argv, index);
    const acquisition = resolve(runDirectory(out, index), 'acquisition.json');

    if (!existsSync(acquisition)) {
      throw new Error(
        `Repetition ${index + 1} exited with code ${code} before recording acquisition evidence. Partial session saved to '${path}'.`,
      );
    }

    runs.push(JSON.parse(readFileSync(acquisition, 'utf8')) as CompetitiveRun);
    writeJson(path, session);

    if (code !== 0 || runs.at(-1)!.error !== null) {
      break;
    }
  }

  return session;
};

export const readCompetitiveSession = (path: string): CompetitiveSession => {
  const value: unknown = JSON.parse(readFileSync(resolve(path), 'utf8'));

  if (
    typeof value !== 'object' ||
    value === null ||
    !('kind' in value) ||
    value.kind !== 'exojs-competitive' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('runs' in value) ||
    !Array.isArray(value.runs) ||
    !('options' in value) ||
    !('plannedCells' in value) ||
    !Array.isArray(value.plannedCells)
  ) {
    throw new Error(`'${path}' is not a version 1 competitive session. Historical result files require their original report command.`);
  }

  return value as CompetitiveSession;
};
