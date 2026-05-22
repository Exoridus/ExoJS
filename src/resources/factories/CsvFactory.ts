import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

/** Construction options for {@link CsvFactory.create}. */
export interface CsvFactoryOptions {
  /**
   * Field delimiter character. Defaults to `','`.
   * Use `'\t'` for TSV files or `';'` for locales that use semicolons.
   */
  delimiter?: string;
}

/**
 * {@link AssetFactory} implementation that loads CSV (and TSV) files and
 * produces a two-dimensional array of strings.
 *
 * Parsing is RFC 4180-compliant: quoted fields (including fields that contain
 * the delimiter, newlines, or double-quotes) are handled correctly. Line
 * endings are normalised before parsing; empty trailing lines are dropped.
 *
 * The returned `string[][]` is intentionally untyped — callers decide whether
 * to treat the first row as headers, apply type coercions, etc.
 */
export class CsvFactory extends AbstractAssetFactory<string[][]> {
  public readonly storageName = 'csv';

  /**
   * Reads the response body as a UTF-8 string.
   */
  public async process(response: Response): Promise<string> {
    return response.text();
  }

  /**
   * Parses the CSV text into a two-dimensional array of strings.
   *
   * Each element of the outer array is one row; each element of an inner
   * array is one field value with surrounding quotes stripped and escaped
   * double-quotes (`""`) unescaped.
   */
  public async create(source: string, options: CsvFactoryOptions = {}): Promise<string[][]> {
    const delimiter = options.delimiter ?? ',';
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
      } else {
        if (ch === '"') {
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
    }

    row.push(field);

    if (row.some(f => f !== '')) {
      rows.push(row);
    }

    return rows;
  }
}
