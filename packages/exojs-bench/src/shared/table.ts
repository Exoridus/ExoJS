/**
 * Fixed-width table rendering for the run summaries the CLI prints.
 *
 * The summaries used to be `key=value` runs padded by hand, which meant every
 * reader parsed a line before comparing two of them. A column that is a column
 * is compared by eye, and the same rows land in the report artifacts anyway - so
 * this exists to make the terminal the first place a result is readable, not the
 * last.
 */

/** Horizontal placement of a column's cells and of its header. */
export type ColumnAlign = 'left' | 'right';

/** One column of a printed table. */
export interface TableColumn {
  /** Header text. Also the column's minimum width. */
  readonly header: string;
  /** Cell placement; numbers read as a column only when they are right-aligned. Default `'left'`. */
  readonly align?: ColumnAlign;
}

/** Two spaces between columns: enough to separate them, narrow enough to keep a wide matrix on one line. */
const GUTTER = '  ';

const pad = (text: string, width: number, align: ColumnAlign): string => (align === 'right' ? text.padStart(width) : text.padEnd(width));

/**
 * Render `rows` under `columns` as aligned text, header and rule included.
 *
 * Rows shorter than the column list are padded with empty cells, so a caller may
 * leave a trailing column off a row it has nothing to say in. Returns the lines
 * rather than printing them, which is what lets a caller indent a table inside a
 * larger block.
 */
export const formatTextTable = (columns: readonly TableColumn[], rows: ReadonlyArray<readonly string[]>): readonly string[] => {
  const widths = columns.map((column, index) => rows.reduce((width, row) => Math.max(width, (row[index] ?? '').length), column.header.length));
  const line = (cells: readonly string[]): string =>
    columns
      .map((column, index) => pad(cells[index] ?? '', widths[index]!, column.align ?? 'left'))
      .join(GUTTER)
      .trimEnd();

  return [line(columns.map(column => column.header)), widths.map(width => '-'.repeat(width)).join(GUTTER), ...rows.map(row => line(row))];
};

/** Print a table produced by {@link formatTextTable}, each line indented by `indent`. */
export const printTextTable = (columns: readonly TableColumn[], rows: ReadonlyArray<readonly string[]>, indent = '  '): void => {
  for (const text of formatTextTable(columns, rows)) {
    console.log(`${indent}${text}`);
  }
};
