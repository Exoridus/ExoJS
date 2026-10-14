import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vitest/config';
import type { Reporter, TestModule, TestModuleState, TestRunEndReason, TestSpecification, Vitest } from 'vitest/node';

/**
 * Writes one line when a browser test file starts and one when it ends.
 *
 * The other reporters print a file only once it has finished, so a lane whose
 * browser stalls inside a file leaves no trace of that file in the log. With a
 * `FILE_START` line written before any of its tests run, the last started file
 * is in the log even when nothing in it ever completes. The file before it can
 * be the actual cause, for example one that leaked GPU devices, which is why
 * the end of every file is recorded too.
 *
 * Only projects whose name starts with `browser-` are reported. Every line is
 * written straight to stdout, without a TTY and independent of the reporter
 * that formats the results, and starts with `[progress]` so a log can be
 * filtered for it.
 */

interface FileProgressReporterOptions {
  readonly write?: (line: string) => void;
  readonly now?: () => number;
}

const resultLabels: Record<TestModuleState, string> = {
  passed: 'PASS',
  failed: 'FAIL',
  skipped: 'SKIP',
  pending: 'PENDING',
  queued: 'QUEUED',
};

const isBrowserProject = (name: string): boolean => name.startsWith('browser-');

export default class FileProgressReporter implements Reporter {
  private readonly _write: (line: string) => void;
  private readonly _now: () => number;
  private readonly _startedAt = new Map<string, number>();
  private _root = process.cwd();
  private _reporting = false;

  public constructor(options: FileProgressReporterOptions = {}) {
    this._write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
    this._now = options.now ?? Date.now;
  }

  public onInit(vitest: Vitest): void {
    this._root = vitest.config.root;
  }

  public onTestRunStart(specifications: readonly TestSpecification[]): void {
    const filesPerProject = new Map<string, number>();

    for (const specification of specifications) {
      const name = specification.project.name;

      if (isBrowserProject(name)) {
        filesPerProject.set(name, (filesPerProject.get(name) ?? 0) + 1);
      }
    }

    this._reporting = filesPerProject.size > 0;

    for (const [name, files] of filesPerProject) {
      this._emit(`RUN_START ${name} files=${String(files)}`);
    }
  }

  public onTestModuleStart(testModule: TestModule): void {
    if (!isBrowserProject(testModule.project.name)) {
      return;
    }

    this._startedAt.set(testModule.moduleId, this._now());
    this._emit(`FILE_START ${testModule.project.name} ${this._path(testModule)}`);
  }

  public onTestModuleEnd(testModule: TestModule): void {
    if (!isBrowserProject(testModule.project.name)) {
      return;
    }

    const startedAt = this._startedAt.get(testModule.moduleId);
    const duration = startedAt === undefined ? '?' : String(Math.round(this._now() - startedAt));

    this._startedAt.delete(testModule.moduleId);
    this._emit(`FILE_END ${testModule.project.name} ${this._path(testModule)} ${resultLabels[testModule.state()]} ${duration}ms`);
  }

  public onTestRunEnd(_testModules: readonly TestModule[], _errors: readonly unknown[], reason: TestRunEndReason): void {
    if (this._reporting) {
      this._emit(`RUN_END ${reason}`);
    }
  }

  private _path(testModule: TestModule): string {
    return relative(this._root, testModule.moduleId).replaceAll('\\', '/');
  }

  private _emit(event: string): void {
    this._write(`[progress] ${new Date(this._now()).toISOString()} ${event}`);
  }
}

const reporterPath = fileURLToPath(import.meta.url);

/**
 * Adds {@link FileProgressReporter} to every run that includes a browser project.
 *
 * Reporters named on the command line replace the ones in the config, and the
 * CI lanes name their own. The plugin appends the progress reporter to the
 * resolved list instead, so the local hook and CI write the same lines
 * whatever reporters they choose.
 */
export const fileProgressReporterPlugin = (): Plugin => ({
  name: 'exojs:file-progress-reporter',
  configureVitest({ project, vitest }) {
    const reporters = vitest.config.reporters;

    if (!isBrowserProject(project.name) || reporters.some(entry => Array.isArray(entry) && entry[0] === reporterPath)) {
      return;
    }

    reporters.push([reporterPath, {}]);
  },
});
