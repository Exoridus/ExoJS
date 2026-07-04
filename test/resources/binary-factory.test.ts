import { BinaryFactory } from '#resources/factories/BinaryFactory';

describe('BinaryFactory', () => {
  test('storageName is "binary"', () => {
    const factory = new BinaryFactory();
    expect(factory.storageName).toBe('binary');
  });

  test('process() reads the response body as an ArrayBuffer', async () => {
    const factory = new BinaryFactory();
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const response = { arrayBuffer: async () => bytes } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe(bytes);
  });

  test('create() returns the buffer unchanged', async () => {
    const factory = new BinaryFactory();
    const buffer = new Uint8Array([9, 8, 7]).buffer;

    const result = await factory.create(buffer);

    expect(result).toBe(buffer);
  });

  test('create() passes through an empty buffer without throwing', async () => {
    const factory = new BinaryFactory();
    const buffer = new ArrayBuffer(0);

    await expect(factory.create(buffer)).resolves.toBe(buffer);
  });
});
