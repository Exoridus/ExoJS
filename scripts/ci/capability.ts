/**
 * What a browser lane may conclude about the host it runs on.
 *
 * A browser suite can be red for three unrelated reasons: the engine is wrong,
 * the host cannot provide what the suite needs, or the test machinery itself
 * broke. This module keeps them apart. `probe` in `browser-probe.ts` asks the
 * browser what it can do; the functions here turn that answer, plus whether the
 * row is a blocking contract, into one of three outcomes:
 *
 *   PASS              the capability existed and the suite ran green
 *   UNSUPPORTED HOST  an informational row found a capability missing; nothing
 *                     was run, and nothing was proven either
 *   FAIL              a blocking row lost a capability, the suite failed, the
 *                     deadline passed or the probe itself could not run
 *
 * A skip is never positive support evidence. Pure and dependency-free, like the
 * rest of `scripts/ci`, so it is unit-testable without a browser.
 */

export type RowPolicy = 'required' | 'informational';

/** `capability`: a required capability is absent. `infrastructure`: the probe or launch failed. `timeout`: the outer deadline. `test`: the suite ran and failed. */
export type FailureKind = 'capability' | 'infrastructure' | 'timeout' | 'test';

export type RowStatus = 'PASS' | 'UNSUPPORTED HOST' | 'FAIL' | 'NOT RUN';

export interface CapabilityResult {
  readonly ok: boolean;
  readonly detail: string;
}

export interface ProbeReport {
  readonly browser: string;
  readonly capabilities: Readonly<Record<string, CapabilityResult>>;
  /** Free-form facts worth logging: adapter identity, feature list, renderer string. */
  readonly info: Readonly<Record<string, string>>;
}

/** The probe could not produce a report at all. */
export interface ProbeFailure {
  readonly error: string;
}

export interface RowVerdict {
  readonly status: RowStatus;
  readonly failure?: FailureKind;
  readonly detail: string;
  /** Whether the row's command should run at all. */
  readonly proceed: boolean;
  /** Process exit code the row contributes: nonzero only where the row is a blocking contract. */
  readonly exitCode: number;
}

export const isProbeFailure = (value: ProbeReport | ProbeFailure): value is ProbeFailure => 'error' in value;

const missingCapabilities = (report: ProbeReport, requires: readonly string[]): string[] =>
  requires.filter(name => report.capabilities[name]?.ok !== true).map(name => `${name}: ${report.capabilities[name]?.detail ?? 'not probed'}`);

/**
 * Decides, before anything is launched, whether the row's suite may run.
 *
 * A capability missing from a required row is a FAIL - the lane is expected to
 * provide it, and its disappearance must stay red. From an informational row it
 * is an UNSUPPORTED HOST with the concrete reason, and the suite is skipped.
 */
export const judgePreflight = (result: ProbeReport | ProbeFailure, requires: readonly string[], policy: RowPolicy): RowVerdict => {
  const blocking = policy === 'required';

  if (isProbeFailure(result)) {
    return {
      status: 'FAIL',
      failure: 'infrastructure',
      detail: `capability probe could not run: ${result.error}`,
      proceed: false,
      exitCode: blocking ? 1 : 0,
    };
  }

  const missing = missingCapabilities(result, requires);

  if (missing.length === 0) return { status: 'PASS', detail: `capabilities present: ${requires.join(', ') || 'none required'}`, proceed: true, exitCode: 0 };

  return blocking
    ? { status: 'FAIL', failure: 'capability', detail: `required capability missing - ${missing.join('; ')}`, proceed: false, exitCode: 1 }
    : { status: 'UNSUPPORTED HOST', detail: missing.join('; '), proceed: false, exitCode: 0 };
};

export interface RunOutcome {
  readonly status: number;
  readonly timedOut?: boolean;
  readonly aborted?: boolean;
  readonly cleanupError?: string;
}

/**
 * Decides what a finished command means. Only a green exit is a PASS; an
 * informational row that fails is reported as a FAIL but does not fail the job.
 */
export const judgeRun = (outcome: RunOutcome, policy: RowPolicy): RowVerdict => {
  const exit = (code: number): number => (policy === 'required' ? code : 0);

  if (outcome.timedOut)
    return { status: 'FAIL', failure: 'timeout', detail: 'outer deadline reached; the owned process tree was stopped', proceed: false, exitCode: exit(124) };
  if (outcome.aborted) return { status: 'FAIL', failure: 'infrastructure', detail: 'interrupted', proceed: false, exitCode: outcome.status || 130 };
  if (outcome.cleanupError !== undefined)
    return {
      status: 'FAIL',
      failure: 'infrastructure',
      detail: `process cleanup incomplete: ${outcome.cleanupError}`,
      proceed: false,
      exitCode: exit(outcome.status || 1),
    };
  if (outcome.status !== 0)
    return { status: 'FAIL', failure: 'test', detail: `suite failed with exit ${outcome.status}`, proceed: false, exitCode: exit(outcome.status) };

  return { status: 'PASS', detail: 'suite passed', proceed: false, exitCode: 0 };
};

/** One recorded row of a qualification run. */
export interface QualificationRow {
  readonly row: string;
  readonly policy: RowPolicy;
  readonly status: RowStatus;
  readonly failure?: FailureKind;
  readonly detail: string;
  readonly durationMs: number;
  readonly logPath?: string;
  readonly browser?: string;
  readonly info?: Readonly<Record<string, string>>;
  readonly finishedAt: string;
}

/** `PASS`, `UNSUPPORTED HOST: <reason>`, `FAIL (timeout): <reason>` - the form both logs and the step summary print. */
export const describeRow = (row: Pick<QualificationRow, 'status' | 'failure' | 'detail'>): string => {
  if (row.status === 'PASS') return 'PASS';
  const label = row.status === 'FAIL' && row.failure ? `FAIL (${row.failure})` : row.status;

  return `${label}: ${row.detail}`;
};

/** Human-readable capability lines for the log, in probe order. */
export const formatProbe = (report: ProbeReport): string[] => [
  `Browser: ${report.browser}`,
  ...Object.entries(report.capabilities).map(([name, result]) => `${name}: ${result.ok ? 'available' : 'unavailable'} - ${result.detail}`),
  ...Object.entries(report.info).map(([name, value]) => `${name}: ${value}`),
];

/** Latest record per row name, in name order; a row recorded twice keeps the newer one. */
export const latestRows = (rows: readonly QualificationRow[]): QualificationRow[] => {
  const byName = new Map<string, QualificationRow>();

  for (const row of rows) {
    const existing = byName.get(row.row);

    if (existing === undefined || existing.finishedAt <= row.finishedAt) byName.set(row.row, row);
  }

  return [...byName.values()].sort((a, b) => a.row.localeCompare(b.row));
};
