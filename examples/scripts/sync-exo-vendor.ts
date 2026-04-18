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
const targetDir = path.resolve(projectRoot, 'public', 'vendor', 'exojs');

const filesToCopy = [
    'exo.esm.js',
    'exo.esm.js.map',
    'exo.d.ts',
];

const moduleShims = `declare module "exojs" {
    export * from "index";
}
`;

const ensureSourcePackage = (): void => {
    if (!fs.existsSync(sourceDistDir)) {
        throw new Error(
            `[vendor:sync] Missing ExoJS package dist at ${sourceDistDir}. Install dependencies and ensure the local exojs package is built.`
        );
    }
};

const patchExoDeclarations = (): void => {
    const declarationsPath = path.resolve(targetDir, 'exo.d.ts');

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

const copyVendorFiles = (): void => {
    ensureSourcePackage();

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });

    for (const fileName of filesToCopy) {
        const sourcePath = path.resolve(sourceDistDir, fileName);
        const targetPath = path.resolve(targetDir, fileName);

        if (!fs.existsSync(sourcePath)) {
            throw new Error(`[vendor:sync] Missing ExoJS package file at ${sourcePath}.`);
        }

        fs.copyFileSync(sourcePath, targetPath);
    }

    patchExoDeclarations();

    fs.writeFileSync(path.resolve(targetDir, 'module-shims.d.ts'), moduleShims, 'utf8');

    console.log(
        `[vendor:sync] Copied ExoJS ESM runtime and declarations from ${sourceDistDir} -> ${targetDir}`
    );
};

copyVendorFiles();
