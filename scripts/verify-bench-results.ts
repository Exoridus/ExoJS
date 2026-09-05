/**
 * Validates every published benchmark profile under
 * `packages/exojs-bench/results/`.
 *
 * The published comparison pages are generated from these files, so a number in
 * one of them is a public claim about how ExoJS performs against other
 * libraries. The only thing standing between that claim and a plausible-looking
 * number somebody typed is this gate: a profile has to carry a schema version
 * this repository understands, enough separate runs behind every number to
 * support a ratio, a provenance block per run complete enough that a reader
 * could reproduce it, arms that were actually installed, one engine version
 * across every stamp, and a signature that recomputes from the file's own
 * contents.
 *
 * The signature is what makes a hand-edited value fail. It is not an
 * authenticity proof - anyone holding the repository can recompute it - but it
 * cannot be produced by editing a file, only by running the harness, which is
 * the property the gate needs: every published number reaches the file through
 * a measurement.
 *
 * An empty directory passes. A profile is measured on one machine and committed
 * deliberately; having none is a state, not a defect.
 *
 * Run with no arguments to check the committed directory, or pass a directory
 * to check somewhere else.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

import { isProfileSlug, SUPPORTED_BENCH_PROFILE_SCHEMA_VERSIONS } from '../packages/exojs-bench/src/profile/schema.ts';
import { computeProfileSignature, PROFILE_SIGNATURE_ALGORITHM } from '../packages/exojs-bench/src/profile/signature.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');

/** Where the committed profiles live. */
const RESULTS_DIR = join(REPO_ROOT, 'packages', 'exojs-bench', 'results');

/** Version an arm carries when its manifest could not be resolved during the run. */
const NOT_INSTALLED = 'not-installed';

/** Packages released in lockstep with the engine, whose arm version must equal the profile's. */
const LOCKSTEP_ARMS = new Set(['@codexo/exojs', '@codexo/exojs-physics']);

/**
 * Separate harness runs a published profile must pool.
 *
 * Two runs of identical code on one idle machine move a cell's median far
 * enough to reverse which arm it favours, so a ratio drawn from one run is not
 * a measurement of the libraries. Three is the smallest number that yields a
 * median rather than a midpoint and lets a cell's verdict be confirmed against
 * every run independently.
 */
const MINIMUM_RUNS = 3;

/** A record with unknown field types, the shape every check reads its subject as. */
type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

/** True for a value that is present and carries content - the bar every provenance field has to clear. */
const isFilled = (value: unknown): boolean => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;

  return typeof value === 'boolean' || isRecord(value);
};

/** Report every named field of `subject` that is missing or empty. */
const missingFields = (subject: unknown, fields: readonly string[], where: string): string[] => {
  if (!isRecord(subject)) {
    return [`${where} is missing`];
  }

  return fields.filter(field => !isFilled(subject[field])).map(field => `${where}.${field} is missing or empty`);
};

const RENDERING_STAMP_FIELDS = ['backend', 'adapter', 'flags', 'headless', 'software', 'engineVersion', 'timestamp'] as const;
const PHYSICS_STAMP_FIELDS = ['host', 'fixedDelta', 'caveats', 'engineVersion', 'timestamp'] as const;
const HOST_FIELDS = ['node', 'cpu', 'cpuCount', 'os', 'arch'] as const;
const PROFILE_FIELDS = ['slug', 'gpu', 'os', 'browser', 'engineVersion', 'measuredAt', 'runs'] as const;

/** Collect the arm entries of one domain, reporting any that has no usable version behind it. */
const checkLibraries = (domain: Fields, where: string, problems: string[]): Fields[] => {
  const libraries = domain['libraries'];

  if (!Array.isArray(libraries) || libraries.length === 0) {
    problems.push(`${where}.libraries is missing or empty`);

    return [];
  }

  const entries = libraries.filter(isRecord);

  for (const [index, library] of entries.entries()) {
    problems.push(...missingFields(library, ['name', 'version'], `${where}.libraries[${String(index)}]`));

    if (library['version'] === NOT_INSTALLED) {
      problems.push(`${where}.libraries[${String(index)}] (${String(library['name'])}) was not installed when the run was measured`);
    }
  }

  return entries;
};

/** Every problem one profile file has, in the order they were found. An empty array means it passes. */
const checkProfile = (path: string): string[] => {
  const problems: string[] = [];
  let document: unknown;

  try {
    document = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error: unknown) {
    return [`is not valid JSON (${error instanceof Error ? error.message : String(error)})`];
  }

  if (!isRecord(document)) {
    return ['is not a JSON object'];
  }

  const version = document['schemaVersion'];

  if (typeof version !== 'number' || !SUPPORTED_BENCH_PROFILE_SCHEMA_VERSIONS.includes(version)) {
    // Every check below reads fields whose meaning is defined by the schema
    // version, so an unknown one stops here rather than reporting the fields it
    // cannot interpret as missing.
    return [
      `has schema version ${JSON.stringify(version)}, which this repository does not understand (supported: ${SUPPORTED_BENCH_PROFILE_SCHEMA_VERSIONS.join(', ')})`,
    ];
  }

  const profile = document['profile'];

  problems.push(...missingFields(profile, [...PROFILE_FIELDS], 'profile'));

  const slug = isRecord(profile) ? profile['slug'] : undefined;

  if (typeof slug === 'string' && !isProfileSlug(slug)) {
    problems.push(`profile.slug '${slug}' is not a lowercase hyphenated slug`);
  }

  if (typeof slug === 'string' && slug !== basename(path, extname(path))) {
    problems.push(`profile.slug '${slug}' does not match the file name, so a re-measurement of that machine would not overwrite this file`);
  }

  const declaredRuns = isRecord(profile) ? profile['runs'] : undefined;

  if (typeof declaredRuns === 'number' && (!Number.isInteger(declaredRuns) || declaredRuns < MINIMUM_RUNS)) {
    problems.push(
      `pools ${String(declaredRuns)} run(s), but a published profile needs at least ${String(MINIMUM_RUNS)}: a ratio drawn from fewer cannot be told apart from the harness's own run-to-run noise`,
    );
  }

  /** Every domain declares the same run count as the profile, or its numbers speak for a different amount of evidence. */
  const checkRunCount = (runs: unknown, where: string): unknown[] => {
    if (!Array.isArray(runs) || runs.length === 0) {
      problems.push(`${where} is missing or empty`);

      return [];
    }

    if (typeof declaredRuns === 'number' && runs.length !== declaredRuns) {
      problems.push(`${where} holds ${String(runs.length)} run(s) but profile.runs declares ${String(declaredRuns)}`);
    }

    return runs;
  };

  const rendering = document['rendering'];
  const physics = document['physics'];

  if (rendering === undefined && physics === undefined) {
    problems.push('carries neither a rendering nor a physics domain');
  }

  const engineVersions = new Set<string>();
  const armVersions: Fields[] = [];

  if (rendering !== undefined) {
    if (!isRecord(rendering)) {
      problems.push('rendering is not an object');
    } else {
      for (const [run, entry] of checkRunCount(rendering['runs'], 'rendering.runs').entries()) {
        const stamps = isRecord(entry) ? entry['provenance'] : undefined;

        if (!Array.isArray(stamps) || stamps.length === 0) {
          problems.push(`rendering.runs[${String(run)}].provenance is missing or empty`);

          continue;
        }

        for (const [index, stamp] of stamps.entries()) {
          problems.push(...missingFields(stamp, [...RENDERING_STAMP_FIELDS], `rendering.runs[${String(run)}].provenance[${String(index)}]`));

          if (isRecord(stamp) && typeof stamp['engineVersion'] === 'string') {
            engineVersions.add(stamp['engineVersion']);
          }
        }
      }

      if (!Array.isArray(rendering['backends']) || rendering['backends'].length === 0) {
        problems.push('rendering.backends is missing or empty');
      }

      armVersions.push(...checkLibraries(rendering, 'rendering', problems));
    }
  }

  if (physics !== undefined) {
    if (!isRecord(physics)) {
      problems.push('physics is not an object');
    } else {
      for (const [run, stamp] of checkRunCount(physics['runs'], 'physics.runs').entries()) {
        problems.push(...missingFields(stamp, [...PHYSICS_STAMP_FIELDS], `physics.runs[${String(run)}]`));

        if (isRecord(stamp)) {
          problems.push(...missingFields(stamp['host'], [...HOST_FIELDS], `physics.runs[${String(run)}].host`));

          if (typeof stamp['engineVersion'] === 'string') {
            engineVersions.add(stamp['engineVersion']);
          }
        }
      }

      if (!isRecord(physics['section'])) {
        problems.push('physics.section is missing');
      }

      armVersions.push(...checkLibraries(physics, 'physics', problems));
    }
  }

  const declared = isRecord(profile) ? profile['engineVersion'] : undefined;

  if (engineVersions.size > 1) {
    problems.push(`stamps disagree on the engine version (${[...engineVersions].sort().join(', ')})`);
  } else if (typeof declared === 'string' && engineVersions.size === 1 && !engineVersions.has(declared)) {
    problems.push(`profile.engineVersion '${declared}' is not the version the stamps carry (${[...engineVersions][0]!})`);
  }

  for (const arm of armVersions) {
    const name = arm['name'];

    if (typeof name === 'string' && LOCKSTEP_ARMS.has(name) && typeof declared === 'string' && arm['version'] !== declared) {
      problems.push(`arm '${name}' is at ${String(arm['version'])} but the profile declares engine version ${declared}`);
    }
  }

  const signature = document['signature'];

  if (!isRecord(signature) || signature['algorithm'] !== PROFILE_SIGNATURE_ALGORITHM || typeof signature['value'] !== 'string') {
    problems.push('has no harness signature');
  } else if (signature['value'] !== computeProfileSignature(document)) {
    problems.push('does not match its harness signature: its contents were changed after the run that wrote it, or were never written by bench:compare');
  }

  return problems;
};

const directory = resolve(process.argv[2] ?? RESULTS_DIR);
const entries =
  statSync(directory, { throwIfNoEntry: false })?.isDirectory() === true
    ? readdirSync(directory)
        .filter(name => name.endsWith('.json'))
        .sort()
    : [];
let failed = 0;

for (const name of entries) {
  const problems = checkProfile(join(directory, name));

  if (problems.length === 0) {
    console.log(`verify-bench-results: ${name} OK`);

    continue;
  }

  failed++;

  for (const problem of problems) {
    console.error(`verify-bench-results: ${name} ${problem}`);
  }
}

if (failed > 0) {
  console.error(`verify-bench-results: ${String(failed)} of ${String(entries.length)} profile(s) rejected.`);
  process.exitCode = 1;
} else {
  console.log(`verify-bench-results: ${String(entries.length)} profile(s) checked, all valid.`);
}
