import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderAssetsGlobalDts } from '../../scripts/generate-examples-global-dts.ts';
import { renderRuntimeDts } from '../../scripts/generate-examples-runtime-dts.ts';
import { transpileTypescriptExamples } from '../../scripts/transpile-examples.ts';
import { assets } from '../../examples/assets/assets.js';
import { rawAssets } from '../../examples/assets/catalog.js';
import { resolveAssetCatalog } from '../../examples/assets/resolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(projectRoot, '..');

const sourceExamplesDir = path.resolve(repositoryRoot, 'examples');
const sourceAssetsDir = path.resolve(sourceExamplesDir, 'assets');
const sourceCatalogDemoDir = path.resolve(sourceExamplesDir, 'assets', 'demo');
const sourceCatalogTechnicalDir = path.resolve(sourceExamplesDir, 'assets', 'technical');

const targetExamplesDir = path.resolve(projectRoot, 'public', 'examples');
const targetAssetsDir = path.resolve(projectRoot, 'public', 'assets');
const targetCatalogDemoDir = path.resolve(targetAssetsDir, 'demo');
const targetCatalogTechnicalDir = path.resolve(targetAssetsDir, 'technical');

const ensureSource = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`[examples:sync] Missing source directory: ${dirPath}`);
  }
};

const resetDir = (dirPath: string): void => {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dirPath), { recursive: true });
};

const copyRecursive = (sourceDir: string, targetDir: string): void => {
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
};

/**
 * The guide sources under `examples/guides/` are read at build time by
 * `SourceSnippet`, straight from the repository. Nothing loads them over HTTP,
 * so they are left out of the served snapshot rather than shipped as dead
 * weight next to the runnable examples.
 */
const copyExamples = (sourceDir: string, targetDir: string): void => {
  const guidesDir = path.resolve(sourceDir, 'guides');

  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: source => source !== guidesDir,
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

    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;

    const source = fs.readFileSync(fullPath, 'utf8');
    const joined = source.replace(/^(import(?: type)? \{)\n([\s\S]*?)\n\} from ('[^']+';)$/gm, (_match, head: string, specifiers: string, from: string) => {
      const names = specifiers
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/,$/, '');

      return `${head} ${names} } from ${from}`;
    });

    if (joined !== source) fs.writeFileSync(fullPath, joined, 'utf8');
  }
};

const run = async (): Promise<void> => {
  ensureSource(sourceExamplesDir);
  ensureSource(sourceAssetsDir);
  ensureSource(sourceCatalogDemoDir);
  ensureSource(sourceCatalogTechnicalDir);

  // Transpile TypeScript examples to JavaScript before copying so the
  // generated .js files are included in the public/examples snapshot.
  const transpiled = await transpileTypescriptExamples(sourceExamplesDir);
  if (transpiled > 0) {
    console.log(`[examples:sync] Transpiled ${transpiled} TypeScript example(s) to JavaScript`);
  }

  // Regenerate the self-contained typed `assets` global declaration from the
  // canonical catalog so the Monaco editor (and typecheck:examples) get
  // hierarchical autocomplete + exact literal types with no `@assets` import.
  // Drift between this and the committed file is guarded by a unit test.
  const globalDtsPath = path.resolve(sourceExamplesDir, 'shared', 'assets-global.d.ts');
  fs.writeFileSync(globalDtsPath, renderAssetsGlobalDts(assets as unknown as Record<string, unknown>), 'utf8');
  console.log(`[examples:sync] Generated ${globalDtsPath}`);

  // The Playground editor resolves `@examples/runtime` through a declaration
  // file it fetches from the served snapshot, so the shared helper kit needs one
  // beside its implementation. Emitted rather than hand-written: a second copy
  // of the same signatures is free to drift from the code the examples run.
  const runtimeDtsPath = path.resolve(sourceExamplesDir, 'shared', 'runtime.d.ts');
  fs.writeFileSync(runtimeDtsPath, renderRuntimeDts(repositoryRoot), 'utf8');
  console.log(`[examples:sync] Generated ${runtimeDtsPath}`);

  resetDir(targetExamplesDir);
  resetDir(targetAssetsDir);

  copyExamples(sourceExamplesDir, targetExamplesDir);
  collapseImportLists(targetExamplesDir);
  copyRecursive(sourceAssetsDir, targetAssetsDir);
  copyRecursive(sourceCatalogDemoDir, targetCatalogDemoDir);
  copyRecursive(sourceCatalogTechnicalDir, targetCatalogTechnicalDir);

  // Keep runtime serving deterministic: examples/assets is canonical source,
  // but the playground runtime expects /assets/* URLs.
  fs.rmSync(path.resolve(targetExamplesDir, 'assets'), { recursive: true, force: true });

  // Generate assets/catalog.js - the resolved runtime catalog imported by the
  // controlled example runtimes to populate the `assets` global. Paths are
  // resolved relative to preview.html (i.e. 'assets/demo/...', 'assets/technical/...')
  // so no basePath is needed in loaders.
  const resolved = resolveAssetCatalog(rawAssets, 'assets/');
  const resolvedAssets = resolveAssetCatalog(assets as unknown as Record<string, unknown>, 'assets/');
  const catalogLines = [
    '// Auto-generated by examples:sync — do not edit.',
    '',
    // Primary hierarchical export - used by all current examples.
    `export const assets = ${JSON.stringify(resolvedAssets, null, 4)};`,
    '',
    // Legacy flat category exports - kept for Asset Browser introspection.
    ...Object.entries(resolved).map(([key, value]) => `export const ${key} = ${JSON.stringify(value, null, 4)};`),
    '',
  ];
  fs.writeFileSync(path.resolve(targetAssetsDir, 'catalog.js'), catalogLines.join('\n'), 'utf8');

  console.log(`[examples:sync] Copied ${sourceExamplesDir} -> ${targetExamplesDir}`);
  console.log(`[examples:sync] Copied ${sourceAssetsDir} -> ${targetAssetsDir}`);
  console.log(`[examples:sync] Copied ${sourceCatalogDemoDir} -> ${targetCatalogDemoDir}`);
  console.log(`[examples:sync] Copied ${sourceCatalogTechnicalDir} -> ${targetCatalogTechnicalDir}`);
  console.log(`[examples:sync] Generated ${path.resolve(targetAssetsDir, 'catalog.js')}`);
};

void run();
