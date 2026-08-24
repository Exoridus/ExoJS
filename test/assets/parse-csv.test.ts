import { parseCsv } from '#assets/factories/parseCsv';

describe('parseCsv', () => {
  test('parses a simple comma-separated file into rows', () => {
    const rows = parseCsv('a,b,c\n1,2,3');

    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  test('handles quoted fields containing the delimiter', () => {
    const rows = parseCsv('"hello, world",2,3');

    expect(rows).toEqual([['hello, world', '2', '3']]);
  });

  test('handles quoted fields containing embedded newlines', () => {
    const rows = parseCsv('"line1\nline2",b');

    expect(rows).toEqual([['line1\nline2', 'b']]);
  });

  test('unescapes doubled double-quotes inside quoted fields', () => {
    const rows = parseCsv('"she said ""hi""",b');

    expect(rows).toEqual([['she said "hi"', 'b']]);
  });

  test('honors a custom delimiter', () => {
    const rows = parseCsv('a;b;c', ';');

    expect(rows).toEqual([['a', 'b', 'c']]);
  });

  test('normalizes CRLF and CR line endings before parsing', () => {
    const crlf = parseCsv('a,b\r\n1,2');
    const cr = parseCsv('a,b\r1,2');

    expect(crlf).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(cr).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('drops a trailing empty line', () => {
    const rows = parseCsv('a,b\n1,2\n');

    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('returns an empty array for empty input', () => {
    const rows = parseCsv('');

    expect(rows).toEqual([]);
  });
});
