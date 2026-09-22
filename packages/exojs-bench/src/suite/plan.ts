import { createHash } from 'node:crypto';

import type { LoadUnit, ScenarioLoads, SuiteKind } from './catalog';
import { loadIdFor, scenariosFor } from './catalog';

/** Benchmark domains a plan can be resolved for. */
export type PlanDomain = 'rendering' | 'physics';

/** One scenario load the plan selected, with everything a cell key needs. */
export interface WorkloadSpec {
  /** Archetype id in its own domain. */
  readonly scenarioId: string;
  /** Load identifier within the scenario. */
  readonly loadId: string;
  /** Scalar the domain matrix builds the cell from - node count or body count. */
  readonly value: number;
  /** Unit the load is counted in; carried so a figure is never quoted without it. */
  readonly unit: LoadUnit;
  /** Display label for loads the value/unit pair cannot state, e.g. a resolution. */
  readonly label?: string;
  /** Whether this is the scenario's headline load. */
  readonly primary: boolean;
  /** Whether this load was admitted by `--extreme` rather than by the suite itself. */
  readonly extreme: boolean;
}

/** Identity of one resolved plan, stamped into every artifact the run writes. */
export interface RunPlanMeta {
  /** Plan the run was resolved against. */
  readonly suite: SuiteKind;
  /** Stable name of the plan family. */
  readonly planId: 'exojs-comparison';
  /**
   * Revision of the catalog's published contract. Bumped when a reference load,
   * a scenario's membership or a unit changes, so two runs that resolved
   * different contracts can never be pooled under one identity.
   */
  readonly planRevision: number;
  /** Digest over the resolved workloads; see {@link computePlanHash}. */
  readonly planHash: string;
  /** Domain this plan covers. */
  readonly domain: PlanDomain;
  /** Whether extreme loads were admitted. */
  readonly extreme: boolean;
  /**
   * Whether the run narrowed the plan with free filters (`--archetype`,
   * `--engine`, `--nodes`, `--frames`).
   *
   * An exploratory run is never a published comparison: its cells do not match
   * the plan the comparison builder expects, so pooling it with a full run would
   * mix two different questions. A plan resolved WHOLE is publishable regardless
   * of how few cells it has - a smaller published contract is still a contract.
   */
  readonly exploratory: boolean;
}

/** A resolved plan: its identity and the workloads it selected. */
export interface RunPlan {
  readonly meta: RunPlanMeta;
  readonly workloads: readonly WorkloadSpec[];
  /**
   * Catalog scenarios with no archetype behind them yet, i.e. named capability
   * gaps. Reported rather than dropped: a comparison that quietly lost a
   * scenario reads exactly like one that never promised it.
   */
  readonly missingScenarios: readonly string[];
}

/** Current revision of the published catalog contract; see {@link RunPlanMeta.planRevision}. */
export const PLAN_REVISION = 1;

/**
 * Digest over a plan's semantic content only - suite, domain, and each selected
 * workload's scenario, load and unit.
 *
 * Deliberately excludes timestamps, output paths and host data: the hash answers
 * "did these two runs measure the same contract", and a path difference is not a
 * contract difference. A changed load value or unit is.
 */
export const computePlanHash = (suite: SuiteKind, domain: PlanDomain, workloads: readonly WorkloadSpec[]): string => {
  const body = workloads.map(workload => `${workload.scenarioId}/${workload.loadId}/${String(workload.value)}/${workload.unit}`).join('\n');

  return createHash('sha256')
    .update(`exojs-bench-plan/v1\n${suite}\n${domain}\n${String(PLAN_REVISION)}\n${body}`)
    .digest('hex')
    .slice(0, 16);
};

/**
 * Canonical key of one measured cell.
 *
 * Carries the arm, its configuration, the backend, the scenario revision and the
 * load, because each of those changes what was measured. Two results may only be
 * pooled when their keys match; anything coarser pools a WebGPU cell with a
 * WebGL2 one, or this revision of a scene with the previous one.
 */
export const cellKey = (parts: {
  readonly domain: PlanDomain;
  readonly engine: string;
  readonly config: string;
  readonly backend: string;
  readonly scenarioId: string;
  readonly loadId: string;
}): string => `${parts.domain}|${parts.engine}|${parts.config}|${parts.backend}|${parts.scenarioId}|${parts.loadId}`;

/** Whether a scenario's load belongs to the given suite, once `--extreme` is accounted for. */
const admits = (suite: SuiteKind, extreme: boolean, load: ScenarioLoads['loads'][number]): boolean => {
  if (load.extreme === true) {
    return suite === 'full' && extreme;
  }

  return suite === 'full' || load.reference;
};

/**
 * Resolve a suite into the workloads it selects.
 *
 * `ladders` maps every archetype id the domain implements to its own load
 * ladder. Two things follow from taking the whole domain rather than only the
 * catalog:
 *
 * - A catalog scenario with no archetype behind it is reported in
 *   {@link RunPlan.missingScenarios} rather than planned, so a capability gap is
 *   visible in the dry run instead of surfacing as a column of failed cells.
 * - `full` keeps every archetype the domain has, catalog or not, on its own
 *   ladder. The development matrix is what `full` means, and the ExoJS-internal
 *   probes deliberately absent from the published catalog must not disappear
 *   with it.
 */
export const resolveSuitePlan = (options: {
  readonly suite: SuiteKind;
  readonly domain: PlanDomain;
  readonly extreme?: boolean;
  readonly exploratory?: boolean;
  readonly ladders: ReadonlyMap<string, readonly number[]>;
}): RunPlan => {
  const extreme = options.extreme ?? false;

  if (extreme && options.suite !== 'full') {
    throw new Error('--extreme is only valid with --suite=full: an extreme load is a development probe and is never part of a published reference comparison.');
  }

  const workloads: WorkloadSpec[] = [];
  const missingScenarios: string[] = [];
  const catalogued = new Set<string>();

  for (const scenario of scenariosFor(options.domain)) {
    catalogued.add(scenario.scenarioId);

    if (!options.ladders.has(scenario.scenarioId)) {
      missingScenarios.push(scenario.scenarioId);
      continue;
    }

    for (const load of scenario.loads) {
      if (!admits(options.suite, extreme, load)) {
        continue;
      }

      workloads.push({
        scenarioId: scenario.scenarioId,
        loadId: load.loadId,
        value: load.value,
        unit: scenario.unit,
        ...(load.label !== undefined && { label: load.label }),
        primary: load.primary === true,
        extreme: load.extreme === true,
      });
    }
  }

  if (options.suite === 'full') {
    const unit: LoadUnit = options.domain === 'rendering' ? 'nodes' : 'bodies';

    for (const [scenarioId, ladder] of options.ladders) {
      if (catalogued.has(scenarioId)) {
        continue;
      }

      for (const value of ladder) {
        workloads.push({ scenarioId, loadId: loadIdFor(value), value, unit, primary: false, extreme: false });
      }
    }
  }

  return {
    meta: {
      suite: options.suite,
      planId: 'exojs-comparison',
      planRevision: PLAN_REVISION,
      planHash: computePlanHash(options.suite, options.domain, workloads),
      domain: options.domain,
      extreme,
      exploratory: options.exploratory ?? false,
    },
    workloads,
    missingScenarios,
  };
};

/** Load values the plan selected for one scenario, ascending. */
export const loadValuesFor = (plan: RunPlan, scenarioId: string): readonly number[] =>
  plan.workloads.filter(workload => workload.scenarioId === scenarioId).map(workload => workload.value);

/** Parse and validate the `--suite` selector. */
export const parseSuite = (raw: string | undefined): SuiteKind => {
  if (raw === undefined || raw === 'full') {
    return 'full';
  }

  if (raw === 'reference') {
    return 'reference';
  }

  throw new Error(`--suite must be one of [reference, full] (got '${raw}').`);
};
