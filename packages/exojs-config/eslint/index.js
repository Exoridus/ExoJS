// Shared ESLint building blocks for the ExoJS monorepo. Pure data (no plugin
// imports) so it loads without a build and without pulling tooling deps into
// this package. The root eslint.config.ts imports plugins and composes these.

/**
 * `no-restricted-imports` patterns that enforce the package-internal import
 * policy: forbid the removed `@/` alias, parent-relative imports, bare
 * package-internal paths, cross-package `/src` deep imports, and (for Core)
 * extension-package imports.
 * @param {{ internalDirs?: string[], forbidExtensions?: boolean }} [opts]
 * @returns {object[]}
 */
export function createImportBoundaries(opts = {}) {
  const { internalDirs = [], forbidExtensions = true } = opts;
  const patterns = [
    {
      group: ['@/*'],
      message: "The '@/' alias was removed. Use '#dir/X' package-internal subpath imports (or './X' for the same directory).",
    },
    {
      group: ['../*', '../**'],
      message: "No parent-relative imports. Use '#dir/X' for cross-directory or './X' for the same directory.",
    },
  ];
  if (internalDirs.length > 0) {
    patterns.push({
      group: internalDirs.map((d) => `${d}/*`),
      message: "Package-internal imports use the '#' prefix — e.g. '#core/X' instead of 'core/X'.",
    });
  }
  const crossPackage = ['@codexo/exojs/src', '@codexo/exojs/src/*', '@codexo/exojs-*/src', '@codexo/exojs-*/src/*'];
  if (forbidExtensions) crossPackage.unshift('@codexo/exojs-*');
  patterns.push({
    group: crossPackage,
    message: 'Do not import another package via its /src internals' + (forbidExtensions ? '; Core must not import extension packages.' : '.'),
  });
  return patterns;
}

/** The Core engine's top-level source directories (for the bare-path ban). */
export const coreInternalDirs = ['audio', 'core', 'input', 'math', 'animation', 'extensions', 'debug', 'particles', 'physics', 'rendering', 'resources', 'vendor'];
