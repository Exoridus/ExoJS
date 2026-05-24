import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const requireFromSite = createRequire(import.meta.url);

const resolveSourceDir = (): string => {
    if (process.env.MONACO_PACKAGE_PATH) {
        return path.resolve(projectRoot, process.env.MONACO_PACKAGE_PATH, 'min', 'vs');
    }

    try {
        const packageJsonPath = requireFromSite.resolve('monaco-editor/package.json');
        return path.resolve(path.dirname(packageJsonPath), 'min', 'vs');
    } catch {
        // Fall through to explicit path candidates.
    }

    const candidates = [
        path.resolve(projectRoot, 'node_modules', 'monaco-editor', 'min', 'vs'),
        path.resolve(projectRoot, '..', 'node_modules', 'monaco-editor', 'min', 'vs'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return candidates[0];
};

const sourceDir = resolveSourceDir();
const targetDir = path.resolve(projectRoot, 'public', 'vendor', 'monaco', 'vs');

const syncMonacoVendor = (): void => {
    if (!fs.existsSync(sourceDir)) {
        if (fs.existsSync(targetDir)) {
            console.log(`[vendor:sync] Monaco source missing at ${sourceDir}. Keeping existing ${targetDir}.`);
            return;
        }

        throw new Error(`[vendor:sync] Missing monaco-editor source at ${sourceDir} and no existing vendor files at ${targetDir}.`);
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });

    console.log(`[vendor:sync] Copied Monaco min/vs from ${sourceDir} -> ${targetDir}`);
};

syncMonacoVendor();
