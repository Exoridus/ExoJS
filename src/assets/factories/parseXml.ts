import { AssetDecodeError } from '#assets/AssetDecodeError';

const xhtmlNamespace = 'http://www.w3.org/1999/xhtml';

const hasXhtmlErrorHeader = (element: Element): boolean => {
  const [heading, message, footer] = element.children;

  return (
    heading?.localName === 'h3' &&
    heading.namespaceURI === xhtmlNamespace &&
    heading.textContent === 'This page contains the following errors:' &&
    message?.localName === 'div' &&
    message.namespaceURI === xhtmlNamespace &&
    footer?.localName === 'h3' &&
    footer.namespaceURI === xhtmlNamespace &&
    footer.textContent === 'Below is a rendering of the page up to the first error.'
  );
};

const findXhtmlParserError = (document: Document): Element | undefined => {
  const root = document.documentElement;

  // Blink/WebKit prepend this report to partial content, using an XHTML html/body
  // wrapper for missing or SVG roots. XHTML names alone also match authored XML.
  for (const candidate of document.getElementsByTagNameNS(xhtmlNamespace, 'parsererror')) {
    const parent = candidate.parentElement;
    const isWrapperBody =
      parent?.localName === 'body' &&
      parent.namespaceURI === xhtmlNamespace &&
      parent.parentElement === root &&
      root.localName === 'html' &&
      root.namespaceURI === xhtmlNamespace;

    if (parent?.firstChild === candidate && (parent === root || isWrapperBody) && hasXhtmlErrorHeader(candidate)) {
      return candidate;
    }
  }

  return undefined;
};

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

  const parseError =
    document.getElementsByTagNameNS('http://www.mozilla.org/newlayout/xml/parsererror.xml', 'parsererror')[0] ??
    findXhtmlParserError(document);

  if (parseError) {
    throw new AssetDecodeError({ message: `XML parse error: ${parseError.textContent.trim() || 'unknown error'}` });
  }

  return document;
};
