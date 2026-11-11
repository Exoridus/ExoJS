import type { MatrixOutcome } from '../rendering/driver';
import type { CellSpec } from '../rendering/EngineAdapter';
import type { CompetitiveOptions } from './plan';

export interface SourceStamp {
  readonly commit: string;
  readonly tree: string;
  readonly dirty: boolean;
  readonly trackedDiffSha256: string;
  readonly workspaceLockSha256: string;
  readonly competitorLockSha256: string;
}

export interface HostDeclaration {
  readonly os: string;
  readonly cpu: string;
  readonly logicalCpus: number;
  readonly totalMemoryBytes: number;
  readonly nodeVersion: string;
  readonly machine: string;
  readonly driver: string;
  readonly power: string;
  readonly background: string;
}

/** One fresh Node invocation, with fresh browser sessions for each arm. */
export interface CompetitiveRun {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly runIndex: number;
  readonly protocolHash: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly source: SourceStamp;
  readonly sourceAfter?: SourceStamp;
  readonly host: HostDeclaration;
  readonly outcome: MatrixOutcome | null;
  readonly error: string | null;
}

/** Diagnostic output; promotion into the published reference profiles is a separate review. */
export interface CompetitiveSession {
  readonly schemaVersion: 1;
  readonly kind: 'exojs-competitive';
  readonly createdAt: string;
  readonly protocolHash: string;
  readonly options: CompetitiveOptions;
  readonly plannedCells: readonly CellSpec[];
  readonly runs: readonly CompetitiveRun[];
}
