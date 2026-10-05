/**
 * Package boundary of the colour pipeline: every package under `packages/`
 * carries an explicit outcome, and the outcomes that claim independence from
 * the pipeline are checked against the sources rather than asserted.
 *
 * The behavioural checks live next to the code they exercise (each `evidence`
 * entry names the file and a string that proves it still states the contract);
 * this file keeps the inventory complete and the dependency direction honest.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

const repoRoot = process.cwd();

type Outcome = 'CHANGE' | 'TEST' | 'DOC' | 'NONE';

interface Evidence {
  readonly file: string;
  readonly includes: string;
}

interface PackageOutcome {
  readonly outcome: Outcome;
  readonly evidence: readonly Evidence[];
}

const PACKAGE_OUTCOMES: Readonly<Record<string, PackageOutcome>> = {
  'create-exo-app': { outcome: 'TEST', evidence: [{ file: 'test/rendering/package-color-contract.test.ts', includes: 'templates author colours' }] },
  'eslint-plugin-exojs': { outcome: 'NONE', evidence: [] },
  'exojs-aseprite': { outcome: 'TEST', evidence: [{ file: 'packages/exojs-aseprite/src/asepriteType.ts', includes: "Asset.type('texture'" }] },
  'exojs-audio-fx': { outcome: 'NONE', evidence: [] },
  'exojs-bench': { outcome: 'DOC', evidence: [{ file: 'packages/exojs-bench/docs/harness.md', includes: 'Measuring colour-pipeline cost' }] },
  'exojs-build': {
    outcome: 'TEST',
    evidence: [{ file: 'packages/exojs-cli/test/assets-pack.test.ts', includes: 'keeps its bytes and its DFD transfer and alpha meaning' }],
  },
  'exojs-cli': {
    outcome: 'TEST',
    evidence: [{ file: 'packages/exojs-cli/test/assets-pack.test.ts', includes: 'keeps its bytes and its DFD transfer and alpha meaning' }],
  },
  'exojs-config': { outcome: 'NONE', evidence: [] },
  'exojs-ldtk': { outcome: 'TEST', evidence: [{ file: 'packages/exojs-ldtk/src/loadLdtkMap.ts', includes: "Asset.type('texture'" }] },
  'exojs-lighting': { outcome: 'CHANGE', evidence: [{ file: 'packages/exojs-lighting/test/color-contract.test.ts', includes: 'lighting colour contract' }] },
  'exojs-particles': { outcome: 'CHANGE', evidence: [{ file: 'packages/exojs-particles/test/particle-color-rendering.test.ts', includes: 'describe(' }] },
  'exojs-pathfinding': { outcome: 'NONE', evidence: [] },
  'exojs-physics': { outcome: 'TEST', evidence: [{ file: 'packages/exojs-physics/test/debug.test.ts', includes: 'PhysicsDebugDraw colours' }] },
  'exojs-react': { outcome: 'TEST', evidence: [{ file: 'packages/exojs-react/test/useExoApplication.test.tsx', includes: 'colour pipeline options through' }] },
  'exojs-tiled': { outcome: 'CHANGE', evidence: [{ file: 'packages/exojs-tiled/test/TiledMap.test.ts', includes: 'parseTiledColor' }] },
  'exojs-tilemap': { outcome: 'CHANGE', evidence: [{ file: 'packages/exojs-tilemap/test/color-contract.test.ts', includes: 'describe(' }] },
  'exojs-tilemap-physics': { outcome: 'NONE', evidence: [] },
};

/** Anything of the image-colour surface: a package that names one of these is not independent of the pipeline. */
const COLOUR_SURFACE = /\bColor\b|colorSpace|alphaMode|readImageData|readPixels|\bTexture\b/;

/** A real import of an optional package, on any line of a statement - doc-comment examples do not count. */
const OPTIONAL_PACKAGE_IMPORT = /^(?!\s*(?:\*|\/\/))[^\n]*(?:\bfrom\s+|\bimport\(\s*)['"]@codexo\/exojs-/m;

const discoveredPackages = (): string[] =>
  readdirSync(join(repoRoot, 'packages'))
    .filter(name => existsSync(join(repoRoot, 'packages', name, 'package.json')))
    .sort();

const sourceFiles = (directory: string): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(?:ts|tsx|js|mjs|wgsl|frag|vert)$/.test(entry) && !entry.endsWith('.d.ts')) {
      files.push(path);
    }
  }

  return files;
};

describe('package colour boundary inventory', () => {
  test('every discovered package has exactly one recorded outcome', () => {
    expect(discoveredPackages()).toEqual(Object.keys(PACKAGE_OUTCOMES).sort());
  });

  test.each(Object.entries(PACKAGE_OUTCOMES))('%s: the recorded evidence still states its contract', (name, { outcome, evidence }) => {
    if (outcome === 'NONE') {
      expect(evidence).toEqual([]);

      return;
    }

    const problems: string[] = evidence.length === 0 ? [`${name} claims ${outcome} but names no evidence`] : [];

    for (const { file, includes } of evidence) {
      const path = join(repoRoot, file);

      if (!existsSync(path)) {
        problems.push(`${file} is missing`);
      } else if (!readFileSync(path, 'utf8').includes(includes)) {
        problems.push(`${file} no longer contains "${includes}"`);
      }
    }

    expect(problems).toEqual([]);
  });

  test.each(Object.entries(PACKAGE_OUTCOMES).filter(([, { outcome }]) => outcome === 'NONE'))(
    '%s: a package recorded as independent of the pipeline touches none of its surface',
    name => {
      const source = join(repoRoot, 'packages', name, 'src');

      if (!existsSync(source)) {
        return;
      }

      const reaching = sourceFiles(source).filter(file => COLOUR_SURFACE.test(readFileSync(file, 'utf8')));

      expect(reaching).toEqual([]);
    },
  );
});

describe('package dependency direction', () => {
  test('Core sources never import an optional package', () => {
    const importing = sourceFiles(join(repoRoot, 'src')).filter(file => OPTIONAL_PACKAGE_IMPORT.test(readFileSync(file, 'utf8')));

    expect(importing).toEqual([]);
  });

  test('Core does not depend on an optional package', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
    const declared = ['dependencies', 'peerDependencies', 'optionalDependencies'].flatMap(field =>
      Object.keys(manifest[field] ?? {})
        .filter(name => name.startsWith('@codexo/exojs-'))
        .map(name => `${field}: ${name}`),
    );

    expect(declared).toEqual([]);
  });

  test('importers load images through the ordinary texture asset type and set no colour flags of their own', () => {
    const files = ['packages/exojs-aseprite/src/asepriteType.ts', 'packages/exojs-ldtk/src/loadLdtkMap.ts'];
    const sources = files.map(file => readFileSync(join(repoRoot, file), 'utf8'));

    expect(sources.filter(source => !source.includes("Asset.type('texture'"))).toEqual([]);
    expect(sources.filter(source => /colorSpace|alphaMode/.test(source))).toEqual([]);
  });

  test('generated application templates author colours as Color values and declare no texture colour flags', () => {
    const flagged = sourceFiles(join(repoRoot, 'packages', 'create-exo-app', 'templates')).filter(file =>
      /colorSpace|alphaMode/.test(readFileSync(file, 'utf8')),
    );

    expect(flagged).toEqual([]);
  });
});
