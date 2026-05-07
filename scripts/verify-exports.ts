import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageJson {
    main?: string;
    module?: string;
    browser?: string;
    types?: string;
    exports?: unknown;
    files?: ReadonlyArray<string>;
}

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '..');
const packageJsonPath = resolve(rootDir, 'package.json');
const packageJson: PackageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const normalizePath = (value: string): string => {
    return value.replace(/\\/g, '/').replace(/^\.\//, '');
};

const collectExportTargets = (value: unknown, targets: Set<string>): void => {
    if (typeof value === 'string') {
        targets.add(value);
        return;
    }

    if (!value || typeof value !== 'object') {
        return;
    }

    for (const nested of Object.values(value as Record<string, unknown>)) {
        collectExportTargets(nested, targets);
    }
};

const targets = new Set<string>();
const entryPointKeys: ReadonlyArray<keyof PackageJson> = ['main', 'module', 'browser', 'types'];

for (const key of entryPointKeys) {
    const value = packageJson[key];
    if (typeof value === 'string') {
        targets.add(value);
    }
}

collectExportTargets(packageJson.exports, targets);

const filesAllowList: ReadonlyArray<string> = Array.isArray(packageJson.files)
    ? packageJson.files.map((value) => normalizePath(String(value)))
    : [];

const missingTargets: Array<string> = [];
const filesCoverageIssues: Array<string> = [];

for (const target of targets) {
    if (typeof target !== 'string' || !target.startsWith('./')) {
        filesCoverageIssues.push(`Unsupported entry target format: ${String(target)}`);
        continue;
    }

    const absoluteTarget = resolve(rootDir, target);
    const normalizedTarget = normalizePath(target);

    if (!existsSync(absoluteTarget)) {
        missingTargets.push(normalizedTarget);
    }

    if (normalizedTarget === 'package.json') {
        continue;
    }

    const coveredByFiles = filesAllowList.some((entry) => {
        if (entry.endsWith('/')) {
            return normalizedTarget.startsWith(entry);
        }
        return normalizedTarget === entry;
    });

    if (!coveredByFiles) {
        filesCoverageIssues.push(
            `Target "${normalizedTarget}" is not covered by package.json files[] allow-list.`,
        );
    }
}

if (missingTargets.length > 0) {
    console.error('Missing package entry targets:');
    for (const target of missingTargets) {
        console.error(`- ${target}`);
    }
}

if (filesCoverageIssues.length > 0) {
    console.error('Package allow-list coverage issues:');
    for (const issue of filesCoverageIssues) {
        console.error(`- ${issue}`);
    }
}

if (missingTargets.length > 0 || filesCoverageIssues.length > 0) {
    process.exit(1);
}

console.log(`verify-exports: checked ${targets.size} package entry target(s).`);
