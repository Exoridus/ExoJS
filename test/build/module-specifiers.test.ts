import { describe, expect, it } from 'vitest';

import { findModuleSpecifiers, rewriteModuleSpecifiers } from '../../scripts/lib/module-specifiers';

const specifiers = (fileName: string, text: string): string[] =>
  findModuleSpecifiers(fileName, text).map(occurrence => occurrence.specifier);

describe('findModuleSpecifiers', () => {
  it('finds every module reference a declaration file can carry', () => {
    const declaration = [
      "import { Container } from '@codexo/exojs';",
      "import type { DebugLayer } from '@codexo/exojs/debug';",
      "export { Curve } from '#distributions/Curve';",
      "export * from './TileMap';",
      "export type Grid = import('@codexo/exojs/tilemap').TileMap;",
      "export declare const ctor: typeof import('#ParticleSystem');",
      "import legacy = require('@codexo/exojs/renderer-sdk');",
      "declare module '@codexo/exojs/extensions' {}",
    ].join('\n');

    expect(specifiers('x.d.ts', declaration)).toEqual([
      '@codexo/exojs',
      '@codexo/exojs/debug',
      '#distributions/Curve',
      './TileMap',
      '@codexo/exojs/tilemap',
      '#ParticleSystem',
      '@codexo/exojs/renderer-sdk',
      '@codexo/exojs/extensions',
    ]);
  });

  it('finds dynamic imports, require forms and test-runner module mocks', () => {
    const source = [
      "const lazy = await import('@codexo/exojs-physics');",
      "const cjs = require('@codexo/exojs-tilemap');",
      "const path = require.resolve('@codexo/exojs-lighting/package.json');",
      "const url = import.meta.resolve('@codexo/exojs-particles');",
      "vi.mock('@codexo/exojs-audio-fx', () => ({}));",
      "const actual = await vi.importActual('@codexo/exojs-pathfinding');",
    ].join('\n');

    expect(specifiers('x.ts', source)).toEqual([
      '@codexo/exojs-physics',
      '@codexo/exojs-tilemap',
      '@codexo/exojs-lighting/package.json',
      '@codexo/exojs-particles',
      '@codexo/exojs-audio-fx',
      '@codexo/exojs-pathfinding',
    ]);
  });

  it('ignores specifier-shaped text that is not a module reference', () => {
    const source = [
      "// import { TileMap } from '@codexo/exojs-tilemap';",
      '/** @example import { TileMap } from "@codexo/exojs-tilemap"; */',
      "const name = '@codexo/exojs-tilemap';",
      "type Name = '@codexo/exojs-tilemap';",
      "const shader = '#version 300 es';",
      "const docs = 'https://www.npmjs.com/package/@codexo/exojs-tilemap';",
      'console.log(name, shader, docs);',
    ].join('\n');

    expect(specifiers('x.ts', source)).toEqual([]);
  });

  it('parses a .ts file as TypeScript, not TSX', () => {
    const source = "const identity = <T,>(value: T): T => value;\nimport { TileMap } from '@codexo/exojs-tilemap';\n";

    expect(specifiers('generic.ts', source)).toEqual(['@codexo/exojs-tilemap']);
  });
});

describe('rewriteModuleSpecifiers', () => {
  it('replaces only the mapped specifiers and keeps quotes and surrounding text', () => {
    const text = 'import { a } from "@codexo/exojs";\nexport { b } from \'#b\';\nexport * from "./c";\n';
    const rewritten = rewriteModuleSpecifiers('x.d.ts', text, specifier =>
      specifier === '@codexo/exojs' ? '../index.js' : specifier === '#b' ? './b.js' : undefined,
    );

    expect(rewritten).toBe('import { a } from "../index.js";\nexport { b } from \'./b.js\';\nexport * from "./c";\n');
  });

  it('rewrites several references on one line independently', () => {
    const text = "export declare const pair: [typeof import('#a'), typeof import('#b')];";

    expect(rewriteModuleSpecifiers('x.d.ts', text, specifier => `./${specifier.slice(1)}.js`)).toBe(
      "export declare const pair: [typeof import('./a.js'), typeof import('./b.js')];",
    );
  });

  it('returns the text unchanged when nothing maps', () => {
    const text = "import { a } from './a';\n";

    expect(rewriteModuleSpecifiers('x.ts', text, () => undefined)).toBe(text);
  });
});
