/**
 * Parse native TypeScript CLI diagnostics without importing the legacy TS6 API.
 * TypeScript 7.1's `tsc --pretty false` prints stable one-line diagnostic
 * headers, even when the explanatory message spans several lines.
 */
import { resolve } from 'node:path';

import { runTypeScriptCompiler } from '@codexo/exojs-config/typescript/compiler';

export interface NativeDiagnostic {
  /** Absolute diagnostic source path or null for a global/config error. */
  readonly file: string | null;
  /** The original diagnostic header, including TS code and location. */
  readonly line: string;
}

const FILE_DIAGNOSTIC = /^(.*)\((\d+),(\d+)\): (?:error|warning) TS\d+: /u;
const GLOBAL_DIAGNOSTIC = /^(?:error|warning) TS\d+: /u;

/** Public parser for isolated regression tests (including Windows paths). */
export const parseNativeDiagnostics = (output: string, cwd: string): NativeDiagnostic[] => {
  const diagnostics: NativeDiagnostic[] = [];

  for (const line of output.split(/\r?\n/u)) {
    const matched = FILE_DIAGNOSTIC.exec(line);

    if (matched) {
      diagnostics.push({ file: resolve(cwd, matched[1]!), line });
    } else if (GLOBAL_DIAGNOSTIC.test(line)) {
      diagnostics.push({ file: null, line });
    }
  }

  return diagnostics;
};

/** Execute a config-scoped native typecheck without silently dropping failures. */
export const checkNativeProject = (tsconfig: string, cwd: string): { status: number; diagnostics: NativeDiagnostic[]; output: string } => {
  const result = runTypeScriptCompiler(['--noEmit', '--pretty', 'false', '-p', tsconfig], { cwd, stdio: 'pipe' });
  const diagnostics = parseNativeDiagnostics(result.output, cwd);

  if (result.status !== 0 && diagnostics.length === 0) {
    throw new Error(`Native TypeScript check failed without parseable diagnostics:\n${result.output}`);
  }

  // Config errors can point to an inherited JSON file outside the caller's source scope.
  const configErrors = diagnostics.filter(({ file }) => file !== null && /\.jsonc?$/iu.test(file));

  if (configErrors.length > 0) {
    throw new Error(configErrors.map(({ line }) => line).join('\n'));
  }

  return { ...result, diagnostics };
};
