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
 * ExoJS gets a column of its own in front of each backend's arms rather than
 * appearing inside every cell. It is one measurement per row and backend, so
 * repeating it beside each arm would print the same three numbers as often as
 * the backend has opponents.
 *
 * Only the arrangement lives here. Timings, ratios and verdicts are read from
 * the profile in `bench-profiles`, and no row is dropped, reordered by outcome
 * or merged with another.
 */

import {
  armsOfSection,
  BACKEND_LABELS,
  type BenchProfileDocument,
  isWasmReferenceArm,
  type ProfileBackend,
  type ProfileCell,
  type ProfileRow,
  type ProfileSpread,
} from './bench-profiles';

/** What a column carries: the ExoJS measurement itself, or a comparison against one arm. */
export type ComparisonColumnKind = 'reference' | 'arm';

/** One column of a table. */
export interface ComparisonColumn {
  readonly key: string;
  readonly kind: ComparisonColumnKind;
  /** Heading the neighbouring columns share, such as the backend they were measured on; `null` where each column stands alone. */
  readonly group: string | null;
  /** What this column alone is measured under, such as the role an arm stands in. */
  readonly overline: string;
  readonly label: string;
}

/** The ExoJS side of one row, under one backend. */
export interface ComparisonReference {
  readonly ms: number | null;
  readonly p95Ms: number | null;
  readonly overFrameBudget: boolean;
  readonly spread: ProfileSpread | undefined;
}

/** One column's outcome on one row. */
export interface ComparisonEntry {
  readonly key: string;
  readonly kind: ComparisonColumnKind;
  /** The published comparison, or `null` in a reference column and where an arm produced none. */
  readonly cell: ProfileCell | null;
  /** The ExoJS measurement, in a reference column only. */
  readonly reference: ComparisonReference | null;
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
  readonly entries: readonly ComparisonEntry[];
}

/** The structural evidence one comparison carries, listed away from the numbers. */
export interface ComparisonMechanism {
  readonly key: string;
  readonly archetype: string;
  readonly column: string;
  readonly text: string;
}

/** One published comparison table. */
export interface ComparisonTable {
  readonly columns: readonly ComparisonColumn[];
  readonly rows: readonly ComparisonRow[];
  /** What a count is counted in: `nodes` for rendering, `bodies` for physics. */
  readonly unit: string;
  /** True where the rows were measured at different sizes, so the size belongs in a column of its own. */
  readonly countColumn: boolean;
  readonly mechanisms: readonly ComparisonMechanism[];
}

/**
 * The ExoJS side of a row. Every arm in a block times the same ExoJS scene, so
 * the first cell that produced a number carries it for the whole block.
 */
const referenceOf = (row: ProfileRow | undefined): ComparisonReference => {
  const cell = row?.cells.find(candidate => candidate.referenceMs !== null);

  return {
    ms: cell?.referenceMs ?? null,
    p95Ms: cell?.referenceP95Ms ?? null,
    overFrameBudget: cell?.referenceOverFrameBudget ?? false,
    spread: cell?.aggregate.reference,
  };
};

const referenceEntry = (key: string, row: ProfileRow | undefined): ComparisonEntry => ({
  key,
  kind: 'reference',
  cell: null,
  reference: referenceOf(row),
  count: row?.count ?? null,
});

const armEntry = (key: string, row: ProfileRow | undefined, arm: string): ComparisonEntry => ({
  key,
  kind: 'arm',
  cell: row?.cells.find(cell => cell.competitor === arm) ?? null,
  reference: null,
  count: row?.count ?? null,
});

const mechanismsOf = (rows: readonly ComparisonRow[], columns: readonly ComparisonColumn[]): readonly ComparisonMechanism[] =>
  rows.flatMap(row =>
    row.entries.flatMap((entry, index) => {
      const text = entry.cell?.mechanism;
      const column = columns[index];

      return text === undefined || text === null || column === undefined
        ? []
        : [{ key: `${row.key}-${column.key}`, archetype: row.archetype, column: column.label, text }];
    }),
  );

/** Every row of a backend, flattened out of its categories. */
const rowsOf = (backend: ProfileBackend): readonly ProfileRow[] => backend.sections.flatMap(section => section.rows);

/**
 * The rendering table: an ExoJS column and its arms, per backend.
 *
 * Archetypes are collected in the order the first backend publishes them and
 * then extended by any a later backend adds, so the categories stay in the
 * order the harness wrote them rather than being sorted into a ranking.
 */
export const renderingComparison = (document: BenchProfileDocument): ComparisonTable => {
  const backends = document.rendering?.backends ?? [];
  const columns = backends.flatMap(backend => [
    { key: `${backend.backend}-exojs`, kind: 'reference' as const, group: BACKEND_LABELS[backend.backend], overline: '', label: 'ExoJS' },
    ...backend.competitors.map(arm => ({
      key: `${backend.backend}-${arm}`,
      kind: 'arm' as const,
      group: BACKEND_LABELS[backend.backend],
      overline: '',
      label: `vs ${arm}`,
    })),
  ]);
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

      return [referenceEntry(`${backend.backend}-exojs`, row), ...backend.competitors.map(arm => armEntry(`${backend.backend}-${arm}`, row, arm))];
    });
    const counts = [...new Set(entries.map(entry => entry.count).filter((count): count is number => count !== null))];

    return { key: archetype, archetype, section, count: counts.length === 1 ? (counts[0] ?? null) : null, entries };
  });

  return { columns, rows, unit: 'nodes', countColumn: false, mechanisms: mechanismsOf(rows, columns) };
};

const singleBlockTable = (
  rows: readonly ProfileRow[],
  arms: readonly string[],
  columns: readonly ComparisonColumn[],
  unit: string,
  countColumn: boolean,
): ComparisonTable => {
  const built = rows.map(row => ({
    key: row.archetype,
    archetype: row.archetype,
    section: null,
    count: row.count,
    entries: [referenceEntry('exojs', row), ...arms.map(arm => armEntry(arm, row, arm))],
  }));

  return { columns, rows: built, unit, countColumn, mechanisms: mechanismsOf(built, columns) };
};

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
    [
      { key: 'exojs', kind: 'reference', group: null, overline: 'per fixed step', label: 'ExoJS' },
      ...arms.map(arm => ({
        key: arm,
        kind: 'arm' as const,
        group: null,
        overline: isWasmReferenceArm(arm) ? 'Rust/WASM ceiling' : 'pure-JS peer',
        label: `vs ${arm}`,
      })),
    ],
    'bodies',
    true,
  );
};

/**
 * The WebGL1 block of one backend, as its own table.
 *
 * These arms render through a WebGL1 context and report no structural counters,
 * so the block compares CPU time only and carries no mechanism list.
 */
export const webgl1Comparison = (backend: ProfileBackend): ComparisonTable | null => {
  if (backend.webgl1.length === 0) return null;

  const arms = [...new Set(backend.webgl1.flatMap(row => row.cells.map(cell => cell.competitor)))].sort();
  const table = singleBlockTable(
    backend.webgl1,
    arms,
    [
      { key: 'exojs', kind: 'reference', group: null, overline: 'CPU time only', label: 'ExoJS' },
      ...arms.map(arm => ({ key: arm, kind: 'arm' as const, group: null, overline: 'WebGL1', label: `vs ${arm}` })),
    ],
    'nodes',
    false,
  );

  return { ...table, mechanisms: [] };
};
