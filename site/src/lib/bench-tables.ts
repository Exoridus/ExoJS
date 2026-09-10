/**
 * The published profiles reshaped into the tables the benchmarks page draws.
 *
 * A table has one column per comparison pair - a rendering backend against one
 * arm, or one physics arm - and one row per archetype, so a reader follows a
 * single archetype across every backend and every opponent on one line. The
 * shape is derived entirely from the document: an arm that produced nothing
 * anywhere gets no column, and an archetype a backend did not measure keeps its
 * row and reports the gap rather than disappearing from it.
 *
 * There is no column for ExoJS itself. Its median belongs to the comparison and
 * is printed inside each cell beside the arm's, which repeats the value once per
 * opponent - a repetition worth paying for, because it makes every cell a whole
 * comparison that stands on its own. A separate reference column widened the
 * table, split each backend's header across an uneven number of columns, and
 * stacked into a block of its own on narrow screens, where a card should read as
 * a list of comparisons and nothing else.
 *
 * Only the arrangement lives here. Timings, ratios and verdicts are read from
 * the profile in `bench-profiles`, and no row is dropped, reordered by outcome
 * or merged with another.
 */

import {
  archetypeDescription,
  armLabel,
  armsOfSection,
  BACKEND_LABELS,
  type BenchProfileDocument,
  isWasmReferenceArm,
  type ProfileBackend,
  type ProfileCell,
  type ProfileRow,
} from './bench-profiles';

/** One comparison pair the table has a column for. */
export interface ComparisonColumn {
  readonly key: string;
  /** Heading the neighbouring columns share, such as the backend they were measured on; `null` where each column stands alone. */
  readonly group: string | null;
  /** What this column alone is measured under, such as the role an arm stands in. */
  readonly overline: string;
  readonly label: string;
}

/** One column's outcome on one row. */
export interface ComparisonEntry {
  readonly key: string;
  /** The published comparison, or `null` where this column produced none. */
  readonly cell: ProfileCell | null;
  /** Scene size this column measured the row at; `null` where the column does not carry the row at all. */
  readonly count: number | null;
}

/** One archetype, across every column of a table. */
export interface ComparisonRow {
  readonly key: string;
  readonly archetype: string;
  /** Category heading this archetype sits under, or `null` in a table without categories. */
  readonly section: string | null;
  /** The size every column measured this row at, or `null` where they differ. */
  readonly count: number | null;
  readonly description?: string;
  readonly entries: readonly ComparisonEntry[];
}

/** One published comparison table. */
export interface ComparisonTable {
  readonly columns: readonly ComparisonColumn[];
  readonly rows: readonly ComparisonRow[];
  /** What a count is counted in: `nodes` for rendering, `bodies` for physics. */
  readonly unit: string;
  /** True where the rows were measured at different sizes, so the size belongs in a column of its own. */
  readonly countColumn: boolean;
}

const entryOf = (key: string, row: ProfileRow | undefined, arm: string): ComparisonEntry => ({
  key,
  cell: row?.cells.find(cell => cell.competitor === arm) ?? null,
  count: row?.count ?? null,
});

/** Every row of a backend, flattened out of its categories. */
const rowsOf = (backend: ProfileBackend): readonly ProfileRow[] => backend.sections.flatMap(section => section.rows);

/**
 * The rendering table: one column per backend-and-arm pair.
 *
 * Archetypes are collected in the order the first backend publishes them and
 * then extended by any a later backend adds, so the categories stay in the
 * order the harness wrote them rather than being sorted into a ranking.
 */
export const renderingComparison = (document: BenchProfileDocument): ComparisonTable => {
  const backends = document.rendering?.backends ?? [];
  const columns = backends.flatMap(backend =>
    backend.competitors.map(arm => ({
      key: `${backend.backend}-${arm}`,
      group: BACKEND_LABELS[backend.backend],
      overline: '',
      label: armLabel(arm),
    })),
  );
  const archetypes: { archetype: string; section: string }[] = [];

  for (const backend of backends) {
    for (const section of backend.sections) {
      for (const row of section.rows) {
        if (!archetypes.some(entry => entry.archetype === row.archetype)) archetypes.push({ archetype: row.archetype, section: section.title });
      }
    }
  }

  const rows = archetypes.map(({ archetype, section }) => {
    const entries = backends.flatMap(backend => {
      const row = rowsOf(backend).find(candidate => candidate.archetype === archetype);

      return backend.competitors.map(arm => entryOf(`${backend.backend}-${arm}`, row, arm));
    });
    const counts = [...new Set(entries.map(entry => entry.count).filter((count): count is number => count !== null))];

    return {
      key: archetype,
      archetype,
      section,
      count: counts.length === 1 ? (counts[0] ?? null) : null,
      description: archetypeDescription(archetype),
      entries,
    };
  });

  return { columns, rows, unit: 'nodes', countColumn: false };
};

const singleBlockTable = (
  rows: readonly ProfileRow[],
  arms: readonly string[],
  columns: readonly ComparisonColumn[],
  unit: string,
  countColumn: boolean,
): ComparisonTable => ({
  columns,
  rows: rows.map(row => ({
    key: row.archetype,
    archetype: row.archetype,
    section: null,
    count: row.count,
    description: archetypeDescription(row.archetype),
    entries: arms.map(arm => entryOf(arm, row, arm)),
  })),
  unit,
  countColumn,
});

/**
 * The physics table.
 *
 * Every archetype carries its own body-count ladder, so the count is a column
 * of its own here: two rows are two different scenes at two different sizes and
 * are not comparable with each other, only the arms within one row are.
 */
export const physicsComparison = (document: BenchProfileDocument): ComparisonTable | null => {
  const section = document.physics?.section;

  if (section === undefined) return null;

  const arms = armsOfSection(section);

  return singleBlockTable(
    section.rows,
    arms,
    arms.map(arm => ({
      key: arm,
      // Grouping the peers apart from the reference arm is the whole point: a
      // Rust/WASM solver answers "what does leaving JavaScript buy", not "how
      // does ExoJS compare to what I would otherwise reach for".
      group: isWasmReferenceArm(arm) ? 'WASM reference' : 'JavaScript peers',
      overline: '',
      label: armLabel(arm),
    })),
    'bodies',
    true,
  );
};

/**
 * The WebGL1 block of one backend, as its own table.
 *
 * These arms render through a WebGL1 context and report no structural counters,
 * so the block compares CPU time only.
 */
export const webgl1Comparison = (backend: ProfileBackend): ComparisonTable | null => {
  if (backend.webgl1.length === 0) return null;

  const arms = [...new Set(backend.webgl1.flatMap(row => row.cells.map(cell => cell.competitor)))].sort();

  return singleBlockTable(
    backend.webgl1,
    arms,
    arms.map(arm => ({ key: arm, group: null, overline: 'WebGL1, CPU time only', label: armLabel(arm) })),
    'nodes',
    false,
  );
};
