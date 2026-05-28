import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetManifest } from '../src/manifest.js';
import { rawAssets } from '../src/catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const assetRoots = ['demo', 'technical'];

const excludedDirs = new Set(['src', 'scripts', 'node_modules']);
const excludedFiles = new Set(['package.json', 'tsconfig.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']);

function walkDir(baseDir: string, relative = ''): string[] {
    const entries = fs.readdirSync(path.join(baseDir, relative), { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
        if (excludedDirs.has(entry.name)) continue;
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            results.push(...walkDir(baseDir, rel));
        } else if (!excludedFiles.has(entry.name)) {
            results.push(rel.replace(/\\/g, '/'));
        }
    }
    return results;
}

const diskFiles = new Set<string>();
for (const root of assetRoots) {
    for (const file of walkDir(packageRoot, root)) {
        diskFiles.add(file);
    }
}

const catalogPaths = new Set(assetManifest.paths);

const missingFromCatalog: string[] = [];
const missingFromDisk: string[] = [];

for (const file of diskFiles) {
    if (!catalogPaths.has(file)) {
        missingFromCatalog.push(file);
    }
}

for (const file of catalogPaths) {
    if (!diskFiles.has(file)) {
        missingFromDisk.push(file);
    }
}

let hasErrors = false;

if (missingFromCatalog.length > 0) {
    hasErrors = true;
    console.error('[validate-catalog] Files on disk missing from catalog:');
    for (const file of missingFromCatalog) {
        console.error(`  - ${file}`);
    }
}

if (missingFromDisk.length > 0) {
    hasErrors = true;
    console.error('[validate-catalog] Catalog entries missing from disk:');
    for (const file of missingFromDisk) {
        console.error(`  - ${file}`);
    }
}

if (!hasErrors) {
    console.log(`[validate-catalog] OK: ${diskFiles.size} files on disk, ${catalogPaths.size} paths in catalog \u2014 in sync.`);
} else {
    process.exitCode = 1;
}

function collectPaths(obj: unknown, prefix = ''): string[] {
    if (typeof obj === 'string') {
        return [`${prefix}${obj}`];
    }
    if (obj && typeof obj === 'object') {
        return Object.entries(obj).flatMap(([, value]) => collectPaths(value, prefix));
    }
    return [];
}

console.log('[validate-catalog] Catalog structure:');
for (const [key] of Object.entries(rawAssets)) {
    const paths = collectPaths(rawAssets[key as keyof typeof rawAssets]);
    console.log(`  ${key}: ${paths.length} paths`);
}
