/**
 * Turns a caller's media location into the directory URL every catalog path is
 * resolved against.
 *
 * A relative string is rejected rather than resolved against the document:
 * what it is relative to differs between a page, a worker, a bundled chunk and
 * a test runner, and guessing wrong fails only once a file is fetched.
 *
 * @internal
 */
export const resolveBaseUrl = (baseUrl: string | URL, caller: string): URL => {
  const text = typeof baseUrl === 'string' ? baseUrl : (baseUrl as { readonly href?: unknown } | null)?.href;

  if (typeof text !== 'string') {
    throw new TypeError(`${caller}: expected the media base as a string or URL.`);
  }

  let base: URL;

  try {
    base = new URL(text);
  } catch {
    throw new TypeError(
      `${caller}: the media base "${text}" is not an absolute URL. Resolve it first, for example ` +
        `new URL('${text}', import.meta.url) or new URL('${text}', location.href).`,
    );
  }

  // A base without a trailing slash would make every path resolve next to the
  // directory rather than inside it.
  if (!base.pathname.endsWith('/')) {
    base.pathname = `${base.pathname}/`;
  }

  return base;
};

/** @internal */
export const urlResolver =
  (base: URL): ((path: string) => string) =>
  (path: string): string =>
    new URL(path, base).href;
