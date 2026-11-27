import { AssetDecodeError } from '#assets/AssetDecodeError';
import { parseXmlDocument } from '#assets/factories/parseXml';

describe('XML parsing with native DOMParser', () => {
  test.each([
    '<parsererror>authored text</parsererror>',
    '<parsererror xmlns="urn:app">authored text</parsererror>',
    '<app:parsererror xmlns:app="urn:app">authored text</app:parsererror>',
    '<root><parsererror>authored text</parsererror></root>',
    '<parsererror xmlns="http://www.w3.org/1999/xhtml">authored text</parsererror>',
    '<root><parsererror xmlns="http://www.w3.org/1999/xhtml">authored text</parsererror></root>',
  ])('preserves authored parsererror elements: %s', source => {
    const parsed = parseXmlDocument(source);

    expect(parsed.documentElement.textContent).toBe('authored text');
  });

  test.each([
    '',
    '<',
    '<root><unclosed></root>',
    '<root><unknown:child/></root>',
    '<root/><extra/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><unclosed></svg>',
    '<parsererror xmlns="http://www.w3.org/1999/xhtml"><unclosed></parsererror>',
  ])('rejects malformed XML: %s', source => {
    expect(() => parseXmlDocument(source)).toThrow(AssetDecodeError);
  });
});
