import { AssetDecodeError } from '#assets/AssetDecodeError';

/**
 * Parses XML markup into a {@link Document} via the browser's `DOMParser`.
 *
 * Throws {@link AssetDecodeError} when the parser reports a malformed document;
 * `DOMParser` signals that by returning a document containing a `<parsererror>`
 * element rather than by throwing, so the check cannot be skipped.
 * @internal
 */
export const parseXmlDocument = (source: string): Document => {
  const document = new DOMParser().parseFromString(source, 'text/xml');
  const parseError = document.querySelector('parsererror');

  if (parseError) {
    throw new AssetDecodeError({ message: `XML parse error: ${parseError.textContent.trim() || 'unknown error'}` });
  }

  return document;
};
