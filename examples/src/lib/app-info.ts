// Load both package.json files as raw JSON text so every field survives the
// Vite bundler's per-field tree-shaker. The cost is ~4 KB of JSON text in
// the bundle; negligible for a one-off module that runs once at startup.
//
//  - Library identity (name, version, license, repo) comes from the root
//    `package.json` — that is the thing users install and deploy against.
//  - Author info falls back to the examples app's own `package.json` when
//    the root does not declare one.
import rootPkgRaw from '../../../package.json?raw';
import examplesPkgRaw from '../../package.json?raw';

export interface AppInfo {
  version: string;
  packageName: string;
  repositoryUrl: string;
  license: string;
  author: string;
}

interface RawPackageJson {
  name?: string;
  version?: string;
  homepage?: string;
  license?: string;
  author?: string | { name?: string };
  repository?: string | { url?: string };
}

function parsePackageJson(raw: string): RawPackageJson {
  try {
    return JSON.parse(raw) as RawPackageJson;
  } catch {
    return {};
  }
}

function resolveAuthor(value: RawPackageJson['author']): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return typeof value.name === 'string' ? value.name : '';
}

function resolveRepositoryUrl(value: RawPackageJson['repository']): string {
  if (!value) return '';
  const raw = typeof value === 'string' ? value : (value.url ?? '');
  return raw.replace(/^git\+/, '').replace(/\.git$/, '');
}

const rootPkg = parsePackageJson(rootPkgRaw);
const examplesPkg = parsePackageJson(examplesPkgRaw);

export const appInfo: AppInfo = {
  version: rootPkg.version ?? '',
  packageName: rootPkg.name ?? '',
  repositoryUrl: rootPkg.homepage && rootPkg.homepage.length > 0
    ? rootPkg.homepage
    : resolveRepositoryUrl(rootPkg.repository),
  license: rootPkg.license ?? '',
  author: resolveAuthor(rootPkg.author) || resolveAuthor(examplesPkg.author),
};
