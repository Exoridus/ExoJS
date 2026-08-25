/**
 * Guards the "Minimal working example" code block in this package's README
 * against silently rotting out of sync with the real Scene/ParticleSystem
 * API. The block is copy-paste surface for new users - a stale hook name or
 * a non-existent lifecycle method compiles to nothing at runtime (`Scene`
 * lifecycle hooks that don't exist are simply never called), so a broken
 * example fails silent instead of loud. Typechecking it against the actual
 * engine/package source turns that silent failure into a caught one.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// `import.meta.url` is not a real file:// URL under this project's vitest
// setup; vitest always runs from the repo root, so `process.cwd()` is the
// reliable anchor (see other repo-root-relative tests under test/site/).
const repoRoot = process.cwd();
const readmePath = resolve(repoRoot, 'packages/exojs-particles/README.md');

const extractMinimalExample = (): string => {
  const readme = readFileSync(readmePath, 'utf8');
  const heading = '## Minimal working example';
  const headingIndex = readme.indexOf(heading);

  if (headingIndex < 0) {
    throw new Error(`README.md is missing the "${heading}" section.`);
  }

  const afterHeading = readme.slice(headingIndex);
  const fenceMatch = /```ts\n([\s\S]*?)```/.exec(afterHeading);

  if (fenceMatch === null) {
    throw new Error(`"${heading}" section has no \`\`\`ts fenced code block.`);
  }

  return fenceMatch[1]!;
};

describe('README "Minimal working example"', () => {
  it('typechecks against the real Scene/ParticleSystem API', () => {
    const source = extractMinimalExample();
    const tmpDir = mkdtempSync(join(tmpdir(), 'exojs-particles-readme-'));
    const filePath = join(tmpDir, 'readme-minimal-example.ts');

    try {
      writeFileSync(filePath, source, 'utf8');

      const compilerOptions: ts.CompilerOptions = {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
        lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
        types: [],
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        // The package's own source resolves its internal `#foo` subpath
        // imports through these two conditions (see package.json#imports) -
        // without them every internal import inside @codexo/exojs-particles
        // fails to resolve and every export downgrades to `any`, masking
        // real type errors in the snippet under test.
        resolvePackageJsonImports: true,
        customConditions: ['@codexo/exojs-source', '@codexo/exojs-particles-source'],
        baseUrl: repoRoot,
        paths: {
          '@codexo/exojs': ['./src/index.ts'],
          '@codexo/exojs-particles': ['./packages/exojs-particles/src/index.ts'],
        },
      };

      const program = ts.createProgram({ rootNames: [filePath], options: compilerOptions });
      // Only diagnostics attributed to the README's own snippet count - the
      // engine and this package have their own, stricter build gates, and
      // holding this test to their diagnostics too would make it fail for
      // reasons that have nothing to do with the README example itself.
      // TypeScript always reports `file.fileName` with forward slashes
      // regardless of platform, so the comparison target must be normalized
      // the same way on Windows.
      const normalizedFilePath = filePath.replace(/\\/g, '/');
      const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => d.file?.fileName === normalizedFilePath);

      if (diagnostics.length > 0) {
        const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: f => f,
          getCurrentDirectory: () => repoRoot,
          getNewLine: () => '\n',
        });

        throw new Error(`README "Minimal working example" has ${diagnostics.length} type error(s):\n\n${formatted}`);
      }

      expect(diagnostics).toHaveLength(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
