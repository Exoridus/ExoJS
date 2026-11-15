// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { installedPackageManifest, readLibraryProvenance } from '../src/shared/provenance';

describe('installed competitor manifest resolution', () => {
  let modules: string;

  beforeEach(() => {
    modules = mkdtempSync(join(tmpdir(), 'exojs-competitors-'));
  });

  afterEach(() => {
    rmSync(modules, { recursive: true, force: true });
  });

  test('reads an import-only package whose exports map has no require entry', () => {
    const directory = join(modules, '@pixi', 'layout');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ name: '@pixi/layout', version: '3.2.1', type: 'module', exports: { '.': { import: './entry.mjs' } } }),
    );

    const manifest = installedPackageManifest('@pixi/layout', modules);

    expect(manifest).toBe(resolve(directory, 'package.json'));
    expect(readLibraryProvenance(['@pixi/layout'], () => manifest!)).toEqual([
      { name: '@pixi/layout', version: '3.2.1', resolvedFrom: manifest },
    ]);
  });

  test('a missing package stays absent instead of being declared installed', () => {
    expect(installedPackageManifest('pixi.js', modules)).toBeNull();
  });

  test.each(['pixi.js', '@pixi/layout', '@pixi/tilemap', 'phaser'])('the workspace install provides %s', name => {
    expect(readLibraryProvenance([name])[0]!.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
