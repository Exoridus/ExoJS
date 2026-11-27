import { AssetDecodeError } from '#assets/AssetDecodeError';
import { parseXmlDocument } from '#assets/factories/parseXml';

const xhtmlErrorReport =
  '<parsererror xmlns="http://www.w3.org/1999/xhtml">' +
  '<h3>This page contains the following errors:</h3>' +
  '<div>error on line 1 at column 14: Opening and ending tag mismatch</div>' +
  '<h3>Below is a rendering of the page up to the first error.</h3>' +
  '</parsererror>';

describe('parseXmlDocument', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  test.each([
    '<root><parsererror>text</parsererror></root>',
    '<root><parsererror xmlns="http://www.w3.org/1999/xhtml">text</parsererror></root>',
  ])('keeps a document that models its own parsererror element: %s', source => {
    const doc = parseXmlDocument(source);

    expect(doc.querySelector('parsererror')?.textContent).toBe('text');
  });

  test.each([
    '<parsererror>authored text</parsererror>',
    '<parsererror xmlns="urn:app">authored text</parsererror>',
    '<app:parsererror xmlns:app="urn:app">authored text</app:parsererror>',
    '<parsererror xmlns="http://www.w3.org/1999/xhtml">authored text</parsererror>',
  ])('keeps a valid authored parsererror root: %s', source => {
    const doc = parseXmlDocument(source);

    expect(doc.documentElement.localName).toBe('parsererror');
    expect(doc.documentElement.textContent).toBe('authored text');
  });

  test('keeps a valid authored XHTML error report as the document root', () => {
    const doc = parseXmlDocument(xhtmlErrorReport);

    expect(doc.documentElement.localName).toBe('parsererror');
    expect(doc.documentElement.children).toHaveLength(3);
  });

  test.each([
    ['partial root', `<root>${xhtmlErrorReport}<child/></root>`],
    ['missing root', `<html xmlns="http://www.w3.org/1999/xhtml"><body>${xhtmlErrorReport}</body></html>`],
    [
      'SVG root',
      '<html xmlns="http://www.w3.org/1999/xhtml"><head/><body>' +
        `${xhtmlErrorReport}<svg xmlns="http://www.w3.org/2000/svg"/></body></html>`,
    ],
    ['authored parsererror root', `<parsererror xmlns="http://www.w3.org/1999/xhtml">${xhtmlErrorReport}</parsererror>`],
  ])('rejects a Blink/WebKit error document with a %s', (_name, markup) => {
    const errorDocument = new DOMParser().parseFromString(markup, 'text/xml');

    vi.spyOn(DOMParser.prototype, 'parseFromString').mockReturnValueOnce(errorDocument);

    expect(() => parseXmlDocument('<root><unclosed></root>')).toThrow(AssetDecodeError);
  });
});
