// Builds the `deprecated` table `no-deprecated-api` checks imports against, by
// reading the `@deprecated` JSDoc tag already written at each deprecation site
// rather than carrying a second, hand-maintained copy of the same information.
//
// This is a plain text scan, not a TypeScript parse: a deprecation is a
// top-level `export` immediately preceded by a JSDoc block, which a regular
// expression finds reliably without adding the compiler as a dependency of
// this package (`@codexo/exojs-config` has none today) just to read a comment.
// The type checker would also see re-exports, aliasing and namespace access
// that this scan cannot - `no-deprecated-api`'s own rule file records that
// trade-off for the check itself; this module only has to find the tag text,
// not resolve every way a caller might reach the symbol.
import { readFileSync } from 'node:fs';

const DOC_COMMENT_BEFORE_EXPORT = /\/\*\*([\s\S]*?)\*\/\s*export\s+(?:abstract\s+)?(?:const|class|function|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;

/**
 * Strips the leading `*`/`* ` from one JSDoc body line.
 * @param {string} line
 * @returns {string}
 */
const stripDocGutter = line => line.replace(/^\s*\*\s?/, '').trim();

/**
 * The `@deprecated` tag's text from a JSDoc comment body, joined into one
 * line - or `undefined` when the comment carries no such tag. JSDoc tags run
 * until the next `@tag` or the comment's end, so a multi-line deprecation
 * note is collected in full.
 * @param {string} docBody
 * @returns {string | undefined}
 */
const extractDeprecatedTagText = docBody => {
  const lines = docBody.split('\n').map(stripDocGutter);
  const tagLineIndex = lines.findIndex(line => line.startsWith('@deprecated'));

  if (tagLineIndex === -1) return undefined;

  const collected = [lines[tagLineIndex].replace(/^@deprecated\s*/, '')];

  for (let index = tagLineIndex + 1; index < lines.length; index++) {
    const line = lines[index];

    if (line.startsWith('@')) break;

    collected.push(line);
  }

  return collected
    .filter(line => line.length > 0)
    .join(' ')
    .trim();
};

/**
 * Every top-level `export`ed declaration in `sourceText` whose JSDoc carries
 * `@deprecated`, mapped to that tag's text.
 * @param {string} sourceText
 * @returns {Record<string, string>}
 */
export const collectDeprecatedExportsFromSource = sourceText => {
  /** @type {Record<string, string>} */
  const deprecated = {};

  for (const match of sourceText.matchAll(DOC_COMMENT_BEFORE_EXPORT)) {
    const [, docBody, name] = match;
    const reason = extractDeprecatedTagText(docBody);

    if (reason !== undefined) {
      deprecated[name] = reason;
    }
  }

  return deprecated;
};

/**
 * {@link collectDeprecatedExportsFromSource}, over a list of source files on
 * disk. Point this at the package's own `.ts` sources when generating this
 * repository's own table; a consumer package generating a table for an
 * installed dependency has only its shipped `.d.ts` files to scan, which read
 * exactly the same way.
 * @param {readonly string[]} filePaths
 * @returns {Record<string, string>}
 */
export const collectDeprecatedExports = filePaths => {
  /** @type {Record<string, string>} */
  const deprecated = {};

  for (const filePath of filePaths) {
    Object.assign(deprecated, collectDeprecatedExportsFromSource(readFileSync(filePath, 'utf8')));
  }

  return deprecated;
};
