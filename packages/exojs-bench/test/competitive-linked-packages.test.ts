// @vitest-environment node

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { linkedPackageManifest, readLibraryProvenance } from '../src/shared/provenance';

describe('linked competitor manifest resolution', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'exojs-competitors-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test.each([
    ['pixi.js', '8.19.0'],
    ['@pixi/layout', '3.2.1'],
    ['@pixi/tilemap', '5.0.2'],
    ['phaser', '4.2.1'],
  ])('reads %s through the bench:setup junction without require()-compatible exports', (name, version) => {
    const installed = join(workspace, 'competitors', 'node_modules', name);
    const linked = join(workspace, 'node_modules', name);
    mkdirSync(installed, { recursive: true });
    mkdirSync(dirname(linked), { recursive: true });
    // Deliberately import-only, without any require-compatible entry point.
    writeFileSync(
      join(installed, 'package.json'),
      JSON.stringify({ name, version, type: 'module', exports: { '.': { import: './entry.mjs' } } }),
    );
    writeFileSync(join(installed, 'entry.mjs'), 'export const ready = true;\n');
    symlinkSync(installed, linked, 'junction');

    const manifestPath = linkedPackageManifest(name, resolve(workspace, 'node_modules'));

    expect(manifestPath).toBe(resolve(linked, 'package.json'));
    const profile = readLibraryProvenance([name], () => {
      if (manifestPath === null) {
        throw new Error('missing competitor link');
      }

      return manifestPath;
    });

    expect(profile).toEqual([{ name, version, resolvedFrom: manifestPath }]);
    expect(JSON.parse(readFileSync(manifestPath!, 'utf8'))).toMatchObject({ name, version });
  });

  test('unlinked packages remain absent instead of being declared installed', () => {
    expect(linkedPackageManifest('pixi.js', join(workspace, 'node_modules'))).toBeNull();
  });
});
