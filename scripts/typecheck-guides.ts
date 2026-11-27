/**
 * Check extracted guide snippets with the native TypeScript compiler.
 *
 * The guide program also references engine sources, but those have their own
 * stricter check. Only diagnostics owned by a generated snippet (and global
 * configuration errors) fail this documentation gate.
 */
import { globSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { checkNativeProject } from './lib/native-compiler-diagnostics.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const CONFIG_PATH = resolve(REPO_ROOT, 'tsconfig.guides.json');
const SNIPPET_DIR = resolve(REPO_ROOT, process.env.GUIDE_SNIPPET_OUT ?? '.workspace/generated/guide-typecheck');

const isSnippet = (file: string): boolean => {
  const path = relative(SNIPPET_DIR, resolve(file));

  return path.length > 0 && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\');
};

const result = checkNativeProject(CONFIG_PATH, REPO_ROOT);
const diagnostics = result.diagnostics.filter(item => item.file === null || isSnippet(item.file));

if (diagnostics.length > 0) {
  console.error(diagnostics.map(item => item.line).join('\n'));
  console.error(`typecheck:guides: ${diagnostics.length} error(s) in extracted guide snippets.`);
  process.exit(1);
}

const snippets = globSync('**/*.{ts,tsx}', { cwd: SNIPPET_DIR, exclude: ['**/*.d.ts'] });
console.log(`typecheck:guides: ${snippets.length} snippet file(s) checked, no errors.`);
