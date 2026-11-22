// Real Oxlint CLI parity smoke for the two opt-in ExoJS plugin entrypoints.
// A neutral fixture and an existing red rule fixture for each rule run under
// BOTH engines. This is an integration probe, not a replacement for full
// RuleTester matrix, named-project or browser/Windows validation.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { build } from 'esbuild';
import { Linter } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exoEnginePlugin, exoPlugin } from '../src/index.ts';

interface OxlintDiagnostic {
  code: string;
  message: string;
  labels: Array<{ span: { line: number; column: number } }>;
}
interface OxlintOutput {
  diagnostics: OxlintDiagnostic[];
}
interface ParityDiagnostic {
  ruleId: string;
  message: string;
  line: number;
  column: number;
}
interface Fixture {
  id: string;
  bad: string;
  options?: Record<string, unknown>;
}

const fixtures: Fixture[] = [
  { id: 'exojs/migration-chain', bad: 'new DocumentHistory({ version: 3 });' },
  { id: 'exojs/migration-purity', bad: 'class AtlasV1ToV2 { migrate(doc) { return { ...doc, seed: Math.random() }; } }' },
  { id: 'exojs/migration-step', bad: 'class AtlasV1ToV3 { from = 1; to = 3; migrate(doc) { return doc; } }' },
  { id: 'exojs/no-async-render-hook', bad: 'class Pass extends RenderPass { async execute(context) {} }' },
  { id: 'exojs/no-async-update', bad: 'class Scene { async update(delta) {} }' },
  {
    id: 'exojs/no-deprecated-api',
    bad: "import { Old } from '@codexo/exojs';",
    options: { source: '@codexo/exojs', deprecated: { Old: 'Use New instead.' } },
  },
  {
    id: 'exojs/no-self-enabled-check',
    bad: 'class Pass extends RenderPass { execute(context) { if (!this.enabled) return; } }',
  },
  { id: 'exojs/no-unregistered-system', bad: 'const physics = new PhysicsSystem();' },
  {
    id: 'exojs/require-super-destroy',
    bad: 'class Node extends Container { destroy() { this.texture.destroy(); } }',
  },
  {
    id: 'exojs-engine/no-allocation-in-hot-hook',
    bad: 'class Effect { getOutputBounds(input, output) { return { x: 1 }; } }',
    options: { methods: ['getOutputBounds'] },
  },
];
const OK = 'export const ok = 1;\n';
const packageDir = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const oxlintManifestPath = require.resolve('oxlint/package.json');
const oxlintManifest = JSON.parse(readFileSync(oxlintManifestPath, 'utf8')) as {
  bin: string | { oxlint?: string };
};
const binRelative = typeof oxlintManifest.bin === 'string' ? oxlintManifest.bin : oxlintManifest.bin.oxlint;
if (!binRelative) throw new Error('Installed oxlint package does not define its CLI binary.');
const oxlintBin = resolve(dirname(oxlintManifestPath), binRelative);

let directory: string;

const eslintDiagnostics = (fixture: Fixture, source: string): ParityDiagnostic[] => {
  const configured: Linter.RuleEntry = fixture.options ? ['error', fixture.options] : 'error';
  const linted = new Linter().verify(
    source,
    [
      {
        files: ['**/*.js'],
        plugins: { exojs: exoPlugin, 'exojs-engine': exoEnginePlugin },
        rules: { [fixture.id]: configured },
      },
    ],
    'fixture.js',
  );

  return linted.map(message => ({
    ruleId: message.ruleId ?? '',
    message: message.message,
    line: message.line,
    column: message.column,
  }));
};

const oxlintDiagnostics = (fixture: Fixture, source: string): ParityDiagnostic[] => {
  const input = join(directory, 'fixture.js');
  const config = join(directory, '.oxlintrc.json');
  writeFileSync(input, source);
  writeFileSync(
    config,
    JSON.stringify({
      categories: {
        correctness: 'off',
        suspicious: 'off',
        pedantic: 'off',
        perf: 'off',
        style: 'off',
        restriction: 'off',
        nursery: 'off',
      },
      jsPlugins: ['./oxlint.mjs', './oxlint-engine.mjs'],
      rules: { [fixture.id]: fixture.options ? ['error', fixture.options] : 'error' },
    }),
  );

  const result = spawnSync(process.execPath, [oxlintBin, '--format=json', '--config', config, input], {
    cwd: directory,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  expect([0, 1]).toContain(result.status);
  let output: OxlintOutput;
  try {
    output = JSON.parse(result.stdout) as OxlintOutput;
  } catch {
    throw new Error(`Oxlint failed to emit JSON (status ${result.status}): ${result.stdout}\n${result.stderr}`);
  }

  return output.diagnostics.map(diagnostic => ({
    ruleId: diagnostic.code.replace(/^([^()]+)\(([^()]+)\)$/, '$1/$2'),
    message: diagnostic.message,
    line: diagnostic.labels[0]?.span.line ?? 0,
    column: diagnostic.labels[0]?.span.column ?? 0,
  }));
};

describe('ExoJS custom rules through the real Oxlint CLI', () => {
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'exojs-oxlint-'));
    // Bundle TS sources into stand-alone plugins so this test does NOT require
    // a preexisting package dist or mutate any shared build output.
    await build({
      entryPoints: [resolve(packageDir, 'src/oxlint.ts'), resolve(packageDir, 'src/oxlint-engine.ts')],
      outdir: directory,
      entryNames: '[name]',
      outExtension: { '.js': '.mjs' },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      logLevel: 'silent',
    });
  });

  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  for (const fixture of fixtures) {
    it(`${fixture.id}: preserves a red diagnostic and a clean control`, () => {
      const baselineRed = eslintDiagnostics(fixture, fixture.bad);
      expect(baselineRed.length).toBeGreaterThan(0);
      expect(oxlintDiagnostics(fixture, fixture.bad)).toEqual(baselineRed);

      expect(eslintDiagnostics(fixture, OK)).toEqual([]);
      expect(oxlintDiagnostics(fixture, OK)).toEqual([]);
    });
  }
});
