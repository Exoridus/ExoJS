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

  test('falls back to "unknown error" when the detected parsererror element has no text content', () => {
    // A parse failure is detected purely by the presence of a <parsererror>
    // element, which is all DOMParser reports - so a well-formed document that
    // happens to contain its own empty one is (mis)detected the same way, and
    // exercises the "no text" fallback message.
    expect(() => parseXmlDocument('<root><parsererror></parsererror></root>')).toThrow('XML parse error: unknown error');
  });
});
