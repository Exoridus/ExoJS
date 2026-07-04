import { JsonFactory } from '#resources/factories/JsonFactory';

describe('JsonFactory', () => {
  test('storageName is "json"', () => {
    const factory = new JsonFactory();
    expect(factory.storageName).toBe('json');
  });

  test('process() parses the response body as JSON', async () => {
    const factory = new JsonFactory();
    const response = { json: async () => ({ hello: 'world' }) } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toEqual({ hello: 'world' });
  });

  test('create() returns the parsed value unchanged for objects', async () => {
    const factory = new JsonFactory();
    const value = { a: 1, b: [1, 2, 3] };

    await expect(factory.create(value)).resolves.toBe(value);
  });

  test('create() returns the parsed value unchanged for primitives', async () => {
    const factory = new JsonFactory();

    await expect(factory.create(42)).resolves.toBe(42);
    await expect(factory.create(null)).resolves.toBeNull();
    await expect(factory.create('text')).resolves.toBe('text');
  });
});
