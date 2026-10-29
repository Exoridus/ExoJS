import { AssetDecodeError } from '#assets/AssetDecodeError';
import { parseXmlDocument } from '#assets/factories/parseXml';

describe('parseXmlDocument', () => {
  test('parses well-formed XML into a Document', () => {
    const doc = parseXmlDocument('<root><child id="1">value</child></root>');

    expect(doc).toBeInstanceOf(Document);
    expect(doc.querySelector('child')?.getAttribute('id')).toBe('1');
    expect(doc.querySelector('child')?.textContent).toBe('value');
  });

  test('throws with a clear message on malformed XML', () => {
    expect(() => parseXmlDocument('<root><unclosed></root>')).toThrow('XML parse error');
    expect(() => parseXmlDocument('<root><unclosed></root>')).toThrow(AssetDecodeError);
  });

  test('keeps a document that models its own parsererror element', () => {
    const doc = parseXmlDocument('<root><parsererror>text</parsererror></root>');

    expect(doc.querySelector('parsererror')?.textContent).toBe('text');
  });
});
