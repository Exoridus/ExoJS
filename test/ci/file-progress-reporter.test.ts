import { describe, expect, it } from 'vitest';

import FileProgressReporter, { fileProgressReporterPlugin } from '../../scripts/ci/file-progress-reporter.ts';

/**
 * A stalled browser lane prints nothing between `RUN` and the supervisor's
 * deadline, so the log cannot tell which file was running. The progress
 * reporter writes a line when a file starts and when it ends, which leaves the
 * last started file in the log even when no test in it ever finishes.
 */

const root = 'C:/repo';

const createModule = (file: string, project: string, state = 'passed') => ({
  moduleId: `${root}/${file}`,
  project: { name: project },
  state: () => state,
});

const createReporter = (clock: { ms: number }) => {
  const lines: string[] = [];
  const reporter = new FileProgressReporter({ write: line => lines.push(line), now: () => clock.ms });

  reporter.onInit({ config: { root } } as never);

  return { lines, reporter };
};

describe('FileProgressReporter', () => {
  it('writes the start of a file before any of its tests finish', () => {
    const clock = { ms: Date.UTC(2026, 9, 14, 9, 8, 25) };
    const { lines, reporter } = createReporter(clock);

    reporter.onTestModuleStart(createModule('test/rendering/browser/webgpu-a.test.ts', 'browser-webgpu') as never);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[progress\] \S+ FILE_START browser-webgpu test\/rendering\/browser\/webgpu-a\.test\.ts$/);
  });

  it('writes the end of a file with its result and the time since it started', () => {
    const clock = { ms: 1_000 };
    const { lines, reporter } = createReporter(clock);
    const module = createModule('test/rendering/browser/webgpu-a.test.ts', 'browser-webgpu', 'failed');

    reporter.onTestModuleStart(module as never);
    clock.ms += 2041;
    reporter.onTestModuleEnd(module as never);

    expect(lines[1]).toMatch(/ FILE_END browser-webgpu test\/rendering\/browser\/webgpu-a\.test\.ts FAIL 2041ms$/);
  });

  it('names the run and its browser projects when the run starts and ends', () => {
    const clock = { ms: 0 };
    const { lines, reporter } = createReporter(clock);

    reporter.onTestRunStart([
      { moduleId: `${root}/a.test.ts`, project: { name: 'browser-webgpu' } },
      { moduleId: `${root}/b.test.ts`, project: { name: 'browser-webgpu' } },
      { moduleId: `${root}/c.test.ts`, project: { name: 'exojs' } },
    ] as never);
    reporter.onTestRunEnd([], [], 'interrupted');

    expect(lines[0]).toMatch(/ RUN_START browser-webgpu files=2$/);
    expect(lines[1]).toMatch(/ RUN_END interrupted$/);
  });

  it('stays silent for projects that do not run in a browser', () => {
    const clock = { ms: 0 };
    const { lines, reporter } = createReporter(clock);
    const module = createModule('test/core/a.test.ts', 'exojs');

    reporter.onTestRunStart([{ moduleId: `${root}/test/core/a.test.ts`, project: { name: 'exojs' } }] as never);
    reporter.onTestModuleStart(module as never);
    reporter.onTestModuleEnd(module as never);
    reporter.onTestRunEnd([], [], 'passed');

    expect(lines).toEqual([]);
  });
});

describe('fileProgressReporterPlugin', () => {
  // The CI lanes pass their own --reporter flags, which replace the reporters in
  // the config. The plugin adds the progress reporter to the resolved list, so
  // it runs under any reporter selection.
  const configure = (projects: string[], reporters: Array<[string, object]>) => {
    const hook = fileProgressReporterPlugin().configureVitest as (context: unknown) => void;

    for (const name of projects) {
      hook({ project: { name }, vitest: { config: { reporters } } });
    }

    return reporters;
  };

  it('adds the reporter next to the reporters chosen on the command line', () => {
    const reporters = configure(
      ['browser-webgpu (chromium)'],
      [
        ['minimal', {}],
        ['junit', {}],
      ],
    );

    expect(reporters.map(([name]) => name)).toEqual(['minimal', 'junit', expect.stringMatching(/file-progress-reporter.ts$/)]);
  });

  it('adds it once however many browser projects run', () => {
    expect(configure(['browser-webgpu (chromium)', 'browser-webgpu-media (chromium)'], [['default', {}]])).toHaveLength(2);
  });

  it('leaves a run without browser projects untouched', () => {
    expect(configure(['exojs', 'exojs-physics'], [['default', {}]])).toEqual([['default', {}]]);
  });
});
