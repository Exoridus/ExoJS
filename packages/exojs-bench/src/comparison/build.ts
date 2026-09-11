import { PHYSICS_ARCHETYPES } from '../physics/archetypes';
import type { PhysicsCellResult } from '../physics/PhysicsAdapter';
import { ARCHETYPES } from '../rendering/archetypes';
import type { ArchetypeCategory, Backend, CellResult, StructuralCounters } from '../rendering/EngineAdapter';
import { exceedsFrameBudget } from '../shared/frameBudget';
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
 * - A row's node or body count is chosen from the archetype LADDERS before any
 *   timing is read (see {@link chooseRowCount}), so it can never be picked to
 *   suit the outcome. A rendering block goes further and puts every row on one
 *   count (see {@link chooseHeadlineCount}); the physics block cannot, and
 *   states each row's count on the row instead.
 * - A row with no evidenced mechanism does not enter the table.
 */

/** The reference arm every comparison is drawn against: ExoJS on its default path. */
export const REFERENCE_ENGINE = 'exojs';

/** The reference arm's config. The retained tier is an opt-in and is reported separately, never as "the ExoJS number". */
export const REFERENCE_CONFIG = 'current';

/** Legacy arm identities whose old profiles measured Phaser through WebGL1. */
const LEGACY_WEBGL1_ARM_KEYS: readonly string[] = ['phaser|default'];

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

/**
 * One competitor's outcome on one row.
 *
 * Each arm publishes two times, because they answer different questions. The
 * median is the field-comparable number - independent published comparisons
 * state a median at a fixed size - while the p95 is the step or frame a player
 * actually feels, so a cell whose two numbers are far apart hitches even where
 * its median reads as comfortable. Publishing the median alone would let a
 * periodically expensive workload pass as a cheap one.
 *
 * The verdict is drawn from the two MEDIANS and from nothing else. The p95 is
 * published beside them and never enters the ladder: it is the noisier of the
 * two statistics, and a verdict computed from it would be a different claim
 * wearing the same word.
 */
export interface ComparisonCell {
  /** Competitor arm label, e.g. `'pixi'`. */
  readonly competitor: string;
  /** Reference arm's median CPU time (ms), or `null` when it produced no comparable cell. */
  readonly referenceMs: number | null;
  /** Reference arm's 95th-percentile CPU time (ms) over the same timed window, or `null`. */
  readonly referenceP95Ms: number | null;
  /**
   * True when {@link referenceMs} is past a whole 60 fps frame; see
   * {@link '../shared/frameBudget'.FRAME_BUDGET_MS}.
   *
   * Carried in the published model rather than left to each consumer, so every
   * renderer of a document marks the same cells and the document states the line
   * it was published against instead of inviting each reader to pick one.
   */
  readonly referenceOverFrameBudget: boolean;
  /** Competitor's median CPU time (ms), or `null` when it produced no comparable cell. */
  readonly competitorMs: number | null;
  /** Competitor's 95th-percentile CPU time (ms) over the same timed window, or `null`. */
  readonly competitorP95Ms: number | null;
  /** True when {@link competitorMs} is past a whole 60 fps frame; see {@link referenceOverFrameBudget}. */
  readonly competitorOverFrameBudget: boolean;
  /** Computed ladder outcome, from the two medians. */
  readonly verdict: Verdict;
  /** Evidenced mechanism, or `null` when the counters carry none. */
  readonly mechanism: string | null;
}

/** One published row: an archetype at the count it was measured at, across every competitor. */
export interface ComparisonRow {
  /** Archetype id - the row's identity. */
  readonly archetype: string;
  /** The category section this row sits under. */
  readonly category: string;
  /**
   * Node or body count this row was measured at.
   *
   * In a rendering block every row carries the block's single headline count. In
   * the physics block the rows carry their OWN counts, because the physics
   * archetypes have per-archetype ladders; two physics rows are therefore never
   * comparable with each other, only the arms within one row are.
   */
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
   * The separate legacy WebGL1 block: CPU-time-only rows for profiles measured
   * before Phaser's WebGL2 context injection. Empty for new profiles.
   */
  readonly webgl1: readonly ComparisonRow[];
}

/** Key identifying one arm's cell within a backend. */
const cellKey = (engine: string, config: string, archetype: string, count: number): string => `${engine}|${config}|${archetype}|${count}`;

/** Identity used to preserve the old CPU-only Phaser block while new WebGL2 profiles migrate. */
const armKeyOf = (result: { readonly spec: { readonly engine: string; readonly config: string } }): string => `${result.spec.engine}|${result.spec.config}`;

/** Whether a result can be compared at all: it measured, and it measured something. */
const isComparable = (result: { status: string; note?: string }): boolean => result.status === 'ok';

/**
 * The count one row is published at: the largest rung of its own LADDER at which
 * every arm produced a valid cell.
 *
 * The candidates come from the ladder rather than from the timings, so the
 * choice cannot be steered by what the numbers turned out to be. The only thing
 * the measurements decide is whether a candidate survives, and a candidate some
 * arm failed to measure is not a comparison at all.
 */
export const chooseRowCount = (ladder: readonly number[], hasValidCell: (count: number) => boolean): number | null =>
  [...ladder].sort((a, b) => b - a).find(count => hasValidCell(count)) ?? null;

/**
 * The single node count a rendering block's whole table uses.
 *
 * The rendering archetypes share their node ladders and are meaningful side by
 * side at one size, so the block picks one count for every row: the largest
 * present in every comparable archetype's ladder, then lowered by
 * {@link chooseRowCount} until every arm produced a valid cell there. It can
 * never be picked per row to suit an outcome.
 *
 * The physics block does NOT work this way. Its archetypes carry per-archetype
 * ladders whose intersection is empty, and forcing one count on them would
 * either publish nothing or publish rows at a size chosen for a different
 * archetype; each physics row states its own count instead.
 */
export const chooseHeadlineCount = (archetypeLadders: ReadonlyArray<readonly number[]>, hasValidCell: (count: number) => boolean): number | null => {
  if (archetypeLadders.length === 0) {
    return null;
  }

  const shared = archetypeLadders.reduce<number[]>((candidates, ladder) => candidates.filter(count => ladder.includes(count)), [...archetypeLadders[0]!]);

  return chooseRowCount(shared, hasValidCell);
};

/** Build one backend's comparison from the measured rendering results. */
const buildBackend = (backend: Backend, results: readonly CellResult[]): BackendComparison => {
  const onBackend = results.filter(result => result.spec.backend === backend);
  const byKey = new Map(onBackend.map(result => [cellKey(result.spec.engine, result.spec.config, result.spec.archetype, result.spec.nodeCount), result]));
  const armEngines = [...new Set(onBackend.map(result => result.spec.engine))].filter(engine => engine !== REFERENCE_ENGINE).sort();
  const webgl1Engines = [...new Set(onBackend.filter(result => LEGACY_WEBGL1_ARM_KEYS.includes(armKeyOf(result))).map(result => result.spec.engine))];
  const competitors = armEngines.filter(engine => !webgl1Engines.includes(engine));
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

  const headlineCount = chooseHeadlineCount(
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
          referenceP95Ms: reference.cpuMsP95,
          referenceOverFrameBudget: exceedsFrameBudget(reference.cpuMsMedian),
          competitorMs: competitorCell.cpuMsMedian,
          competitorP95Ms: competitorCell.cpuMsP95,
          competitorOverFrameBudget: exceedsFrameBudget(competitorCell.cpuMsMedian),
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
          referenceP95Ms: reference.cpuMsP95,
          referenceOverFrameBudget: exceedsFrameBudget(reference.cpuMsMedian),
          competitorMs: competitorCell.cpuMsMedian,
          competitorP95Ms: competitorCell.cpuMsP95,
          competitorOverFrameBudget: exceedsFrameBudget(competitorCell.cpuMsMedian),
          verdict: compareMedians(reference.cpuMsMedian, competitorCell.cpuMsMedian),
          mechanism: null,
        });
      }

      if (cells.length > 0) {
        webgl1.push({ archetype: archetype.id, category: CATEGORY_TITLES[archetype.category], count: headlineCount, cells });
      }
    }
  }

  return { backend, headlineCount, competitors, sections, excluded, webgl1 };
};

/** The published comparison for a rendering run: one block per backend exercised. */
export const buildRenderingComparison = (results: readonly CellResult[]): readonly BackendComparison[] => {
  const backends = [...new Set(results.map(result => result.spec.backend))];

  return backends.map(backend => buildBackend(backend, results));
};

/**
 * The published comparison for a physics run. One block; physics has no backend
 * axis.
 *
 * Each row is measured at its OWN body count, taken from that archetype's own
 * ladder. The physics archetypes differ by nearly an order of magnitude in how
 * many bodies fit a frame, so their ladders straddle the frame budget at
 * different sizes and share no count at all; a single table-wide count would
 * either publish nothing or publish every row at a size chosen to suit one
 * archetype.
 *
 * The property the single count protected is kept by stating the count ON the
 * row instead: a reader compares the arms WITHIN a row, which is like for like
 * by construction, and never two rows against each other - which was never a
 * valid comparison anyway, since two archetypes are two different scenes. What
 * the single count actually prevented was the count being picked per row to
 * suit an outcome, and that is still prevented: a row's count comes from its
 * ladder, and the timings only decide whether the largest rung survives.
 */
export const buildPhysicsComparison = (results: readonly PhysicsCellResult[]): ComparisonSection => {
  const competitors = [...new Set(results.map(result => result.spec.engine))].filter(engine => engine !== 'exojs-physics').sort();
  // As in the rendering block: an archetype the run did not measure is absent
  // rather than empty, or every subset run would produce an empty table.
  const measured = new Set(results.filter(result => result.spec.engine === 'exojs-physics').map(result => result.spec.archetype));
  const comparable = PHYSICS_ARCHETYPES.filter(archetype => measured.has(archetype.id));
  const rows: ComparisonRow[] = [];

  for (const archetype of comparable) {
    const count = chooseRowCount(archetype.bodyCounts, candidate => {
      const cells = results.filter(result => result.spec.archetype === archetype.id && result.spec.bodyCount === candidate);

      // A count with NO cell for this archetype is not a valid candidate.
      // Testing only "every cell is ok" would accept it, since an empty set
      // satisfies that vacuously - which is how a run at one body count ended up
      // choosing another and publishing nothing.
      return cells.some(result => result.spec.engine === 'exojs-physics') && cells.every(result => isComparable(result));
    });

    if (count === null) {
      continue;
    }

    const reference = results.find(
      result => result.spec.engine === 'exojs-physics' && result.spec.archetype === archetype.id && result.spec.bodyCount === count,
    );
    const cells: ComparisonCell[] = [];

    for (const competitor of competitors) {
      const competitorCell = results.find(
        result => result.spec.engine === competitor && result.spec.archetype === archetype.id && result.spec.bodyCount === count,
      );

      if (reference === undefined || competitorCell === undefined || !isComparable(reference) || !isComparable(competitorCell)) {
        continue;
      }

      cells.push({
        competitor,
        referenceMs: reference.stepMsMedian,
        referenceP95Ms: reference.stepMsP95,
        referenceOverFrameBudget: exceedsFrameBudget(reference.stepMsMedian),
        competitorMs: competitorCell.stepMsMedian,
        competitorP95Ms: competitorCell.stepMsP95,
        competitorOverFrameBudget: exceedsFrameBudget(competitorCell.stepMsMedian),
        verdict: compareMedians(reference.stepMsMedian, competitorCell.stepMsMedian),
        mechanism: physicsMechanism(reference.structural, competitorCell.structural),
      });
    }

    if (cells.some(cell => cell.mechanism !== null)) {
      rows.push({ archetype: archetype.id, category: 'Physics', count, cells });
    }
  }

  return { title: 'Physics', rows };
};
