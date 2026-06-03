import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { rawAssets } from '../../packages/assets/src/catalog.js';
import { resolveAssetCatalog } from '../../packages/assets/src/resolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(projectRoot, '..');

const sourceExamplesDir = path.resolve(repositoryRoot, 'examples');
const sourceAssetsDir = path.resolve(sourceExamplesDir, 'assets');
const sourceCatalogDemoDir = path.resolve(repositoryRoot, 'packages', 'assets', 'demo');
const sourceCatalogTechnicalDir = path.resolve(repositoryRoot, 'packages', 'assets', 'technical');

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

// Walks a directory tree and returns all files matching the predicate.
const findFiles = (dir: string, predicate: (file: string) => boolean): string[] => {
    const results: string[] = [];

    const walk = (current: string): void => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile() && predicate(entry.name)) {
                results.push(fullPath);
            }
        }
    };

    walk(dir);
    return results;
};

// Transpiles TypeScript example sources to JavaScript in-place within
// sourceExamplesDir. Each .ts file (excluding .d.ts declarations) produces a
// sibling .js file that the playground iframe and smoke harness can execute.
// These generated .js files are committed alongside their .ts sources so the
// rest of the toolchain (import.meta.glob, guide embeds, typecheck) can treat
// the examples directory as a normal JS-and-TS tree without a mandatory
// build step.
const transpileTypescriptExamples = (dir: string): number => {
    const tsFiles = findFiles(dir, name => name.endsWith('.ts') && !name.endsWith('.d.ts'));
    let count = 0;

    for (const tsFile of tsFiles) {
        const source = fs.readFileSync(tsFile, 'utf8');

        const { outputText } = ts.transpileModule(source, {
            compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ES2022,
                removeComments: false,
                declaration: false,
                sourceMap: false,
            },
        });

        // Prepend a generated-file notice so editors and linters know not to
        // treat this as the authoritative source.
        const header = `// Auto-generated from ${path.basename(tsFile)} — edit the .ts source, not this file.\n`;
        const jsFile = tsFile.replace(/\.ts$/, '.js');
        fs.writeFileSync(jsFile, header + outputText, 'utf8');
        count++;
    }

    return count;
};

const run = (): void => {
    ensureSource(sourceExamplesDir);
    ensureSource(sourceAssetsDir);
    ensureSource(sourceCatalogDemoDir);
    ensureSource(sourceCatalogTechnicalDir);

    // Transpile TypeScript examples to JavaScript before copying so the
    // generated .js files are included in the public/examples snapshot.
    const transpiled = transpileTypescriptExamples(sourceExamplesDir);
    if (transpiled > 0) {
        console.log(`[examples:sync] Transpiled ${transpiled} TypeScript example(s) to JavaScript`);
    }

    resetDir(targetExamplesDir);
    resetDir(targetAssetsDir);

    copyRecursive(sourceExamplesDir, targetExamplesDir);
    copyRecursive(sourceAssetsDir, targetAssetsDir);
    copyRecursive(sourceCatalogDemoDir, targetCatalogDemoDir);
    copyRecursive(sourceCatalogTechnicalDir, targetCatalogTechnicalDir);

    // Keep runtime serving deterministic: examples/assets is canonical source,
    // but the playground runtime expects /assets/* URLs.
    fs.rmSync(path.resolve(targetExamplesDir, 'assets'), { recursive: true, force: true });

    // Generate assets/catalog.js — the @assets import-map module consumed by
    // example scripts. Paths are resolved relative to preview.html (i.e.
    // 'assets/demo/…', 'assets/technical/…') so no basePath is needed in loaders.
    const resolved = resolveAssetCatalog(rawAssets, 'assets/');
    const catalogLines = [
        '// Auto-generated by examples:sync — do not edit.',
        '',
        ...Object.entries(resolved).map(
            ([key, value]) => `export const ${key} = ${JSON.stringify(value, null, 4)};`,
        ),
        '',
    ];
    fs.writeFileSync(path.resolve(targetAssetsDir, 'catalog.js'), catalogLines.join('\n'), 'utf8');

    console.log(`[examples:sync] Copied ${sourceExamplesDir} -> ${targetExamplesDir}`);
    console.log(`[examples:sync] Copied ${sourceAssetsDir} -> ${targetAssetsDir}`);
    console.log(`[examples:sync] Copied ${sourceCatalogDemoDir} -> ${targetCatalogDemoDir}`);
    console.log(`[examples:sync] Copied ${sourceCatalogTechnicalDir} -> ${targetCatalogTechnicalDir}`);
    console.log(`[examples:sync] Generated ${path.resolve(targetAssetsDir, 'catalog.js')}`);
};

run();
