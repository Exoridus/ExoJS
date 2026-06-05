/**
 * Source-backed guide snippets.
 *
 * Marker syntax in TypeScript source files:
 *   // #region guide:<name>
 *   ...
 *   // #endregion guide:<name>
 *
 * Usage in MDX guides:
 *   import SourceSnippet from '../../../components/SourceSnippet.astro';
 *   <SourceSnippet source="examples/foo.ts" region="bar" title="Foo Bar" />
 *
 * Paths in `source` are relative to the repo root.
 *
 * Build fails with a clear error if: source file missing, region missing,
 * region empty, or duplicate region names in the same file.
 *
 * Typecheck coverage:
 *   - examples/* → typecheck:examples
 *   - packages/create-exo-app/templates/* → verify:create-exo-app
 *   - site/src/snippets/* → typecheck:guides (included via tsconfig.guides.json)
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REGION_OPEN_RE = /^[ \t]*\/\/ #region guide:(.+)$/;
const REGION_CLOSE_RE = /^[ \t]*\/\/ #endregion guide:(.+)$/;

/**
 * Returns the monorepo root by walking up from `process.cwd()` until a
 * `pnpm-workspace.yaml` sentinel is found.
 *
 * This works correctly in all execution contexts:
 * - Vitest (run from repo root): cwd = repo root → found immediately.
 * - Astro SSG prerender (run from `site/`): cwd = site/ → found 1 level up.
 *
 * Using `import.meta.dirname` is intentionally avoided: in an Astro SSG build
 * the module is bundled into `site/dist/.prerender/chunks/`, so
 * `import.meta.dirname` points to the bundle output directory, not the
 * original source directory.
 */
function repoRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 8; i++) {
        if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) break; // filesystem root
        dir = parent;
    }
    // Last resort: return cwd and let readFileSync emit a clear error.
    return process.cwd();
}

/**
 * Extracts a named region from a TypeScript (or any text) source file.
 *
 * The region is delimited by:
 *   // #region guide:<name>
 *   // #endregion guide:<name>
 *
 * Marker lines are stripped from the output. Common leading whitespace
 * (dedent) is removed so the snippet renders at column 0.
 *
 * @param filePath - Path relative to the repo root (e.g. `"examples/showcase/orb-dodge.ts"`).
 * @param region   - Region name (the `<name>` part of the marker, e.g. `"application-setup"`).
 * @returns The dedented snippet text, without the marker lines.
 *
 * @throws If the source file does not exist.
 * @throws If the region name appears more than once (duplicate) in the file.
 * @throws If the region is not found in the file.
 * @throws If the region contains no non-empty lines after stripping markers.
 */
export function extractSnippetRegion(filePath: string, region: string): string {
    const absolutePath = join(repoRoot(), filePath);

    let source: string;
    try {
        source = readFileSync(absolutePath, 'utf8');
    } catch {
        throw new Error(
            `[SourceSnippet] File not found: ${filePath}\n` +
            `  (resolved to: ${absolutePath})`,
        );
    }

    const lines = source.split('\n');

    // Validate: no duplicate region names.
    const openCount = lines.filter(l => {
        const m = l.match(REGION_OPEN_RE);
        return m !== null && m[1].trim() === region;
    }).length;

    if (openCount > 1) {
        throw new Error(
            `[SourceSnippet] Duplicate region "${region}" in ${filePath} ` +
            `(found ${openCount} opening markers).`,
        );
    }

    // Extract lines between open and close markers.
    const snippetLines: string[] = [];
    let inside = false;
    let found = false;

    for (const line of lines) {
        const openMatch = line.match(REGION_OPEN_RE);
        if (openMatch && openMatch[1].trim() === region) {
            inside = true;
            found = true;
            continue;
        }

        const closeMatch = line.match(REGION_CLOSE_RE);
        if (closeMatch && closeMatch[1].trim() === region) {
            inside = false;
            continue;
        }

        if (inside) {
            snippetLines.push(line);
        }
    }

    if (!found) {
        throw new Error(
            `[SourceSnippet] Region "${region}" not found in ${filePath}.\n` +
            `  Add a "// #region guide:${region}" marker to the source file.`,
        );
    }

    // Remove trailing empty lines added by formatting.
    while (snippetLines.length > 0 && snippetLines[snippetLines.length - 1].trim() === '') {
        snippetLines.pop();
    }

    const nonEmpty = snippetLines.filter(l => l.trim() !== '');
    if (nonEmpty.length === 0) {
        throw new Error(
            `[SourceSnippet] Region "${region}" in ${filePath} is empty ` +
            `(contains no non-empty lines).`,
        );
    }

    // Dedent: find the minimum leading whitespace across all non-empty lines.
    const minIndent = nonEmpty.reduce((min, line) => {
        const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
        return Math.min(min, indent);
    }, Infinity);

    const dedented = snippetLines.map(line =>
        line.length >= minIndent ? line.slice(minIndent) : line,
    );

    return dedented.join('\n');
}
