/** Options accepted by an asset of the built-in `csv` type. */
export interface CsvAssetOptions {
  /** Field delimiter. Defaults to `','`; use `'\t'` for TSV or `';'` where that is the local convention. */
  delimiter?: string;
}

/**
 * Parses CSV (or TSV) text into rows of raw field strings.
 *
 * Parsing is RFC 4180-compliant: a quoted field may contain the delimiter,
 * newlines and escaped double-quotes. Line endings are normalised first, and an
 * empty trailing line is dropped. Values are never coerced - whether the first
 * row is a header is the caller's decision.
 * @internal
 */
export function parseCsv(source: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  const text = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      i++;
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
    } else {
      field += ch;
      i++;
    }
  }

  row.push(field);

  if (row.some(value => value !== '')) {
    rows.push(row);
  }

  return rows;
}
