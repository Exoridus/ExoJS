import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { createRecordingRunner, ok } from '../../scripts/release/command-runner';
import { LEGACY_SHIMS } from '../../scripts/release/lockstep-packages';
import { PUBLISH_ORDER, type ReleaseManifest, sha256File } from '../../scripts/release/manifest';
import { defaultPublishOptions, publishRelease } from '../../scripts/release/publish';
import {
  buildRegistryPlan,
  deprecationMessage,
  type PlannedShim,
  RegistryPlanError,
  type RegistryPlanInput,
  renderRegistryPlan,
  writeRegistryPlan,
} from '../../scripts/release/registry-plan';

const repoRoot = resolve(import.meta.dirname, '..', '..');

const shim = (subpath: string, overrides: Partial<PlannedShim> = {}): PlannedShim => ({
  name: `@codexo/exojs-${subpath}`,
  version: '0.20.0',
  subpath,
  line: '0.20',
  publish: true,
  reason: 'first release on the 0.20 line',
  fingerprint: 'f'.repeat(64),
  ...overrides,
});

const input = (overrides: Partial<RegistryPlanInput> = {}): RegistryPlanInput => ({
  releaseVersion: '0.20.0',
  distTag: 'latest',
  core: { name: '@codexo/exojs', version: '0.20.0' },
  lockstep: [
    { name: '@codexo/exojs-tiled', version: '0.20.0' },
    { name: '@codexo/exojs-ldtk', version: '0.20.0' },
  ],
  shims: [shim('tilemap'), shim('physics')],
  ...overrides,
});

describe('buildRegistryPlan - order', () => {
  it('publishes Core, verifies it, publishes the rest, verifies them, then deprecates the published shims', () => {
    const plan = buildRegistryPlan(input());

    expect(
      plan.actions.map(action =>
        action.kind === 'verify' ? `verify ${action.targets.join(' ')}` : `${action.kind} ${action.name}@${action.version}`,
      ),
    ).toEqual([
      'publish @codexo/exojs@0.20.0',
      'verify @codexo/exojs@0.20.0',
      'publish @codexo/exojs-tiled@0.20.0',
      'publish @codexo/exojs-ldtk@0.20.0',
      'publish @codexo/exojs-tilemap@0.20.0',
      'publish @codexo/exojs-physics@0.20.0',
      'verify @codexo/exojs-tiled@0.20.0 @codexo/exojs-ldtk@0.20.0 @codexo/exojs-tilemap@0.20.0 @codexo/exojs-physics@0.20.0',
      'deprecate @codexo/exojs-tilemap@0.20.0',
      'deprecate @codexo/exojs-physics@0.20.0',
    ]);
  });

  it('deprecates one exact version with the canonical message and never unpublishes', () => {
    const plan = buildRegistryPlan(input());
    const deprecations = plan.actions.filter(action => action.kind === 'deprecate');

    expect(deprecations.map(action => action.command)).toEqual([
      `npm deprecate @codexo/exojs-tilemap@0.20.0 "${deprecationMessage('tilemap')}"`,
      `npm deprecate @codexo/exojs-physics@0.20.0 "${deprecationMessage('physics')}"`,
    ]);
    expect(deprecationMessage('physics')).toBe(
      'Since ExoJS v0.20, import from @codexo/exojs/physics. This package is a compatibility shim for the 0.20 line; no independent feature development.',
    );
    expect(new Set(plan.actions.map(action => action.kind))).toEqual(new Set(['publish', 'verify', 'deprecate']));
    expect(JSON.stringify(plan)).not.toMatch(/unpublish|@\*|@[^"\s]*\.x\b/);
  });

  it('neither republishes nor deprecates a kept shim, and reports why', () => {
    const kept = shim('lighting', { publish: false, reason: 'forwarders unchanged since 0.20.0; not republished' });
    const plan = buildRegistryPlan(
      input({ releaseVersion: '0.20.1', core: { name: '@codexo/exojs', version: '0.20.1' }, lockstep: [], shims: [kept] }),
    );

    expect(plan.actions.map(action => action.kind)).toEqual(['publish', 'verify']);
    expect(plan.shims).toEqual([kept]);
    expect(renderRegistryPlan(plan)).toContain(
      '@codexo/exojs-lighting@0.20.0 -> @codexo/exojs/lighting: not republished (forwarders unchanged since 0.20.0; not republished)',
    );
  });
});

describe('buildRegistryPlan - refusals', () => {
  it.each(['*', '0.20.*', '0.20.x', '^0.20.0', '~0.20.0', '>=0.20.0', 'latest', '0.20', ''])('refuses the shim version "%s"', version => {
    expect(() => buildRegistryPlan(input({ shims: [shim('tilemap', { version })] }))).toThrow(RegistryPlanError);
  });

  it.each(['*', '0.20.x', 'latest'])('refuses the release version "%s"', version => {
    expect(() => buildRegistryPlan(input({ releaseVersion: version }))).toThrow(RegistryPlanError);
  });

  it('refuses a release before the shim line', () => {
    const historical = { releaseVersion: '0.19.2', core: { name: '@codexo/exojs', version: '0.19.2' }, lockstep: [], shims: [] };

    expect(() => buildRegistryPlan(input(historical))).toThrow(/historical/);
  });

  it('refuses to publish or deprecate a historical shim version', () => {
    expect(() => buildRegistryPlan(input({ shims: [shim('tilemap', { version: '0.19.1' })] }))).toThrow(/0\.20 line/);
  });

  it('refuses a shim version other than the release', () => {
    const release = { releaseVersion: '0.20.1', core: { name: '@codexo/exojs', version: '0.20.1' }, lockstep: [] };

    expect(() => buildRegistryPlan(input({ ...release, shims: [shim('tilemap', { version: '0.20.0' })] }))).toThrow(RegistryPlanError);
  });

  it('refuses a lockstep package off the release version and a package listed twice', () => {
    expect(() => buildRegistryPlan(input({ lockstep: [{ name: '@codexo/exojs-tiled', version: '0.20.1' }] }))).toThrow(RegistryPlanError);
    expect(() => buildRegistryPlan(input({ shims: [shim('tilemap'), shim('tilemap')] }))).toThrow(/twice/);
  });
});

describe('writeRegistryPlan', () => {
  it('records the plan as JSON and as the rendered dry-run text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exo-registry-plan-'));

    try {
      const plan = buildRegistryPlan(input());
      const written = writeRegistryPlan(plan, dir);

      expect(JSON.parse(readFileSync(written.json, 'utf8'))).toEqual(JSON.parse(JSON.stringify(plan)));
      expect(readFileSync(written.text, 'utf8')).toBe(renderRegistryPlan(plan));
      expect(renderRegistryPlan(plan)).toMatch(/^Registry plan for v0\.20\.0 \(DRY RUN/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Every module specifier a file imports, following relative imports through the repository. */
const importGraph = (entry: string, seen = new Map<string, string[]>()): Map<string, string[]> => {
  if (seen.has(entry)) {
    return seen;
  }

  const source = ts.createSourceFile(entry, readFileSync(entry, 'utf8'), ts.ScriptTarget.Latest, true);
  const specifiers = source.statements.flatMap(statement =>
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
  seen.set(entry, specifiers);

  for (const specifier of specifiers.filter(value => value.startsWith('.'))) {
    importGraph(resolve(dirname(entry), specifier), seen);
  }

  return seen;
};

describe('the registry plan cannot reach the registry', () => {
  it('imports no process-spawning module, directly or through its own imports', () => {
    const graph = importGraph(resolve(repoRoot, 'scripts/release/registry-plan.ts'));
    const external = [...new Set([...graph.values()].flat().filter(specifier => !specifier.startsWith('.')))].sort();
    const local = [...graph.keys()].map(file => file.slice(repoRoot.length + 1).replaceAll('\\', '/')).sort();

    expect(external).toEqual(['node:fs', 'node:path']);
    expect(local).toEqual(['scripts/release/lockstep-packages.ts', 'scripts/release/registry-plan.ts']);
  });

  it('leaves deprecation out of the publish stage, shims included', () => {
    const staging = mkdtempSync(join(tmpdir(), 'exo-registry-publish-'));

    try {
      const packages = PUBLISH_ORDER.map(name => {
        const file = `${name.replace('@', '').replace('/', '-')}-0.20.0.tgz`;
        writeFileSync(join(staging, file), `tarball-${name}`);

        return { name, version: '0.20.0', file, ...sha256File(join(staging, file)) };
      });
      const manifest: ReleaseManifest = {
        version: '0.20.0',
        revision: 'a'.repeat(40),
        shortRevision: 'aaaaaaa',
        tag: 'v0.20.0',
        generatedAt: new Date(0).toISOString(),
        publishOrder: [...PUBLISH_ORDER],
        packages,
      };

      for (const dryRun of [true, false]) {
        const runner = createRecordingRunner(() => ok());
        const report = publishRelease(manifest, { ...defaultPublishOptions('0.20.0'), dryRun, checkExisting: false }, runner, file =>
          join(staging, file),
        );

        expect(report.ok).toBe(true);
        expect(runner.invocations.map(invocation => invocation.args[0])).toEqual(PUBLISH_ORDER.map(() => 'publish'));
      }
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }

    expect(readFileSync(resolve(repoRoot, 'scripts/release/publish.ts'), 'utf8')).not.toMatch(/deprecate|unpublish/);
  });

  it('plans a deprecation for every legacy shim the 0.20.0 release publishes', () => {
    const plan = buildRegistryPlan(input({ shims: LEGACY_SHIMS.map(entry => shim(entry.subpath, { name: entry.name })) }));

    expect(plan.actions.filter(action => action.kind === 'deprecate').map(action => action.name)).toEqual(
      LEGACY_SHIMS.map(entry => entry.name),
    );
  });
});
