import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const packageRoot = process.env.EXOJS_PACKAGE_PATH
    ? path.resolve(projectRoot, process.env.EXOJS_PACKAGE_PATH)
    : path.resolve(projectRoot, 'node_modules', 'exojs');
const sourceDistDir = path.resolve(packageRoot, 'dist');

const flatTargetDir = path.resolve(projectRoot, 'public', 'vendor', 'exojs');

// Required artifacts — abort on missing. If a required file is unavailable,
// the iframe runtime can't load the library, so failing loud is correct.
const requiredArtifacts = [
    'exo.esm.js',
    'exo.esm.js.map',
];

// Names of flat-level files this script writes (not source-derived). The
// `exo.d.ts` is generated from whatever declaration source the library
// ships — sometimes a bundled top-level file, sometimes derived from the
// dist/esm tree. `esm-typings.json` is the manifest of declaration files
// that Monaco walks at runtime.
const generatedTypingsFiles = [
    'exo.d.ts',
    'module-shims.d.ts',
    'esm-typings.json',
];

// Top-level entries this script owns under `public/vendor/exojs/`. Anything
// else there (notably the versioned subdirectories the script itself
// produces) is left intact between runs so older pinned snapshots stay
// safe when the in-development version is re-synced. The `esm/` directory
// is included so subsequent syncs can clean it up before re-populating.
const flatManagedEntries: ReadonlyArray<{ name: string; type: 'file' | 'dir' }> = [
    ...requiredArtifacts.map(name => ({ name, type: 'file' as const })),
    ...generatedTypingsFiles.map(name => ({ name, type: 'file' as const })),
    { name: 'esm', type: 'dir' as const },
];

// module-shims declares an ambient `exojs` module re-exporting from the
// declaration tree's index. The relative path resolves against the
// virtual filesystem path Monaco gets when EditorCode registers this
// file as an extra lib.
const moduleShims = `declare module "exojs" {
    export * from "./esm/index";
}
`;

const ensureSourcePackage = (): void => {
    if (!fs.existsSync(sourceDistDir)) {
        throw new Error(
            `[vendor:sync] Missing ExoJS package dist at ${sourceDistDir}. Install dependencies and ensure the local exojs package is built.`
        );
    }
};

const readRootPackageVersion = (): string => {
    const rootPackageJsonPath = path.resolve(projectRoot, '..', 'package.json');
    if (!fs.existsSync(rootPackageJsonPath)) {
        throw new Error(`[vendor:sync] Root package.json missing at ${rootPackageJsonPath}.`);
    }
    const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8')) as { version?: unknown };
    if (typeof rootPackageJson.version !== 'string' || rootPackageJson.version.length === 0) {
        throw new Error(`[vendor:sync] Root package.json at ${rootPackageJsonPath} has no usable "version" field.`);
    }
    return rootPackageJson.version;
};

const patchExoDeclarations = (declarationsPath: string): void => {
    if (!fs.existsSync(declarationsPath)) {
        return;
    }

    const original = fs.readFileSync(declarationsPath, 'utf8');
    const patched = original
        .replace(
            '        init?: (resources: ResourceContainer) => void;',
            '        init?: (loader: Loader) => Promise<void> | void;'
        )
        .replace(
            '        unload?: () => Promise<void> | void;',
            '        unload?: (loader: Loader) => Promise<void> | void;'
        )
        .replace(
            '        init(resources: ResourceContainer): void;',
            '        init(loader: Loader): Promise<void> | void;'
        )
        .replace(
            '        unload(): Promise<void> | void;',
            '        unload(loader: Loader): Promise<void> | void;'
        );

    if (patched !== original) {
        fs.writeFileSync(declarationsPath, patched, 'utf8');
    }
};

const copyArtifact = (
    fileName: string,
    targetDir: string,
    options: { required: boolean }
): boolean => {
    const sourcePath = path.resolve(sourceDistDir, fileName);
    const targetPath = path.resolve(targetDir, fileName);

    if (!fs.existsSync(sourcePath)) {
        if (options.required) {
            throw new Error(`[vendor:sync] Missing required ExoJS package file at ${sourcePath}.`);
        }
        console.warn(`[vendor:sync] Optional file ${fileName} not present at ${sourcePath} — skipping.`);
        return false;
    }

    fs.copyFileSync(sourcePath, targetPath);
    return true;
};

// Walks a directory and returns every `.d.ts` file's path relative to the
// passed root, using forward slashes. Used to enumerate the library's
// `dist/esm/` declaration tree so it can be shipped to the vendor snapshot
// and consumed via a manifest at runtime.
const collectDeclarationFiles = (rootDir: string): string[] => {
    const results: string[] = [];

    const walk = (relDir: string): void => {
        const absDir = path.resolve(rootDir, relDir);
        for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
            const relEntry = relDir ? path.join(relDir, entry.name) : entry.name;
            if (entry.isDirectory()) {
                walk(relEntry);
            } else if (entry.isFile() && relEntry.endsWith('.d.ts')) {
                results.push(relEntry.split(path.sep).join('/'));
            }
        }
    };

    walk('');
    return results.sort();
};

const copyDeclarationTree = (sourceEsmDir: string, destEsmDir: string): string[] => {
    fs.rmSync(destEsmDir, { recursive: true, force: true });
    fs.mkdirSync(destEsmDir, { recursive: true });

    const dtsFiles = collectDeclarationFiles(sourceEsmDir);
    for (const rel of dtsFiles) {
        const src = path.resolve(sourceEsmDir, rel);
        const dst = path.resolve(destEsmDir, rel);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
    }
    return dtsFiles;
};

// Normalize the library's TypeScript declarations into a layout Monaco can
// resolve. Two paths are supported, in order of preference:
//
//   1. The library ships a single bundled `dist/exo.d.ts`. We copy it
//      verbatim and apply the existing inline patch.
//   2. The library ships the declaration tree under `dist/esm/`. We copy
//      the whole tree to `vendor/exojs/esm/`, write an `exo.d.ts` stub
//      that re-exports from `./esm/index`, and emit `esm-typings.json`
//      so the editor can enumerate every `.d.ts` at runtime.
//
// If neither source exists we warn and skip — Monaco will still work, just
// without ExoJS-aware IntelliSense. Per phase2-architecture.md, this is
// the documented graceful degradation.
const syncTypings = (): void => {
    const sourceFlatDts = path.resolve(sourceDistDir, 'exo.d.ts');
    const sourceEsmDir = path.resolve(sourceDistDir, 'esm');
    const destFlatDts = path.resolve(flatTargetDir, 'exo.d.ts');
    const destEsmDir = path.resolve(flatTargetDir, 'esm');
    const destManifest = path.resolve(flatTargetDir, 'esm-typings.json');

    // Clear any prior sync's outputs so re-syncs are deterministic.
    fs.rmSync(destFlatDts, { force: true });
    fs.rmSync(destManifest, { force: true });
    fs.rmSync(destEsmDir, { recursive: true, force: true });

    if (fs.existsSync(sourceFlatDts)) {
        fs.copyFileSync(sourceFlatDts, destFlatDts);
        patchExoDeclarations(destFlatDts);
        console.log(`[vendor:sync] exo.d.ts: copied bundled declarations from ${sourceFlatDts}.`);
        return;
    }

    if (fs.existsSync(sourceEsmDir)) {
        const dtsFiles = copyDeclarationTree(sourceEsmDir, destEsmDir);

        fs.writeFileSync(
            destFlatDts,
            [
                '// Auto-generated by sync-exo-vendor.ts.',
                '//',
                '// The library does not ship a single bundled exo.d.ts at the dist root,',
                '// so this stub re-exports from the per-module declaration tree under',
                '// ./esm. Monaco resolves the relative path against this file\'s virtual',
                '// path (file:///node_modules/exojs/dist/exo.d.ts) and lands in the tree',
                '// shipped to ./esm by the same sync run.',
                'export * from \'./esm/index\';',
                '',
            ].join('\n'),
            'utf8'
        );

        fs.writeFileSync(destManifest, JSON.stringify(dtsFiles, null, 2) + '\n', 'utf8');

        console.log(`[vendor:sync] exo.d.ts: shim re-exporting ${dtsFiles.length} declarations from ${sourceEsmDir}.`);
        return;
    }

    console.warn(
        `[vendor:sync] No declaration source found at ${sourceFlatDts} or ${sourceEsmDir}. Monaco will run without ExoJS-aware IntelliSense.`
    );
};

const copyEntryRecursive = (sourcePath: string, destPath: string): void => {
    const stat = fs.lstatSync(sourcePath);
    if (stat.isDirectory()) {
        fs.rmSync(destPath, { recursive: true, force: true });
        fs.mkdirSync(destPath, { recursive: true });
        for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
            copyEntryRecursive(
                path.resolve(sourcePath, entry.name),
                path.resolve(destPath, entry.name)
            );
        }
        return;
    }
    if (stat.isFile()) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(sourcePath, destPath);
    }
};

// Replicate the managed flat-level entries into the per-version snapshot
// directory. We only copy entries this script *owns* (see flatManagedEntries)
// so other pinned-version subdirectories are never accidentally nested.
// The versioned snapshot is byte-identical to the flat copy at sync time.
const mirrorFlatToVersioned = (versionedDir: string): void => {
    fs.rmSync(versionedDir, { recursive: true, force: true });
    fs.mkdirSync(versionedDir, { recursive: true });

    for (const entry of flatManagedEntries) {
        const src = path.resolve(flatTargetDir, entry.name);
        const dst = path.resolve(versionedDir, entry.name);
        if (!fs.existsSync(src)) continue;
        copyEntryRecursive(src, dst);
    }
};

const syncVendor = (): void => {
    ensureSourcePackage();

    const versionId = readRootPackageVersion();
    const versionedTargetDir = path.resolve(flatTargetDir, versionId);

    fs.mkdirSync(flatTargetDir, { recursive: true });

    // Clear only the entries we manage; leave foreign version subdirectories
    // intact so other pinned snapshots survive an in-dev re-sync.
    for (const entry of flatManagedEntries) {
        const target = path.resolve(flatTargetDir, entry.name);
        if (entry.type === 'dir') {
            fs.rmSync(target, { recursive: true, force: true });
        } else {
            fs.rmSync(target, { force: true });
        }
    }

    for (const fileName of requiredArtifacts) {
        copyArtifact(fileName, flatTargetDir, { required: true });
    }

    syncTypings();

    fs.writeFileSync(
        path.resolve(flatTargetDir, 'module-shims.d.ts'),
        moduleShims,
        'utf8'
    );

    mirrorFlatToVersioned(versionedTargetDir);

    console.log(
        `[vendor:sync] Copied ExoJS ESM runtime + declarations from ${sourceDistDir} -> ${flatTargetDir}`
    );
    console.log(
        `[vendor:sync] Mirrored vendor snapshot to ${versionedTargetDir}`
    );
};

syncVendor();
