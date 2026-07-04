import { CsvFactory } from '#resources/factories/CsvFactory';

describe('CsvFactory', () => {
  test('storageName is "csv"', () => {
    const factory = new CsvFactory();
    expect(factory.storageName).toBe('csv');
  });

  test('process() reads the response body as text', async () => {
    const factory = new CsvFactory();
    const response = { text: async () => 'a,b,c' } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe('a,b,c');
  });

  test('create() parses a simple comma-separated file into rows', async () => {
    const factory = new CsvFactory();

    const rows = await factory.create('a,b,c\n1,2,3');

    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  test('create() handles quoted fields containing the delimiter', async () => {
    const factory = new CsvFactory();

    const rows = await factory.create('"hello, world",2,3');

    expect(rows).toEqual([['hello, world', '2', '3']]);
  });

  test('create() handles quoted fields containing embedded newlines', async () => {
    const factory = new CsvFactory();

    const rows = await factory.create('"line1\nline2",b');

    expect(rows).toEqual([['line1\nline2', 'b']]);
  });

  test('create() unescapes doubled double-quotes inside quoted fields', async () => {
    const factory = new CsvFactory();

    const rows = await factory.create('"she said ""hi""",b');

    expect(rows).toEqual([['she said "hi"', 'b']]);
  });

  test('create() honors a custom delimiter', async () => {
    const factory = new CsvFactory();

    const rows = await factory.create('a;b;c', { delimiter: ';' });

    expect(rows).toEqual([['a', 'b', 'c']]);
  });

  test('create() normalizes CRLF and CR line endings before parsing', async () => {
    const factory = new CsvFactory();

    const crlf = await factory.create('a,b\r\n1,2');
    const cr = await factory.create('a,b\r1,2');

    expect(crlf).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(cr).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('create() drops a trailing empty line', async () => {
    const factory = new CsvFactory();

    const rows = await factory.create('a,b\n1,2\n');

    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('create() returns an empty array for empty input', async () => {
    const factory = new CsvFactory();

    const rows = await factory.create('');

    expect(rows).toEqual([]);
  });
});
