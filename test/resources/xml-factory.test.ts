import { XmlFactory } from '#resources/factories/XmlFactory';

describe('XmlFactory', () => {
  test('storageName is "xml"', () => {
    const factory = new XmlFactory();
    expect(factory.storageName).toBe('xml');
  });

  test('process() reads the response body as text', async () => {
    const factory = new XmlFactory();
    const response = { text: async () => '<root/>' } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe('<root/>');
  });

  test('create() parses well-formed XML into a Document', async () => {
    const factory = new XmlFactory();

    const doc = await factory.create('<root><child id="1">value</child></root>');

    expect(doc).toBeInstanceOf(Document);
    expect(doc.querySelector('child')?.getAttribute('id')).toBe('1');
    expect(doc.querySelector('child')?.textContent).toBe('value');
  });

  test('create() throws with a clear message on malformed XML', async () => {
    const factory = new XmlFactory();

    await expect(factory.create('<root><unclosed></root>')).rejects.toThrow('XML parse error');
  });

  test('create() falls back to "unknown error" when the detected parsererror element has no text content', async () => {
    const factory = new XmlFactory();

    // Note: the factory detects a parse failure purely by the presence of a
    // <parsererror> element (per its JSDoc) — a well-formed document that
    // happens to contain its own empty <parsererror> element is (mis)detected
    // the same way, exercising the "no text" fallback message.
    await expect(factory.create('<root><parsererror></parsererror></root>')).rejects.toThrow('XML parse error: unknown error');
  });
});
