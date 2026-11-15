import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CompetitiveOptions } from './plan';

export interface CompetitiveAcquisitionDestination {
  readonly options: CompetitiveOptions;
  readonly workerArgs: readonly string[];
}

/**
 * An implicit destination is a convenience, never an overwrite request.
 *
 * Parent and worker processes must use precisely the same chosen directory.
 * Forward it as an explicit --out argument rather than allowing each process
 * to choose its own path. Explicit --out still fails on existing evidence.
 */
export const selectCompetitiveAcquisitionDestination = (
  options: CompetitiveOptions,
  argv: readonly string[],
  exists: (path: string) => boolean = existsSync,
): CompetitiveAcquisitionDestination => {
  if (
    options.worker !== undefined ||
    options.report !== undefined ||
    options.dryRun ||
    options.help ||
    options.list ||
    argv.some(argument => argument.startsWith('--out='))
  ) {
    return { options, workerArgs: argv };
  }

  const base = options.out;
  let out = base;

  for (let index = 1; exists(resolve(out)); index++) {
    if (index > 9_999) {
      throw new Error(`No free benchmark output directory found after 9999 attempts below '${resolve(base)}'.`);
    }

    out = `${base}-${String(index).padStart(3, '0')}`;
  }

  return {
    options: { ...options, out },
    workerArgs: [...argv, `--out=${out}`],
  };
};
