import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const sourcePath = path.resolve(projectRoot, 'node_modules', 'stats.js', 'build', 'stats.min.js');
const targetPath = path.resolve(projectRoot, 'public', 'vendor', 'stats.min.js');

const copyVendor = (): void => {
    if (!fs.existsSync(sourcePath)) {
        if (fs.existsSync(targetPath)) {
            console.log(`[vendor:sync] Stats source missing at ${sourcePath}. Keeping existing ${targetPath}.`);
            return;
        }

        throw new Error(
            `[vendor:sync] Missing stats.js source at ${sourcePath} and no existing vendor file at ${targetPath}.`
        );
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);

    const sourceStat = fs.statSync(sourcePath);
    console.log(
        `[vendor:sync] Copied ${sourcePath} -> ${targetPath} (${sourceStat.size} bytes, ${sourceStat.mtime.toISOString()})`
    );
};

copyVendor();
