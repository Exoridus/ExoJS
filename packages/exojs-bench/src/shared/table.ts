/**
 * Table rendering for the run summaries the CLI prints.
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

/** Options for {@link formatTextTable}. */
export interface TableOptions {
  /**
   * Column whose value starts a new group, drawing a rule wherever it changes.
   *
   * A matrix is many arms of a few scenarios, and the comparison a reader wants
   * is inside one scenario. A rule between scenarios is what separates "these
   * four numbers are comparable" from "these belong to another scene". Omit it
   * and the body is one block.
   */
  readonly groupBy?: number;
}

/**
 * Box-drawing characters, by the junctions each row of the frame needs.
 *
 * Non-ASCII on purpose, and the exception the source-hygiene rule makes for
 * notation that IS the notation: these draw the table rather than decorate it.
 */
const BOX = {
  topLeft: '┌',
  topJoin: '┬',
  topRight: '┐',
  midLeft: '├',
  midJoin: '┼',
  midRight: '┤',
  bottomLeft: '└',
  bottomJoin: '┴',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
} as const;

/** One space of breathing room on each side of a cell's text. */
const CELL_PADDING = ' ';

const pad = (text: string, width: number, align: ColumnAlign): string => (align === 'right' ? text.padStart(width) : text.padEnd(width));

/**
 * Render `rows` under `columns` as a bordered table.
 *
 * Rows shorter than the column list are padded with empty cells, so a caller may
 * leave a trailing column off a row it has nothing to say in. Returns the lines
 * rather than printing them, which is what lets a caller indent a table inside a
 * larger block.
 */
export const formatTextTable = (columns: readonly TableColumn[], rows: ReadonlyArray<readonly string[]>, options: TableOptions = {}): readonly string[] => {
  const widths = columns.map((column, index) => rows.reduce((width, row) => Math.max(width, (row[index] ?? '').length), column.header.length));
  const rule = (left: string, join: string, right: string): string =>
    left + widths.map(width => BOX.horizontal.repeat(width + CELL_PADDING.length * 2)).join(join) + right;
  const line = (cells: readonly string[]): string =>
    BOX.vertical +
    columns.map((column, index) => CELL_PADDING + pad(cells[index] ?? '', widths[index]!, column.align ?? 'left') + CELL_PADDING).join(BOX.vertical) +
    BOX.vertical;

  const body: string[] = [];
  const { groupBy } = options;

  for (const [index, row] of rows.entries()) {
    if (groupBy !== undefined && index > 0 && row[groupBy] !== rows[index - 1]?.[groupBy]) {
      body.push(rule(BOX.midLeft, BOX.midJoin, BOX.midRight));
    }

    body.push(line(row));
  }

  return [
    rule(BOX.topLeft, BOX.topJoin, BOX.topRight),
    line(columns.map(column => column.header)),
    rule(BOX.midLeft, BOX.midJoin, BOX.midRight),
    ...body,
    rule(BOX.bottomLeft, BOX.bottomJoin, BOX.bottomRight),
  ];
};

/** Print a table produced by {@link formatTextTable}, each line indented by `indent`. */
export const printTextTable = (columns: readonly TableColumn[], rows: ReadonlyArray<readonly string[]>, options: TableOptions = {}, indent = '  '): void => {
  for (const text of formatTextTable(columns, rows, options)) {
    console.log(`${indent}${text}`);
  }
};
