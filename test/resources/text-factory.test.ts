import { TextFactory } from '#resources/factories/TextFactory';

describe('TextFactory', () => {
  test('storageName is "text"', () => {
    const factory = new TextFactory();
    expect(factory.storageName).toBe('text');
  });

  test('process() reads the response body as text', async () => {
    const factory = new TextFactory();
    const response = { text: async () => 'hello world' } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe('hello world');
  });

  test('create() returns the decoded string unchanged', async () => {
    const factory = new TextFactory();

    await expect(factory.create('some text')).resolves.toBe('some text');
    await expect(factory.create('')).resolves.toBe('');
  });
});
