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
  formatLoad,
  isWasmReferenceArm,
  orderArms,
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

/** One archetype at one load, across every column of a table. */
export interface ComparisonRow {
  readonly key: string;
  readonly archetype: string;
  /** Category heading this archetype sits under, or `null` in a table without categories. */
  readonly section: string | null;
  /** The size every column measured this row at, or `null` where they differ. */
  readonly count: number | null;
  /** How the load reads, with its unit: `10,000 sprites`. */
  readonly load: string;
  /** Whether this is the scenario's headline load - the one a card opens on. */
  readonly primary: boolean;
  readonly description?: string;
  readonly entries: readonly ComparisonEntry[];
}

/** One published comparison table. */
export interface ComparisonTable {
  readonly columns: readonly ComparisonColumn[];
  readonly rows: readonly ComparisonRow[];
  /** What a count is counted in where a row states no unit of its own. */
  readonly unit: string;
  /** True where the rows were measured at different sizes, so the size belongs in a column of its own. */
  readonly countColumn: boolean;
  /** Index of the column a narrow reader is shown first; see {@link PREFERRED_COLUMN_KEYS}. */
  readonly defaultColumn: number;
}

/**
 * Which comparison a stacked view opens on, most preferred first.
 *
 * An editorial choice about the entry point, fixed here rather than computed
 * from the measurements. A rule such as "the arm ExoJS leads on fewest rows"
 * reads as fairness but is not one: an arm can lead on few rows because it was
 * compared on few, or because most of its runs disagreed - and a later
 * correction to how a comparison is judged would then silently move the view a
 * reader lands on, without anything about the navigation having changed.
 *
 * The list names keys, so a profile that never measured the first entry falls
 * through to the next and finally to the leftmost column that exists.
 */
const PREFERRED_COLUMN_KEYS: readonly string[] = ['webgl2-pixi', 'webgpu-pixi', 'webgl2-phaser', 'matter-js', 'planck'];

/** The first preferred column this table actually has, or its leftmost one. */
const preferredColumn = (columns: readonly ComparisonColumn[]): number => {
  for (const key of PREFERRED_COLUMN_KEYS) {
    const index = columns.findIndex(column => column.key === key);

    if (index !== -1) return index;
  }

  return 0;
};

/** A row's load, as the identity a table keys on. */
const loadKey = (row: ProfileRow): string => row.loadId ?? String(row.count);

const entryOf = (key: string, row: ProfileRow | undefined, arm: string): ComparisonEntry => ({
  key,
  cell: row?.cells.find(cell => cell.competitor === arm) ?? null,
  count: row?.count ?? null,
});

/** Every row of a backend, flattened out of its categories. */
const rowsOf = (backend: ProfileBackend): readonly ProfileRow[] => backend.sections.flatMap(section => section.rows);

/**
 * The rendering table: one column per backend-and-arm pair, one row per
 * archetype and load.
 *
 * Rows are collected in the order the first backend publishes them and then
 * extended by any a later backend adds, so the categories stay in the order the
 * harness wrote them rather than being sorted into a ranking.
 */
export const renderingComparison = (document: BenchProfileDocument): ComparisonTable => {
  const backends = document.rendering?.backends ?? [];
  const columns = backends.flatMap(backend =>
    orderArms(backend.competitors, arm => arm).map(arm => ({
      key: `${backend.backend}-${arm}`,
      group: BACKEND_LABELS[backend.backend],
      overline: '',
      label: armLabel(arm),
    })),
  );

  /**
   * Every archetype-and-load pair the backends published, in the order the
   * first backend wrote them.
   *
   * The load is part of a row's identity and not a property of the table. An
   * archetype is measured at several of them, and a table keyed on the
   * archetype alone showed whichever load the harness happened to write first -
   * so a card opening on its headline load and the table describing the same
   * scenario were two different measurements under one name.
   */
  const keys: { archetype: string; loadId: string; section: string; row: ProfileRow }[] = [];

  for (const backend of backends) {
    for (const section of backend.sections) {
      for (const row of section.rows) {
        const loadId = loadKey(row);

        if (!keys.some(entry => entry.archetype === row.archetype && entry.loadId === loadId)) {
          keys.push({ archetype: row.archetype, loadId, section: section.title, row });
        }
      }
    }
  }

  const rows = keys.map(({ archetype, loadId, section, row: first }) => {
    const entries = backends.flatMap(backend => {
      const row = rowsOf(backend).find(candidate => candidate.archetype === archetype && loadKey(candidate) === loadId);

      return orderArms(backend.competitors, arm => arm).map(arm => entryOf(`${backend.backend}-${arm}`, row, arm));
    });
    const counts = [...new Set(entries.map(entry => entry.count).filter((count): count is number => count !== null))];

    return {
      key: `${archetype}-${loadId}`,
      archetype,
      section,
      count: counts.length === 1 ? (counts[0] ?? null) : null,
      load: formatLoad(first),
      primary: first.primary ?? false,
      description: archetypeDescription(archetype),
      entries,
    };
  });

  return { columns, rows, unit: 'nodes', countColumn: true, defaultColumn: preferredColumn(columns) };
};

const singleBlockTable = (
  rows: readonly ProfileRow[],
  arms: readonly string[],
  columns: readonly ComparisonColumn[],
  unit: string,
  countColumn: boolean,
): ComparisonTable => ({
  columns,
  defaultColumn: preferredColumn(columns),
  rows: rows.map(row => ({
    key: `${row.archetype}-${loadKey(row)}`,
    archetype: row.archetype,
    section: null,
    count: row.count,
    load: formatLoad(row),
    primary: row.primary ?? false,
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

  const arms = orderArms(armsOfSection(section), arm => arm);

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

  const arms = orderArms([...new Set(backend.webgl1.flatMap(row => row.cells.map(cell => cell.competitor)))], arm => arm);

  return singleBlockTable(
    backend.webgl1,
    arms,
    arms.map(arm => ({ key: arm, group: null, overline: 'WebGL1, CPU time only', label: armLabel(arm) })),
    'nodes',
    true,
  );
};
