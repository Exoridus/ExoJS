import { pathToFileURL } from 'node:url';

import { effectiveLanes, selectAreas, type EffectiveLanes, type LaneAreas } from './select-lanes.ts';

/**
 * The lane table - the single description of what CI and the pre-push hook run.
 *
 * `ci.yml` has one matrix job per stage and reads its entries from `planCi`;
 * `scripts/lanes.ts` runs the same table locally. A lane is added here and
 * nowhere else. The workflow never names a lane.
 *
 * Dependency-free and erasable TypeScript, like `select-lanes.ts`: the `plan`
 * job runs this with plain `node` before any install, so nothing outside
 * `node:` may be imported and the syntax must be type-strippable.
 */

export type Stage = 'gates' | 'test' | 'verify';

export interface Lane {
  /** Matrix entry name, also the JUnit artifact and Codecov flag. */
  id: string;
  stage: Stage;
  /** The effective lane that enables this entry; `always` runs on every event. */
  when: keyof EffectiveLanes | 'always';
  /** What the developer runs locally. */
  run: string;
  /** Replaces `run` on CI: reporters, display wrappers and environment. */
  ciRun?: string;
  /** Replaces `ciRun` when the run collects coverage (pushes to a long-lived branch). */
  coverageRun?: string;
  /** Playwright browser to install on the runner. */
  browser?: 'chromium' | 'firefox';
  /** Extra apt packages the runner needs. */
  apt?: readonly string[];
  /** Needs the Naga WGSL validator on PATH. */
  naga?: boolean;
  /** Needs the built dist artifact. */
  dist?: boolean;
  /** Needs a browser locally too (skipped by `lanes --quick`). */
  local?: 'browser' | 'gate';
  /** Runs on CI only: its assertions hold for the runner's software rasteriser, not a developer's GPU. */
  ciOnly?: boolean;
  /** Emits `test-results/<id>.junit.xml` for the skip budget and Codecov. */
  junit?: boolean;
  /** Pull requests only. */
  pullRequestOnly?: boolean;
  timeoutMinutes?: number;
}

const junit = (id: string): string => `--reporter=default --reporter=junit --outputFile.junit=./test-results/${id}.junit.xml`;

export const LANES: readonly Lane[] = [
  { id: 'typecheck', stage: 'gates', when: 'typecheck', run: 'pnpm gates typecheck', local: 'gate' },
  { id: 'lint', stage: 'gates', when: 'lint', run: 'pnpm gates lint', local: 'gate' },
  { id: 'sync', stage: 'gates', when: 'always', run: 'pnpm gates sync', local: 'gate' },

  {
    id: 'unit',
    stage: 'test',
    when: 'unit',
    run: 'pnpm test && pnpm test:alloc',
    // The WGSL tests validate through Naga when it is on PATH and skip
    // otherwise; CI installs it and refuses the skip.
    ciRun: `EXOJS_REQUIRE_NAGA=1 pnpm test ${junit('unit')} && pnpm test:alloc`,
    coverageRun: `EXOJS_REQUIRE_NAGA=1 pnpm test:coverage ${junit('unit')} && pnpm test:alloc`,
    naga: true,
    junit: true,
  },
  {
    id: 'webgl',
    stage: 'test',
    when: 'browserWebgl2',
    run: 'pnpm test:browser:webgl && pnpm test:browser:build && pnpm test:browser:assets',
    ciRun: `pnpm test:browser:webgl ${junit('webgl')} && pnpm test:browser:build && pnpm test:browser:assets`,
    coverageRun:
      `pnpm test:browser:webgl ${junit('webgl')} --coverage --coverage.reporter=lcov --coverage.reporter=text-summary ` +
      '--coverage.thresholds.statements=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.lines=0 ' +
      '&& pnpm test:browser:build && pnpm test:browser:assets',
    browser: 'chromium',
    local: 'browser',
    junit: true,
  },
  {
    id: 'webgpu',
    stage: 'test',
    when: 'browserWebgpu',
    run: 'pnpm test:browser:webgpu',
    // Mesa lavapipe is the only WebGPU adapter a GPU-less runner can offer, and
    // Chromium exposes it only to a headed browser, hence xvfb.
    ciRun: 'VK_DRIVER_FILES=/usr/share/vulkan/icd.d/lvp_icd.x86_64.json EXOJS_WEBGPU_CI_HEADED=1 ' + `xvfb-run -a pnpm test:browser:webgpu ${junit('webgpu')}`,
    browser: 'chromium',
    apt: ['mesa-vulkan-drivers', 'xvfb'],
    local: 'browser',
    junit: true,
  },
  {
    id: 'firefox',
    stage: 'test',
    when: 'browserFirefox',
    run: 'pnpm test:browser:webgl:firefox',
    // Firefox only exposes WebGL2 to a headed session; the WebGPU run after it
    // is informational and never fails the lane.
    ciRun:
      'EXOJS_FIREFOX_CI_HEADED=1 LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe ' +
      `xvfb-run -a pnpm test:browser:webgl:firefox ${junit('firefox')} && (pnpm test:browser:webgpu:firefox || true)`,
    browser: 'firefox',
    apt: ['xvfb'],
    local: 'browser',
    ciOnly: true,
    junit: true,
  },
  {
    id: 'audio',
    stage: 'test',
    when: 'browserAudio',
    run: 'pnpm test:browser:audio',
    ciRun: `pnpm test:browser:audio ${junit('audio')}`,
    browser: 'chromium',
    local: 'browser',
    junit: true,
  },
  {
    id: 'tilemap',
    stage: 'test',
    when: 'browserTilemapWorker',
    run: 'pnpm test:browser:tilemap',
    ciRun: `pnpm test:browser:tilemap ${junit('tilemap')}`,
    browser: 'chromium',
    local: 'browser',
    junit: true,
  },
  {
    id: 'bench',
    stage: 'test',
    when: 'benchStructural',
    run: 'pnpm gate:bench:structural',
    browser: 'chromium',
    local: 'browser',
    timeoutMinutes: 30,
  },

  {
    id: 'package',
    stage: 'verify',
    when: 'packageVerify',
    run:
      'pnpm size && pnpm size:summary && pnpm verify:exports && pnpm verify:declaration-imports && pnpm verify:lockstep && pnpm verify:release-matrix ' +
      '&& pnpm pack --dry-run && pnpm --filter "@codexo/exojs-build" --filter "@codexo/exojs-particles" --filter "@codexo/exojs-tilemap" ' +
      '--filter "@codexo/exojs-tiled" --filter "@codexo/exojs-physics" --filter "@codexo/exojs-tilemap-physics" --filter "@codexo/exojs-lighting" --filter "@codexo/exojs-pathfinding" --filter "@codexo/exojs-audio-fx" ' +
      '--filter "@codexo/exojs-aseprite" --filter "@codexo/exojs-ldtk" --filter "@codexo/exojs-react" pack --dry-run && pnpm verify:publint',
    dist: true,
  },
  {
    id: 'release',
    stage: 'verify',
    when: 'releaseDryRun',
    run: 'pnpm release:prepare --build --skip-zip',
    pullRequestOnly: true,
  },
  {
    id: 'create-exo-app',
    stage: 'verify',
    when: 'createExoAppVerify',
    run: 'pnpm verify:create-exo-app',
  },
];

/** A `test`/`verify` matrix entry as the workflow consumes it. */
export interface MatrixEntry {
  id: string;
  run: string;
  browser: string;
  apt: string;
  naga: boolean;
  dist: boolean;
  junit: boolean;
  coverage: boolean;
  timeoutMinutes: number;
}

export interface CiPlan {
  areas: LaneAreas;
  gates: MatrixEntry[];
  test: MatrixEntry[];
  verify: MatrixEntry[];
  /** Run the build job (dist artifact). */
  build: boolean;
  /** Run the site job (site artifact). */
  site: boolean;
  /** Smoke the example catalog against the site artifact. */
  smoke: boolean;
  /** Smoke one example per category rather than the whole catalog. */
  smokeSample: boolean;
  /** Evaluate the skip budget over the test lanes' JUnit reports. */
  skipBudget: boolean;
  /** Collect and upload coverage. */
  coverage: boolean;
}

export interface PlanInput {
  eventName: string;
  /** Files a pull request changed; ignored on every other event. */
  changedFiles: readonly string[];
  /** Branch the event ran on; coverage is collected on the long-lived ones. */
  refName: string;
}

const COVERAGE_BRANCHES = new Set(['main', 'next']);

const ALL_AREAS: LaneAreas = {
  engine: true,
  site: true,
  audioFx: true,
  tilemapWorker: true,
  exampleCatalog: true,
  benchStructural: true,
  release: true,
  guides: true,
  createExoApp: true,
};

const toEntry = (lane: Lane, coverage: boolean): MatrixEntry => ({
  id: lane.id,
  run: (coverage && lane.coverageRun) || lane.ciRun || lane.run,
  browser: lane.browser ?? '',
  apt: (lane.apt ?? []).join(' '),
  naga: lane.naga ?? false,
  dist: lane.dist ?? false,
  junit: lane.junit ?? false,
  coverage: coverage && lane.coverageRun !== undefined,
  timeoutMinutes: lane.timeoutMinutes ?? 20,
});

export const selectLanes = (effective: EffectiveLanes, isPullRequest: boolean): Lane[] =>
  LANES.filter(lane => lane.when === 'always' || effective[lane.when]).filter(lane => !lane.pullRequestOnly || isPullRequest);

/**
 * Everything `ci.yml` needs to know, from the event alone. A push, a tag or a
 * dispatch validates every area; only a pull request narrows to what it
 * changed.
 */
export const planCi = ({ eventName, changedFiles, refName }: PlanInput): CiPlan => {
  const isPullRequest = eventName === 'pull_request';
  const areas = isPullRequest ? selectAreas(changedFiles) : ALL_AREAS;
  const effective = effectiveLanes(areas);
  const coverage = eventName === 'push' && COVERAGE_BRANCHES.has(refName);
  const lanes = selectLanes(effective, isPullRequest);
  const stage = (name: Stage): MatrixEntry[] => lanes.filter(lane => lane.stage === name).map(lane => toEntry(lane, coverage));
  // The smoke drives the site job's artifact, so a catalog change builds the
  // site even when nothing under site/ changed.
  const site = areas.site || areas.exampleCatalog;

  return {
    areas,
    gates: stage('gates'),
    test: stage('test'),
    verify: stage('verify'),
    build: areas.engine || site,
    site,
    smoke: areas.exampleCatalog,
    smokeSample: isPullRequest,
    skipBudget: effective.unit,
    coverage,
  };
};

const parseChangedFiles = (raw: string | undefined): string[] => {
  const text = (raw ?? '').trim();
  if (text === '') return [];
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Not JSON after all - fall through to the newline form.
    }
  }
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
};

/**
 * CLI entry for the `plan` job: reads the event from the environment and
 * prints one `key=value` line per plan field for `$GITHUB_OUTPUT`. Matrices
 * are JSON; every other value is a plain `true`/`false`.
 */
const main = (): void => {
  const plan = planCi({
    eventName: process.env['EVENT_NAME'] ?? '',
    changedFiles: parseChangedFiles(process.env['CHANGED_FILES']),
    refName: process.env['REF_NAME'] ?? '',
  });

  const { areas, gates, test, verify, ...flags } = plan;
  process.stderr.write(`plan: ${JSON.stringify({ areas, lanes: [...gates, ...test, ...verify].map(entry => entry.id), ...flags })}\n`);

  const lines = [
    `gates=${JSON.stringify(gates)}`,
    `test=${JSON.stringify(test)}`,
    `verify=${JSON.stringify(verify)}`,
    `hasTest=${test.length > 0}`,
    `hasVerify=${verify.length > 0}`,
    ...Object.entries(flags).map(([key, value]) => `${key}=${value}`),
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
