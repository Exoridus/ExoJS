import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const sourceDir = path.resolve(projectRoot, 'node_modules', 'monaco-editor', 'min', 'vs');
const targetDir = path.resolve(projectRoot, 'public', 'vendor', 'monaco', 'vs');

const syncMonacoVendor = (): void => {
    if (!fs.existsSync(sourceDir)) {
        if (fs.existsSync(targetDir)) {
            console.log(`[vendor:sync] Monaco source missing at ${sourceDir}. Keeping existing ${targetDir}.`);
            return;
        }

        throw new Error(
            `[vendor:sync] Missing monaco-editor source at ${sourceDir} and no existing vendor files at ${targetDir}.`
        );
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });

    console.log(`[vendor:sync] Copied Monaco min/vs from ${sourceDir} -> ${targetDir}`);
};

syncMonacoVendor();
