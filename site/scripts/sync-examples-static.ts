import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(projectRoot, '..');

const sourceExamplesDir = path.resolve(repositoryRoot, 'examples');
const sourceAssetsDir = path.resolve(sourceExamplesDir, 'assets');

const targetExamplesDir = path.resolve(projectRoot, 'public', 'examples');
const targetAssetsDir = path.resolve(projectRoot, 'public', 'assets');

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

const run = (): void => {
    ensureSource(sourceExamplesDir);
    ensureSource(sourceAssetsDir);

    resetDir(targetExamplesDir);
    resetDir(targetAssetsDir);

    copyRecursive(sourceExamplesDir, targetExamplesDir);
    copyRecursive(sourceAssetsDir, targetAssetsDir);

    // Keep runtime serving deterministic: examples/assets is canonical source,
    // but the playground runtime expects /assets/* URLs.
    fs.rmSync(path.resolve(targetExamplesDir, 'assets'), { recursive: true, force: true });

    console.log(`[examples:sync] Copied ${sourceExamplesDir} -> ${targetExamplesDir}`);
    console.log(`[examples:sync] Copied ${sourceAssetsDir} -> ${targetAssetsDir}`);
};

run();
