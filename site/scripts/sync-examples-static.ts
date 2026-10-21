import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderRuntimeDts } from '../../scripts/generate-examples-runtime-dts.ts';
import { transpileTypescriptExamples } from '../../scripts/transpile-examples.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(projectRoot, '..');

const sourceExamplesDir = path.resolve(repositoryRoot, 'examples');

const targetExamplesDir = path.resolve(projectRoot, 'public', 'examples');
// Earlier syncs served the whole examples/assets tree here. The examples now
// load their media through @codexo/exojs-demo-assets (vendor/exojs-demo-assets),
// so a stale copy is removed rather than shipped.
const staleAssetsDir = path.resolve(projectRoot, 'public', 'assets');

const ensureSource = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`[examples:sync] Missing source directory: ${dirPath}`);
  }
};

const resetDir = (dirPath: string): void => {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dirPath), { recursive: true });
};

/**
 * The guide sources under `examples/guides/` are read at build time by
 * `SourceSnippet`, straight from the repository, and the media under
 * `examples/assets/` are the authoring source of the demo-assets package.
 * Nothing loads either over HTTP, so both are left out of the served snapshot.
 */
const copyExamples = (sourceDir: string, targetDir: string): void => {
  const skipped = new Set([path.resolve(sourceDir, 'guides'), path.resolve(sourceDir, 'assets')]);

  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: source => !skipped.has(source),
  });
};

/**
 * Join every multi-line import list in the served TypeScript sources onto one
 * line. The repository's formatter wraps a long list at its column limit, which
 * is right for a diff and wrong for the playground, where a dozen lines of
 * imports push the first line of the example itself below the fold. The served
 * copy is what the editor shows, so the join lives here rather than in a
 * formatter override that would also unwrap everything else.
 */
const collapseImportLists = (dir: string): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collapseImportLists(fullPath);
      continue;
    }

    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) {
      continue;
    }

    const source = fs.readFileSync(fullPath, 'utf8');
    const joined = source.replace(
      /^(import(?: type)? \{)\n([\s\S]*?)\n\} from ('[^']+';)$/gm,
      (_match, head: string, specifiers: string, from: string) => {
        const names = specifiers
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .join(' ')
          .replace(/,$/, '');

        return `${head} ${names} } from ${from}`;
      },
    );

    if (joined !== source) {
      fs.writeFileSync(fullPath, joined, 'utf8');
    }
  }
};

const run = async (): Promise<void> => {
  ensureSource(sourceExamplesDir);

  // Transpile TypeScript examples to JavaScript before copying so the
  // generated .js files are included in the public/examples snapshot.
  const transpiled = await transpileTypescriptExamples(sourceExamplesDir);

  if (transpiled > 0) {
    console.log(`[examples:sync] Transpiled ${transpiled} TypeScript example(s) to JavaScript`);
  }

  // The Playground editor resolves `@examples/runtime` through a declaration
  // file it fetches from the served snapshot, so the shared helper kit needs one
  // beside its implementation. Emitted rather than hand-written: a second copy
  // of the same signatures is free to drift from the code the examples run.
  const runtimeDtsPath = path.resolve(sourceExamplesDir, 'shared', 'runtime.d.ts');
  fs.writeFileSync(runtimeDtsPath, renderRuntimeDts(repositoryRoot), 'utf8');
  console.log(`[examples:sync] Generated ${runtimeDtsPath}`);

  resetDir(targetExamplesDir);
  fs.rmSync(staleAssetsDir, { recursive: true, force: true });

  copyExamples(sourceExamplesDir, targetExamplesDir);
  collapseImportLists(targetExamplesDir);

  console.log(`[examples:sync] Copied ${sourceExamplesDir} -> ${targetExamplesDir}`);
};

void run();
