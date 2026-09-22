import { describe, expect, it } from 'vitest';

import { PHYSICS_ARCHETYPES } from '../src/physics/archetypes';
import { ARCHETYPES } from '../src/rendering/archetypes';
import type { CellSpec } from '../src/rendering/EngineAdapter';
import { applyPlan } from '../src/rendering/selection';
import type { ScenarioLoads } from '../src/suite/catalog';
import { PHYSICS_SCENARIOS, primaryLoadOf, RENDERING_SCENARIOS } from '../src/suite/catalog';
import type { PlanDomain } from '../src/suite/plan';
import { cellKey, parseSuite, resolveSuitePlan } from '../src/suite/plan';

const RENDERING_LADDERS = new Map<string, readonly number[]>(ARCHETYPES.map(archetype => [archetype.id as string, archetype.nodeCounts]));
const PHYSICS_LADDERS = new Map<string, readonly number[]>(PHYSICS_ARCHETYPES.map(archetype => [archetype.id as string, archetype.bodyCounts]));

const planFor = (suite: 'reference' | 'full', domain: PlanDomain, extreme = false): ReturnType<typeof resolveSuitePlan> =>
  resolveSuitePlan({ suite, domain, extreme, ladders: domain === 'rendering' ? RENDERING_LADDERS : PHYSICS_LADDERS });

const scenarioIds = (plan: ReturnType<typeof resolveSuitePlan>): Set<string> => new Set(plan.workloads.map(workload => workload.scenarioId));

/**
 * ExoJS-internal probes: archetypes the published catalog deliberately omits
 * because a competitor arm renders some other scene on them. They must survive
 * `full` and must never reach `reference`.
 */
const INTERNAL_PROBES = [
  'split-screen',
  'instanced-batch',
  'mixed-material',
  'mixed-material-atlased',
  'mixed-sprite-mesh-static',
  'mixed-sprite-mesh-array',
  'overdraw',
];

describe('published workload catalog', () => {
  const catalogs: readonly (readonly [string, readonly ScenarioLoads[]])[] = [
    ['rendering', RENDERING_SCENARIOS],
    ['physics', PHYSICS_SCENARIOS],
  ];

  for (const [domain, scenarios] of catalogs) {
    it(`${domain}: every scenario names exactly one headline load, and it is part of the reference plan`, () => {
      const offenders = scenarios.filter(scenario => scenario.loads.filter(load => load.primary === true).length !== 1 || !primaryLoadOf(scenario).reference);

      expect(offenders.map(scenario => scenario.scenarioId)).toStrictEqual([]);
    });

    it(`${domain}: load ids and values are unique and ascending within a scenario`, () => {
      const offenders = scenarios.filter(scenario => {
        const values = scenario.loads.map(load => load.value);
        const ascending = values.every((value, index) => index === 0 || value > values[index - 1]!);

        return !ascending || new Set(scenario.loads.map(load => load.loadId)).size !== scenario.loads.length;
      });

      expect(offenders.map(scenario => scenario.scenarioId)).toStrictEqual([]);
    });

    it(`${domain}: every catalogued scenario is an archetype the domain implements`, () => {
      // A catalogued scenario whose id matches no archetype ladder resolves to
      // no workload at all, so it drops out of every plan silently - the
      // published page then shows one scenario fewer than the catalog promises
      // and nothing in the suite says so. Asserting the ids here is what turns
      // that into a failure at the catalog, where the typo is.
      const ladders = domain === 'rendering' ? RENDERING_LADDERS : PHYSICS_LADDERS;

      expect(scenarios.map(scenario => scenario.scenarioId).filter(id => !ladders.has(id))).toStrictEqual([]);
    });

    it(`${domain}: no extreme load is part of the reference plan`, () => {
      for (const scenario of scenarios) {
        for (const load of scenario.loads.filter(entry => entry.extreme === true)) {
          expect(load.reference).toBe(false);
        }
      }
    });
  }

  it('physics loads are ladder rungs, because a physics seed folds the body count in', () => {
    const offRungs = PHYSICS_SCENARIOS.flatMap(scenario =>
      scenario.loads
        .filter(load => PHYSICS_LADDERS.get(scenario.scenarioId)?.includes(load.value) !== true)
        .map(load => `${scenario.scenarioId}/${load.loadId}`),
    );

    expect(offRungs).toStrictEqual([]);
  });
});

describe('suite resolution', () => {
  it('reference selects the headline load of every catalogued scenario and no internal probe', () => {
    const plan = planFor('reference', 'rendering');
    const selected = scenarioIds(plan);

    for (const probe of INTERNAL_PROBES) {
      expect(selected).not.toContain(probe);
    }

    for (const scenario of RENDERING_SCENARIOS) {
      const headline = primaryLoadOf(scenario);

      expect(plan.workloads.some(workload => workload.scenarioId === scenario.scenarioId && workload.loadId === headline.loadId && workload.primary)).toBe(
        true,
      );
    }
  });

  it('reference carries no extreme load and no million-scale cell', () => {
    const plan = planFor('reference', 'rendering');

    expect(plan.workloads.some(workload => workload.extreme)).toBe(false);
    expect(plan.workloads.some(workload => workload.value >= 1_000_000)).toBe(false);
  });

  it('full keeps every archetype the domain implements, including the internal probes', () => {
    const selected = scenarioIds(planFor('full', 'rendering'));

    expect(ARCHETYPES.map(archetype => archetype.id).filter(id => !selected.has(id))).toStrictEqual([]);
  });

  it('full is a superset of reference, load by load', () => {
    const reference = planFor('reference', 'rendering');
    const full = new Set(planFor('full', 'rendering').workloads.map(workload => `${workload.scenarioId}/${workload.loadId}`));

    for (const workload of reference.workloads) {
      expect(full).toContain(`${workload.scenarioId}/${workload.loadId}`);
    }
  });

  it('full keeps every rung of every existing development ladder, extreme loads aside', () => {
    const full = new Set(planFor('full', 'rendering').workloads.map(workload => `${workload.scenarioId}/${String(workload.value)}`));
    const extreme = new Set(
      planFor('full', 'rendering', true)
        .workloads.filter(workload => workload.extreme)
        .map(workload => `${workload.scenarioId}/${String(workload.value)}`),
    );
    const missing = ARCHETYPES.flatMap(archetype =>
      archetype.nodeCounts.map(nodeCount => `${archetype.id}/${String(nodeCount)}`).filter(key => !full.has(key) && !extreme.has(key)),
    );

    expect(missing).toStrictEqual([]);
  });

  it('extreme loads are admitted only by full plus the flag', () => {
    expect(planFor('full', 'rendering').workloads.some(workload => workload.extreme)).toBe(false);
    expect(planFor('full', 'rendering', true).workloads.some(workload => workload.extreme)).toBe(true);
    expect(() => planFor('reference', 'rendering', true)).toThrow(/only valid with --suite=full/);
  });

  it('names a catalogued scenario with no archetype behind it instead of dropping it', () => {
    const plan = resolveSuitePlan({ suite: 'reference', domain: 'rendering', ladders: new Map([['static-heavy', [10_000]]]) });

    expect(plan.missingScenarios).toContain('tilemap-scroll');
    expect(scenarioIds(plan)).toStrictEqual(new Set(['static-heavy']));
  });

  it('parseSuite defaults to full so an unqualified run keeps meaning the development matrix', () => {
    expect(parseSuite(undefined)).toBe('full');
    expect(parseSuite('reference')).toBe('reference');
    expect(() => parseSuite('quick')).toThrow(/--suite must be one of/);
  });
});

describe('plan identity', () => {
  it('is stable for the same contract and differs across suites and domains', () => {
    expect(planFor('reference', 'rendering').meta.planHash).toBe(planFor('reference', 'rendering').meta.planHash);
    expect(planFor('reference', 'rendering').meta.planHash).not.toBe(planFor('full', 'rendering').meta.planHash);
    expect(planFor('reference', 'rendering').meta.planHash).not.toBe(planFor('reference', 'physics').meta.planHash);
  });

  it('changes when a planned load moves and not when an unmeasured detail does', () => {
    // An uncatalogued scenario, whose loads `full` takes from the ladder: the
    // one case where moving a rung moves the plan itself. A catalogued
    // scenario's loads come from the catalog, so its hash is deliberately
    // insensitive to the development ladder underneath it.
    const base = resolveSuitePlan({ suite: 'full', domain: 'rendering', ladders: new Map([['split-screen', [1_000]]]) });
    const same = resolveSuitePlan({ suite: 'full', domain: 'rendering', exploratory: true, ladders: new Map([['split-screen', [1_000]]]) });
    const moved = resolveSuitePlan({ suite: 'full', domain: 'rendering', ladders: new Map([['split-screen', [1_200]]]) });

    expect(same.meta.planHash).toBe(base.meta.planHash);
    expect(moved.meta.planHash).not.toBe(base.meta.planHash);
  });

  it('cell keys separate backend, arm configuration and load', () => {
    const base = { domain: 'rendering' as const, engine: 'exojs', config: 'current', backend: 'webgl2', scenarioId: 'static-heavy', loadId: '10k' };

    expect(cellKey(base)).toBe(cellKey({ ...base }));
    expect(cellKey(base)).not.toBe(cellKey({ ...base, backend: 'webgpu' }));
    expect(cellKey(base)).not.toBe(cellKey({ ...base, config: 'retained' }));
    expect(cellKey(base)).not.toBe(cellKey({ ...base, loadId: '100k' }));
  });
});

describe('applyPlan', () => {
  const cell = (archetype: string, nodeCount: number): CellSpec =>
    ({ engine: 'exojs', config: 'current', backend: 'webgl2', archetype, nodeCount, timedFrames: 1, warmupFrames: 1 }) as CellSpec;

  it('emits the plan loads for a named scenario, including rungs the ladder lacks', () => {
    const plan = resolveSuitePlan({ suite: 'reference', domain: 'rendering', ladders: RENDERING_LADDERS });
    const kept = applyPlan([cell('static-heavy', 1_000), cell('static-heavy', 25_000), cell('split-screen', 1_000)], plan);

    expect(kept.map(entry => entry.nodeCount).sort((a, b) => a - b)).toStrictEqual([1_000, 10_000, 100_000]);
    expect(kept.every(entry => entry.archetype === 'static-heavy')).toBe(true);
  });

  it('rebudgets frames per emitted load rather than inheriting the source cell', () => {
    const plan = resolveSuitePlan({ suite: 'reference', domain: 'rendering', ladders: RENDERING_LADDERS });
    const kept = applyPlan([cell('static-heavy', 1_000)], plan);
    const largest = kept.find(entry => entry.nodeCount === 100_000);

    expect(largest?.timedFrames).toBe(30);
    expect(largest?.warmupFrames).toBe(40);
  });
});
