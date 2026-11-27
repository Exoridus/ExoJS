/**
 * The registry action list of a coordinated release, as a dry run.
 *
 * `buildRegistryPlan` turns the versions a release publishes into the explicit,
 * ordered list of registry actions the release would take: publish Core,
 * confirm it is available and consumable, publish the lockstep packages and the
 * legacy shims the release sets, confirm those, and finally deprecate exactly
 * the shim versions this release published. `writeRegistryPlan` records the
 * list for review.
 *
 * Nothing here talks to a registry or starts a process: the commands in the
 * plan are text for a person or a later, separately authorised step. There is
 * no unpublish action, a deprecation always names one exact version, and no
 * action may target a version before the legacy shim line.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { LEGACY_SHIM_LINE } from './lockstep-packages.ts';

/** The deprecation message attached to every published shim version. */
export const deprecationMessage = (subpath: string): string =>
  `Since ExoJS v0.20, import from @codexo/exojs/${subpath}. This package is a compatibility shim for the 0.20 line; no independent feature development.`;

export interface PlannedPackage {
  readonly name: string;
  readonly version: string;
}

export interface PlannedShim extends PlannedPackage {
  readonly subpath: string;
  /** The release line the shim serves. */
  readonly line: string;
  readonly publish: boolean;
  /** Why the shim is published or kept. */
  readonly reason: string;
  /** Hash of the forwarders the version publishes. */
  readonly fingerprint: string;
}

export interface RegistryPlanInput {
  readonly releaseVersion: string;
  readonly distTag: string;
  readonly core: PlannedPackage;
  /** The lockstep packages after Core, in publish order. */
  readonly lockstep: readonly PlannedPackage[];
  readonly shims: readonly PlannedShim[];
}

export type RegistryAction =
  | { readonly kind: 'publish'; readonly name: string; readonly version: string; readonly command: string }
  | { readonly kind: 'verify'; readonly targets: readonly string[]; readonly commands: readonly string[] }
  | { readonly kind: 'deprecate'; readonly name: string; readonly version: string; readonly message: string; readonly command: string };

export interface RegistryPlan {
  readonly releaseVersion: string;
  readonly distTag: string;
  readonly actions: readonly RegistryAction[];
  /** Every shim with the reason it is or is not part of this release. */
  readonly shims: readonly PlannedShim[];
}

/** A plan that would touch the registry in a way a release must never do. */
export class RegistryPlanError extends Error {
  public override readonly name = 'RegistryPlanError';
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const lineOf = (version: string): string => version.split('.').slice(0, 2).join('.');

const compareLines = (a: string, b: string): number => {
  const [aMajor = 0, aMinor = 0] = a.split('.').map(Number);
  const [bMajor = 0, bMinor = 0] = b.split('.').map(Number);

  return aMajor - bMajor || aMinor - bMinor;
};

const assertExact = (label: string, version: string): void => {
  if (!EXACT_VERSION.test(version)) {
    throw new RegistryPlanError(`${label}: "${version}" is not one exact version; ranges, wildcards and tags are refused`);
  }
};

const shellQuote = (text: string): string => `"${text.replaceAll('"', '\\"')}"`;

const publishAction = (pkg: PlannedPackage, distTag: string): RegistryAction => ({
  kind: 'publish',
  name: pkg.name,
  version: pkg.version,
  command: `npm publish <${pkg.name}@${pkg.version} tarball> --tag ${distTag} --access public --provenance`,
});

const verifyAction = (packages: readonly PlannedPackage[]): RegistryAction => ({
  kind: 'verify',
  targets: packages.map(pkg => `${pkg.name}@${pkg.version}`),
  commands: [
    ...packages.map(pkg => `npm view ${pkg.name}@${pkg.version} version`),
    `install ${packages.map(pkg => `${pkg.name}@${pkg.version}`).join(' ')} from the registry into a fresh project and run the external consumer checks against it`,
  ],
});

/**
 * Builds the ordered registry action list. Throws {@link RegistryPlanError}
 * for a version that is not one exact version, for a release before the shim
 * line, for a shim published on a line it does not serve or under another
 * version than the release, and for a package that appears twice.
 */
export const buildRegistryPlan = (input: RegistryPlanInput): RegistryPlan => {
  assertExact('release', input.releaseVersion);

  if (compareLines(lineOf(input.releaseVersion), LEGACY_SHIM_LINE) < 0) {
    throw new RegistryPlanError(
      `release ${input.releaseVersion} is before the ${LEGACY_SHIM_LINE} line; earlier releases are historical and get no registry action`,
    );
  }

  const seen = new Set<string>();

  for (const pkg of [input.core, ...input.lockstep, ...input.shims]) {
    assertExact(pkg.name, pkg.version);

    if (seen.has(pkg.name)) {
      throw new RegistryPlanError(`${pkg.name} appears twice in the plan`);
    }

    seen.add(pkg.name);
  }

  for (const pkg of [input.core, ...input.lockstep]) {
    if (pkg.version !== input.releaseVersion) {
      throw new RegistryPlanError(`${pkg.name}@${pkg.version} is not on the release version ${input.releaseVersion}`);
    }
  }

  const published = input.shims.filter(shim => shim.publish);

  for (const shim of published) {
    if (lineOf(shim.version) !== shim.line) {
      throw new RegistryPlanError(`${shim.name}@${shim.version} is not on the ${shim.line} line the shim serves`);
    }

    if (shim.version !== input.releaseVersion) {
      throw new RegistryPlanError(`${shim.name}@${shim.version} would be published by the ${input.releaseVersion} release`);
    }
  }

  const second = [...input.lockstep, ...published];
  const actions: RegistryAction[] = [
    publishAction(input.core, input.distTag),
    verifyAction([input.core]),
    ...second.map(pkg => publishAction(pkg, input.distTag)),
    ...(second.length > 0 ? [verifyAction(second)] : []),
    ...published.map((shim): RegistryAction => ({
      kind: 'deprecate',
      name: shim.name,
      version: shim.version,
      message: deprecationMessage(shim.subpath),
      command: `npm deprecate ${shim.name}@${shim.version} ${shellQuote(deprecationMessage(shim.subpath))}`,
    })),
  ];

  return { releaseVersion: input.releaseVersion, distTag: input.distTag, actions, shims: input.shims };
};

/** Human-readable rendering of a plan, one numbered action per block. */
export const renderRegistryPlan = (plan: RegistryPlan): string => {
  const lines = [
    `Registry plan for v${plan.releaseVersion} (DRY RUN - nothing here has been or will be executed)`,
    `dist-tag: ${plan.distTag}`,
    '',
  ];

  plan.actions.forEach((action, index) => {
    const step = `${index + 1}.`;

    if (action.kind === 'verify') {
      lines.push(`${step} verify ${action.targets.join(', ')}`, ...action.commands.map(command => `     ${command}`));
    } else {
      lines.push(`${step} ${action.kind} ${action.name}@${action.version}`, `     ${action.command}`);
    }
  });

  lines.push('', 'Legacy shims:');

  for (const shim of plan.shims) {
    lines.push(
      `  ${shim.name}@${shim.version} -> @codexo/exojs/${shim.subpath}: ${shim.publish ? 'publish + deprecate' : 'not republished'} (${shim.reason})`,
      `    forwarders sha256 ${shim.fingerprint}`,
    );
  }

  return `${lines.join('\n')}\n`;
};

/** Writes `registry-plan.json` and `registry-plan.txt` into `outDir` and returns their paths. */
export const writeRegistryPlan = (plan: RegistryPlan, outDir: string): { json: string; text: string } => {
  mkdirSync(outDir, { recursive: true });
  const json = join(outDir, 'registry-plan.json');
  const text = join(outDir, 'registry-plan.txt');
  writeFileSync(json, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  writeFileSync(text, renderRegistryPlan(plan), 'utf8');

  return { json, text };
};
