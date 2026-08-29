import { PHYSICS_ARCHETYPES } from '../physics/archetypes';
import type { PhysicsCellResult } from '../physics/PhysicsAdapter';
import { ARCHETYPES } from '../rendering/archetypes';
import type { ArchetypeCategory, Backend, CellResult, StructuralCounters } from '../rendering/EngineAdapter';
import { physicsMechanism, renderingMechanism } from './mechanism';
import type { Verdict } from './verdict';
import { compareMedians } from './verdict';

/**
 * Turns a measured matrix into the published comparison: rows are archetypes,
 * one column per competitor, every verdict computed and every row carrying an
 * evidenced mechanism.
 *
 * Three rules do the work here, and each removes a lever that could otherwise be
 * used to flatter the result:
 *
 * - No aggregation across archetypes, anywhere. Categories are section headings,
 *   never rows, because any mean over a category hides its worst cell.
 * - One node count for the whole headline table, chosen from the archetype
 *   ladders before any timing is read (see {@link chooseHeadlineNodeCount}), so
 *   it can never be picked per row to suit the outcome.
 * - A row with no evidenced mechanism does not enter the table.
 */

/** The reference arm every comparison is drawn against: ExoJS on its default path. */
export const REFERENCE_ENGINE = 'exojs';

/** The reference arm's config. The retained tier is an opt-in and is reported separately, never as "the ExoJS number". */
export const REFERENCE_CONFIG = 'current';

/**
 * Arms that render through a WebGL1 context and therefore never share a row with
 * the WebGL2/WebGPU arms.
 *
 * Phaser 4's renderer is WebGL1 (verified against the installed dist, see
 * `adapters/phaser.ts`), so a gap against it can be caused by the backend
 * generation as much as by the engine, and the harness's WebGL2 structural probe
 * cannot attach to report which. Its rows go into their own clearly delimited
 * block, comparing CPU time only and stating that they carry no structural
 * mechanism - an observation rather than a finding.
 */
const WEBGL1_ENGINES: readonly string[] = ['phaser'];

/** Category section order in the published table. */
const CATEGORY_ORDER: readonly ArchetypeCategory[] = [
  'node-scaling',
  'fill-and-state',
  'material-variety',
  'text',
  'render-targets',
  'camera-and-world',
  'submission',
];

/** Human-readable heading for each category. */
const CATEGORY_TITLES: Readonly<Record<ArchetypeCategory, string>> = {
  'node-scaling': 'Node scaling',
  'fill-and-state': 'Fill and GPU state',
  'material-variety': 'Material variety',
  text: 'Text',
  'render-targets': 'Render targets',
  'camera-and-world': 'Camera and world',
  submission: 'Submission paths',
};

/** One competitor's outcome on one row. */
export interface ComparisonCell {
  /** Competitor arm label, e.g. `'pixi'`. */
  readonly competitor: string;
  /** Reference arm's median CPU time (ms), or `null` when it produced no comparable cell. */
  readonly referenceMs: number | null;
  /** Competitor's median CPU time (ms), or `null` when it produced no comparable cell. */
  readonly competitorMs: number | null;
  /** Computed ladder outcome. */
  readonly verdict: Verdict;
  /** Evidenced mechanism, or `null` when the counters carry none. */
  readonly mechanism: string | null;
}

/** One published row: an archetype at the headline node count, across every competitor. */
export interface ComparisonRow {
  /** Archetype id - the row's identity. */
  readonly archetype: string;
  /** The category section this row sits under. */
  readonly category: string;
  /** Node or body count the row was measured at. */
  readonly count: number;
  /** One entry per competitor arm, in a stable order. */
  readonly cells: readonly ComparisonCell[];
}

/** A category section of the published table. */
export interface ComparisonSection {
  /** Section heading. */
  readonly title: string;
  /** Rows in archetype order. */
  readonly rows: readonly ComparisonRow[];
}

/** A row that was measured but kept out of the table, with the reason. */
export interface ExcludedRow {
  /** Archetype id. */
  readonly archetype: string;
  /** Why it is not in the table. */
  readonly reason: string;
}

/** One backend's published comparison. */
export interface BackendComparison {
  /** Backend these rows were measured on. */
  readonly backend: Backend;
  /** Node count every row in this block was measured at, or `null` when no single count qualified. */
  readonly headlineCount: number | null;
  /** Competitor arms present, in a stable order. */
  readonly competitors: readonly string[];
  /** Category sections. */
  readonly sections: readonly ComparisonSection[];
  /** Rows measured but excluded, with reasons - published so the omissions are auditable. */
  readonly excluded: readonly ExcludedRow[];
  /**
   * The separate WebGL1 block: CPU-time-only rows against the arms in
   * {@link WEBGL1_ENGINES}. Empty when no such arm ran on this backend.
   */
  readonly webgl1: readonly ComparisonRow[];
}

/** Key identifying one arm's cell within a backend. */
const cellKey = (engine: string, config: string, archetype: string, count: number): string => `${engine}|${config}|${archetype}|${count}`;

/** Whether a result can be compared at all: it measured, and it measured something. */
const isComparable = (result: { status: string; note?: string }): boolean => result.status === 'ok';

/**
 * The single node count the headline table uses.
 *
 * Chosen from the ARCHETYPE LADDERS first - the largest count present in every
 * comparable archetype's ladder - and then lowered until every arm actually
 * produced a valid cell there. Because the candidate set comes from the ladders
 * rather than from the timings, the choice cannot be steered by what the numbers
 * turned out to be; the only thing the measurements decide is whether the
 * candidate survives, and a candidate that some arm failed to measure is not a
 * comparison at all.
 */
export const chooseHeadlineNodeCount = (archetypeLadders: ReadonlyArray<readonly number[]>, hasValidCell: (count: number) => boolean): number | null => {
  if (archetypeLadders.length === 0) {
    return null;
  }

  const shared = archetypeLadders.reduce<number[]>((candidates, ladder) => candidates.filter(count => ladder.includes(count)), [...archetypeLadders[0]!]);

  for (const count of [...shared].sort((a, b) => b - a)) {
    if (hasValidCell(count)) {
      return count;
    }
  }

  return null;
};

/** Build one backend's comparison from the measured rendering results. */
const buildBackend = (backend: Backend, results: readonly CellResult[]): BackendComparison => {
  const onBackend = results.filter(result => result.spec.backend === backend);
  const byKey = new Map(onBackend.map(result => [cellKey(result.spec.engine, result.spec.config, result.spec.archetype, result.spec.nodeCount), result]));
  const armEngines = [...new Set(onBackend.map(result => result.spec.engine))].filter(engine => engine !== REFERENCE_ENGINE).sort();
  const competitors = armEngines.filter(engine => !WEBGL1_ENGINES.includes(engine));
  const webgl1Engines = armEngines.filter(engine => WEBGL1_ENGINES.includes(engine));
  // Only archetypes the run actually MEASURED can constrain the count. An
  // archetype absent from the run says nothing about which count is valid, and
  // letting it veto would make every subset run produce an empty table; it is
  // listed as an omission instead. An archetype that IS present and failed at a
  // count still lowers the choice - that is the case the rule exists for.
  const measured = new Set(
    onBackend.filter(result => result.spec.engine === REFERENCE_ENGINE && result.spec.config === REFERENCE_CONFIG).map(result => result.spec.archetype),
  );
  const comparable = ARCHETYPES.filter(archetype => archetype.crossArm && measured.has(archetype.id));

  // Which arms have to have produced a cell for a count to qualify: the reference
  // arm and every competitor, on every comparable archetype.
  const hasValidCell = (count: number): boolean =>
    comparable.every(archetype => {
      if (!archetype.nodeCounts.includes(count)) {
        return true;
      }

      const reference = byKey.get(cellKey(REFERENCE_ENGINE, REFERENCE_CONFIG, archetype.id, count));

      if (reference === undefined || !isComparable(reference)) {
        return false;
      }

      // A competitor that sits the archetype out (`coversArchetype`) has no cell
      // and must not veto the count; one that HAS a cell must have measured it.
      return competitors.every(competitor => {
        const cell = [...byKey.values()].find(
          result => result.spec.engine === competitor && result.spec.archetype === archetype.id && result.spec.nodeCount === count,
        );

        return cell === undefined || isComparable(cell);
      });
    });

  const headlineCount = chooseHeadlineNodeCount(
    comparable.map(archetype => archetype.nodeCounts),
    hasValidCell,
  );

  const excluded: ExcludedRow[] = ARCHETYPES.filter(archetype => !archetype.crossArm || !measured.has(archetype.id)).map(archetype => ({
    archetype: archetype.id,
    reason: archetype.crossArm
      ? 'not measured in this run'
      : 'ExoJS-internal structural probe: a competitor arm renders a different scene here, so a wall-clock comparison would not be like for like',
  }));

  const sections: ComparisonSection[] = [];

  for (const category of CATEGORY_ORDER) {
    const rows: ComparisonRow[] = [];

    for (const archetype of comparable.filter(candidate => candidate.category === category)) {
      // The headline count is one number for the whole table; an archetype whose
      // ladder does not contain it is reported in the full sweep instead of being
      // given a count of its own.
      if (headlineCount === null || !archetype.nodeCounts.includes(headlineCount)) {
        excluded.push({
          archetype: archetype.id,
          reason:
            headlineCount === null
              ? 'no single node count qualified for the headline table on this backend'
              : `its ladder does not contain the headline node count (${headlineCount}); see the full sweep`,
        });

        continue;
      }

      const reference = byKey.get(cellKey(REFERENCE_ENGINE, REFERENCE_CONFIG, archetype.id, headlineCount));
      const cells: ComparisonCell[] = [];

      for (const competitor of competitors) {
        const competitorCell = onBackend.find(
          result => result.spec.engine === competitor && result.spec.archetype === archetype.id && result.spec.nodeCount === headlineCount,
        );

        if (reference === undefined || competitorCell === undefined || !isComparable(reference) || !isComparable(competitorCell)) {
          continue;
        }

        const counters = (result: CellResult): StructuralCounters | null => (result.structural.drawCalls > 0 ? result.structural : null);
        const mechanism = renderingMechanism(counters(reference), counters(competitorCell));

        cells.push({
          competitor,
          referenceMs: reference.cpuMsMedian,
          competitorMs: competitorCell.cpuMsMedian,
          verdict: compareMedians(reference.cpuMsMedian, competitorCell.cpuMsMedian),
          mechanism,
        });
      }

      // The mechanism rule: a row where NO competitor comparison could be
      // evidenced does not enter the table.
      if (cells.length === 0) {
        excluded.push({ archetype: archetype.id, reason: 'no arm pair produced a comparable cell at the headline node count' });

        continue;
      }

      if (cells.every(cell => cell.mechanism === null)) {
        excluded.push({
          archetype: archetype.id,
          reason: 'no structural mechanism could be evidenced for any arm pair (the arm reported no counters), so the row would be a number without a cause',
        });

        continue;
      }

      rows.push({ archetype: archetype.id, category: CATEGORY_TITLES[category], count: headlineCount, cells });
    }

    if (rows.length > 0) {
      sections.push({ title: CATEGORY_TITLES[category], rows });
    }
  }

  // The WebGL1 block. Built after the main table and deliberately NOT subject to
  // the mechanism rule: these arms cannot report counters at all, so applying it
  // would silently delete the block the design asks for. The rows are labelled as
  // CPU-time-only observations instead.
  const webgl1: ComparisonRow[] = [];

  if (headlineCount !== null && webgl1Engines.length > 0) {
    for (const archetype of comparable) {
      if (!archetype.nodeCounts.includes(headlineCount)) {
        continue;
      }

      const reference = byKey.get(cellKey(REFERENCE_ENGINE, REFERENCE_CONFIG, archetype.id, headlineCount));
      const cells: ComparisonCell[] = [];

      for (const competitor of webgl1Engines) {
        const competitorCell = onBackend.find(
          result => result.spec.engine === competitor && result.spec.archetype === archetype.id && result.spec.nodeCount === headlineCount,
        );

        if (reference === undefined || competitorCell === undefined || !isComparable(reference) || !isComparable(competitorCell)) {
          continue;
        }

        cells.push({
          competitor,
          referenceMs: reference.cpuMsMedian,
          competitorMs: competitorCell.cpuMsMedian,
          verdict: compareMedians(reference.cpuMsMedian, competitorCell.cpuMsMedian),
          mechanism: null,
        });
      }

      if (cells.length > 0) {
        rowsIntoWebgl1(webgl1, archetype.id, CATEGORY_TITLES[archetype.category], headlineCount, cells);
      }
    }
  }

  return { backend, headlineCount, competitors, sections, excluded, webgl1 };
};

/** Append one WebGL1-block row; extracted only so the block's construction reads as one statement. */
const rowsIntoWebgl1 = (target: ComparisonRow[], archetype: string, category: string, count: number, cells: readonly ComparisonCell[]): void => {
  target.push({ archetype, category, count, cells });
};

/** The published comparison for a rendering run: one block per backend exercised. */
export const buildRenderingComparison = (results: readonly CellResult[]): readonly BackendComparison[] => {
  const backends = [...new Set(results.map(result => result.spec.backend))];

  return backends.map(backend => buildBackend(backend, results));
};

/** The published comparison for a physics run. One block; physics has no backend axis. */
export const buildPhysicsComparison = (results: readonly PhysicsCellResult[]): ComparisonSection => {
  const competitors = [...new Set(results.map(result => result.spec.engine))].filter(engine => engine !== 'exojs-physics').sort();
  // As in the rendering block: an archetype the run did not measure cannot
  // constrain the shared body count, or every subset run would produce an empty
  // table. One that WAS measured and failed still lowers the choice.
  const measured = new Set(results.filter(result => result.spec.engine === 'exojs-physics').map(result => result.spec.archetype));
  const comparable = PHYSICS_ARCHETYPES.filter(archetype => measured.has(archetype.id));
  const headlineCount = chooseHeadlineNodeCount(
    comparable.map(archetype => archetype.bodyCounts),
    count =>
      comparable.every(archetype => {
        const cells = results.filter(result => result.spec.archetype === archetype.id && result.spec.bodyCount === count);

        // A count with NO cell for a measured archetype is not a valid candidate.
        // Testing only "every cell is ok" would accept it, since an empty set
        // satisfies that vacuously - which is how a run at 200 bodies ended up
        // choosing 4 000 and publishing nothing.
        return cells.some(result => result.spec.engine === 'exojs-physics') && cells.every(result => isComparable(result));
      }),
  );
  const rows: ComparisonRow[] = [];

  if (headlineCount === null) {
    return { title: 'Physics', rows };
  }

  for (const archetype of comparable) {
    const reference = results.find(
      result => result.spec.engine === 'exojs-physics' && result.spec.archetype === archetype.id && result.spec.bodyCount === headlineCount,
    );
    const cells: ComparisonCell[] = [];

    for (const competitor of competitors) {
      const competitorCell = results.find(
        result => result.spec.engine === competitor && result.spec.archetype === archetype.id && result.spec.bodyCount === headlineCount,
      );

      if (reference === undefined || competitorCell === undefined || !isComparable(reference) || !isComparable(competitorCell)) {
        continue;
      }

      cells.push({
        competitor,
        referenceMs: reference.stepMsMedian,
        competitorMs: competitorCell.stepMsMedian,
        verdict: compareMedians(reference.stepMsMedian, competitorCell.stepMsMedian),
        mechanism: physicsMechanism(reference.structural, competitorCell.structural),
      });
    }

    if (cells.some(cell => cell.mechanism !== null)) {
      rows.push({ archetype: archetype.id, category: 'Physics', count: headlineCount, cells });
    }
  }

  return { title: 'Physics', rows };
};
