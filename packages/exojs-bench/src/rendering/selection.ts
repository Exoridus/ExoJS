import type { RunPlan } from '../suite/plan';
import { timedFramesFor, warmupFramesFor } from './archetypes';
import type { CellSpec } from './EngineAdapter';

/**
 * Identity of one arm: engine, config, backend and archetype joined by NUL.
 * A space join would merge labels that themselves contain spaces, silently
 * dropping one of the two cells.
 */
const armKey = (cell: CellSpec): string => [cell.engine, cell.config, cell.backend, cell.archetype].join('\u{0}');

/**
 * Cell selection for one matrix invocation.
 *
 * `engines`, `configs` and `archetypes` filter by membership. `nodeCounts`
 * replaces the load dimension rather than filtering it; see that field.
 */
export interface MatrixSelection {
  /** Engine labels to keep (e.g. `['exojs', 'pixi']`), or omitted for all. */
  readonly engines?: readonly string[];
  /** Engine config labels to keep (e.g. `['current', 'retained']`), or omitted for all. */
  readonly configs?: readonly string[];
  /** Archetype ids to keep, or omitted for all. */
  readonly archetypes?: readonly string[];
  /**
   * Node counts to run, or omitted to run each archetype's own ladder.
   *
   * Replaces the load dimension rather than filtering it: every surviving arm
   * and archetype is re-emitted once per count listed here, including counts
   * outside the archetype's own ladder. Frame budgets are derived per count, so
   * an off-ladder cell is budgeted like any other.
   */
  readonly nodeCounts?: readonly number[];
}

/**
 * Narrow the matrix to the loads a resolved suite plan selects.
 *
 * Applied BEFORE any free filter, so `--archetype` narrows within the plan
 * rather than around it. A scenario the plan does not name loses every cell; a
 * scenario it names keeps exactly the plan's loads, whether or not they appear
 * on the domain ladder - the reference plan's headline loads deliberately
 * include rungs the development ladder never had.
 */
export const applyPlan = (cells: readonly CellSpec[], plan: RunPlan): CellSpec[] => {
  const loadsByScenario = new Map<string, number[]>();

  for (const workload of plan.workloads) {
    const values = loadsByScenario.get(workload.scenarioId) ?? [];

    values.push(workload.value);
    loadsByScenario.set(workload.scenarioId, values);
  }

  const arms = new Map<string, CellSpec>();

  for (const cell of cells) {
    if (!loadsByScenario.has(cell.archetype)) {
      continue;
    }

    arms.set(armKey(cell), cell);
  }

  return [...arms.values()].flatMap(cell =>
    loadsByScenario.get(cell.archetype)!.map(nodeCount => ({
      ...cell,
      nodeCount,
      timedFrames: timedFramesFor(nodeCount),
      warmupFrames: warmupFramesFor(nodeCount),
    })),
  );
};

/**
 * Narrow the matrix by the selection's engine/config/archetype lists, then -
 * when `nodeCounts` is set - replace each surviving arm's ladder with exactly
 * those counts, recomputing the frame budgets per count.
 *
 * Before the counts are re-emitted the cells are deduplicated to one per
 * engine/config/backend/archetype, so a multi-rung ladder contributes one cell
 * per requested count rather than one per rung.
 */
export const applySelection = (cells: readonly CellSpec[], selection: MatrixSelection): CellSpec[] => {
  const kept = cells.filter(
    cell =>
      (selection.engines === undefined || selection.engines.includes(cell.engine)) &&
      (selection.configs === undefined || selection.configs.includes(cell.config)) &&
      (selection.archetypes === undefined || selection.archetypes.includes(cell.archetype)),
  );

  if (selection.nodeCounts === undefined) {
    return kept;
  }

  // Re-emit one cell per requested count for each surviving arm/archetype pair,
  // deduplicated because the ladder contributed several cells per pair.
  const arms = new Map<string, CellSpec>();

  for (const cell of kept) {
    arms.set(armKey(cell), cell);
  }

  const nodeCounts = [...new Set(selection.nodeCounts)];

  return [...arms.values()].flatMap(cell =>
    nodeCounts.map(nodeCount => ({
      ...cell,
      nodeCount,
      timedFrames: timedFramesFor(nodeCount),
      warmupFrames: warmupFramesFor(nodeCount),
    })),
  );
};
