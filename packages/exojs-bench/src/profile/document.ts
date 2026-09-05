import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AggregatedPhysics, AggregatedRendering } from '../comparison/aggregate';
import type { PhysicsProvenance } from '../physics/driver';
import type { Provenance } from '../rendering/driver';
import type { LibraryProvenance } from '../shared/provenance';
import type { BenchProfileDocument, PhysicsStamp, ProfileLibrary, RenderingStamp } from './schema';
import { BENCH_PROFILE_SCHEMA_VERSION } from './schema';
import { computeProfileSignature } from './signature';
import { deriveProfileParts, normalizeOsName } from './slug';

/**
 * Assembly of the published machine-profile document from a pooled comparison.
 *
 * Everything here is a projection of data the runs already recorded: the pooled
 * comparison model is passed through untouched, and each run's provenance is
 * copied field by field so a new field in a run artifact reaches the published
 * contract only when it is added here deliberately. The only computed values
 * are the profile parts, the agreed engine version, the run count and the
 * signature.
 */

/** Version recorded when an arm's manifest could not be resolved during the run. */
const NOT_INSTALLED = 'not-installed';

/** The domains a profile is being written from. At least one must be present. */
export interface ProfileSources {
  readonly rendering?: AggregatedRendering;
  readonly physics?: AggregatedPhysics;
}

/** Keep the arm identity, drop the machine-local resolution path. */
const toProfileLibrary = (library: LibraryProvenance): ProfileLibrary => ({ name: library.name, version: library.version });

const toRenderingStamp = (provenance: Provenance): RenderingStamp => ({
  backend: provenance.backend,
  adapter: provenance.adapter,
  browser: provenance.browser,
  browserVersion: provenance.browserVersion,
  os: provenance.os,
  prerelease: { ...provenance.prerelease },
  flags: [...provenance.flags],
  headless: provenance.headless,
  software: provenance.software,
  ...(provenance.slotTier !== undefined && { slotTier: provenance.slotTier }),
  engineVersion: provenance.engineVersion,
  timestamp: provenance.timestamp,
});

const toPhysicsStamp = (provenance: PhysicsProvenance): PhysicsStamp => ({
  host: {
    node: provenance.host.node,
    cpu: provenance.host.cpu,
    cpuCount: provenance.host.cpuCount,
    os: provenance.host.os,
    arch: provenance.host.arch,
  },
  fixedDelta: provenance.fixedDelta,
  caveats: [...provenance.caveats],
  engineVersion: provenance.engineVersion,
  timestamp: provenance.timestamp,
});

/**
 * The one engine version the whole document speaks for.
 *
 * Core and the official extensions are released in lockstep, so a rendering
 * stamp and a physics stamp taken on the same tree agree. A disagreement means
 * the two domains were measured against different trees, and publishing them
 * side by side as one profile would attribute one domain's numbers to the other
 * domain's version.
 */
const agreedEngineVersion = (stamps: ReadonlyArray<{ readonly engineVersion: string }>): string => {
  const versions = [...new Set(stamps.map(stamp => stamp.engineVersion))];

  if (versions.length !== 1 || versions[0] === undefined || versions[0].length === 0) {
    throw new Error(`Cannot write a profile from runs at different engine versions (${versions.join(', ')}). Re-measure both domains on one tree.`);
  }

  return versions[0];
};

/**
 * The one run count the whole document speaks for.
 *
 * A document is one reference measurement, and its `runs` field is the reader's
 * only handle on how much evidence stands behind every number in it. Domains
 * pooled from a different number of runs would make that field true of one half
 * of the file and false of the other.
 */
const agreedRunCount = (counts: readonly number[]): number => {
  const distinct = [...new Set(counts)];

  if (distinct.length !== 1 || distinct[0] === undefined) {
    throw new Error(
      `Cannot write a profile whose domains pool a different number of runs (${counts.map(String).join(', ')}). Pass the same number of runs per domain.`,
    );
  }

  return distinct[0];
};

/**
 * The two domains have to describe one machine.
 *
 * Each domain's own pooling already rejects runs from different machines, but
 * nothing before this point compares the domains against each other - and the
 * slug is assembled from both, taking its GPU from the rendering stamps and,
 * historically, its operating system from the physics host. A rendering
 * measurement from one machine written alongside a physics measurement from
 * another would publish a file naming a machine that does not exist.
 */
const requireOneMachine = (renderingStamps: readonly RenderingStamp[], physicsStamp: PhysicsStamp | undefined): void => {
  const rendering = renderingStamps.map(stamp => normalizeOsName(stamp.os)).find(name => name.length > 0);
  const physics = physicsStamp === undefined ? undefined : normalizeOsName(physicsStamp.host.os);

  if (rendering !== undefined && physics !== undefined && rendering !== physics) {
    throw new Error(
      `Cannot write one profile from a rendering measurement on ${rendering} and a physics measurement on ${physics}. A profile describes one machine; measure both domains on the same one.`,
    );
  }
};

/**
 * Build the document for one machine profile.
 *
 * Throws when no domain is present, when the domains disagree on the engine
 * version or on how many runs they pool, when an arm is missing its version, or
 * when the provenance does not name the machine well enough to derive a slug -
 * each of which would otherwise produce a published file that cannot be trusted
 * or cannot be found again.
 */
export const buildProfileDocument = (sources: ProfileSources): BenchProfileDocument => {
  if (sources.rendering === undefined && sources.physics === undefined) {
    throw new Error('Cannot write a profile without at least one measured domain.');
  }

  const renderingRuns = sources.rendering?.runs.map(run => ({ provenance: run.map(toRenderingStamp) })) ?? [];
  const physicsRuns = sources.physics?.runs.map(toPhysicsStamp) ?? [];
  const renderingStamps = renderingRuns.flatMap(run => run.provenance);
  const physicsStamp = physicsRuns[0];
  const stamps = [...renderingStamps, ...physicsRuns];
  const libraries = [...(sources.rendering?.libraries ?? []), ...(sources.physics?.libraries ?? [])];
  const missing = libraries.filter(library => library.version.length === 0 || library.version === NOT_INSTALLED);

  if (missing.length > 0) {
    throw new Error(
      `Cannot write a profile from a run with unresolved arms (${missing.map(library => library.name).join(', ')}). Run bench:setup and re-measure, so every published cell has a version behind it.`,
    );
  }

  requireOneMachine(renderingStamps, physicsStamp);

  const parts = deriveProfileParts({
    ...(renderingStamps.length > 0 && { rendering: renderingStamps }),
    ...(physicsStamp !== undefined && { physics: physicsStamp }),
  });
  const timestamps = stamps.map(stamp => stamp.timestamp).sort();
  const runs = agreedRunCount([
    ...(sources.rendering === undefined ? [] : [renderingRuns.length]),
    ...(sources.physics === undefined ? [] : [physicsRuns.length]),
  ]);
  const unsigned = {
    schemaVersion: BENCH_PROFILE_SCHEMA_VERSION,
    profile: { ...parts, engineVersion: agreedEngineVersion(stamps), measuredAt: timestamps.at(-1)!, runs },
    ...(sources.rendering !== undefined && {
      rendering: {
        runs: renderingRuns,
        libraries: sources.rendering.libraries.map(toProfileLibrary),
        backends: sources.rendering.backends,
      },
    }),
    ...(sources.physics !== undefined && {
      physics: {
        runs: physicsRuns,
        libraries: sources.physics.libraries.map(toProfileLibrary),
        section: sources.physics.section,
      },
    }),
  };

  return { ...unsigned, signature: { algorithm: 'sha256', value: computeProfileSignature(unsigned) } };
};

/** Write a document into `directory` as `<slug>.json`, overwriting the profile's previous measurement. Returns the path written. */
export const writeProfileDocument = (document: BenchProfileDocument, directory: string): string => {
  const path = resolve(directory, `${document.profile.slug}.json`);

  mkdirSync(directory, { recursive: true });
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);

  return path;
};
