import { describe, expect, it } from 'vitest';

import {
  findUnmappedSpecifiers,
  migrateMarkdown,
  migrateSource,
  migrateText,
  V020_SPECIFIER_MIGRATIONS,
} from '../../scripts/codemods/migrate-v020-imports';
import { RUNTIME_MODULES } from '../../scripts/release/lockstep-packages';

describe('V020_SPECIFIER_MIGRATIONS', () => {
  it('maps every retired runtime package to its Core subpath, and nothing else', () => {
    const expected = Object.fromEntries([
      ...RUNTIME_MODULES.map(module => [module.legacyName, `@codexo/exojs/${module.subpath}`]),
      ['@codexo/exojs-physics/debug', '@codexo/exojs/debug'],
    ]);

    expect(V020_SPECIFIER_MIGRATIONS).toEqual(expected);
  });
});

describe('migrateSource', () => {
  it('rewrites value, type, re-export, dynamic and mocked imports', () => {
    const before = [
      "import { TileMap } from '@codexo/exojs-tilemap';",
      "import type { PhysicsWorld } from '@codexo/exojs-physics';",
      "import { PhysicsDebugDraw } from '@codexo/exojs-physics/debug';",
      'export { ParticleSystem } from "@codexo/exojs-particles";',
      "const fx = await import('@codexo/exojs-audio-fx');",
      "vi.mock('@codexo/exojs-lighting');",
    ].join('\n');

    expect(migrateSource('scene.ts', before)).toBe(
      [
        "import { TileMap } from '@codexo/exojs/tilemap';",
        "import type { PhysicsWorld } from '@codexo/exojs/physics';",
        "import { PhysicsDebugDraw } from '@codexo/exojs/debug';",
        'export { ParticleSystem } from "@codexo/exojs/particles";',
        "const fx = await import('@codexo/exojs/audio-fx');",
        "vi.mock('@codexo/exojs/lighting');",
      ].join('\n'),
    );
  });

  it('leaves packages that stay separate, prose, URLs and comments alone', () => {
    const text = [
      "import { TiledMap } from '@codexo/exojs-tiled';",
      "import { Application } from '@codexo/exojs';",
      '// Install @codexo/exojs-tilemap from https://www.npmjs.com/package/@codexo/exojs-tilemap',
      "const label = '@codexo/exojs-physics';",
      'console.log(TiledMap, Application, label);',
    ].join('\n');

    expect(migrateSource('keep.ts', text)).toBe(text);
  });

  it('is idempotent', () => {
    const once = migrateSource('a.ts', "import { Pathfinder } from '@codexo/exojs-pathfinding';\n");

    expect(migrateSource('a.ts', once)).toBe(once);
  });

  it('keeps a JSX file parseable as JSX', () => {
    const text =
      "import { LightmapLighting } from '@codexo/exojs-lighting';\nexport const View = () => <div>{String(LightmapLighting)}</div>;\n";

    expect(migrateSource('View.tsx', text)).toContain("from '@codexo/exojs/lighting'");
  });
});

describe('migrateMarkdown', () => {
  it('rewrites fenced TypeScript and JavaScript blocks only', () => {
    const before = [
      'Install `@codexo/exojs-tilemap` and import it:',
      '',
      '```ts',
      "import { TileMap } from '@codexo/exojs-tilemap';",
      '```',
      '',
      '```bash',
      'npm install @codexo/exojs-tilemap',
      '```',
      '',
      '~~~js title="tiles.js"',
      "import { TileSet } from '@codexo/exojs-tilemap';",
      '~~~',
      '',
      "See [the package](https://www.npmjs.com/package/@codexo/exojs-tilemap) or import from '@codexo/exojs-tilemap'.",
    ].join('\n');

    expect(migrateMarkdown('README.md', before)).toBe(
      before
        .replace("import { TileMap } from '@codexo/exojs-tilemap';", "import { TileMap } from '@codexo/exojs/tilemap';")
        .replace("import { TileSet } from '@codexo/exojs-tilemap';", "import { TileSet } from '@codexo/exojs/tilemap';"),
    );
  });

  it('keeps CRLF line endings and longer fences intact', () => {
    const before = "````tsx\r\nimport { ParticleSystem } from '@codexo/exojs-particles';\r\n```\r\nstill code\r\n````\r\n";

    expect(migrateMarkdown('guide.mdx', before)).toBe(before.replace('@codexo/exojs-particles', '@codexo/exojs/particles'));
  });

  it('skips an unterminated fence rather than rewriting the rest of the document', () => {
    const before = "```ts\nimport { TileMap } from '@codexo/exojs-tilemap';\n";

    expect(migrateMarkdown('broken.md', before)).toBe(before);
  });
});

describe('migrateText', () => {
  it('ignores file types it does not understand', () => {
    expect(migrateText('package.json', '{"dependencies":{"@codexo/exojs-tilemap":"0.19.x"}}')).toBeUndefined();
  });
});

describe('findUnmappedSpecifiers', () => {
  it('reports deep imports of a retired package that have no v0.20 entry', () => {
    const text =
      "import data from '@codexo/exojs-tilemap/package.json';\nimport { PhysicsDebugDraw } from '@codexo/exojs-physics/debug';\n";

    expect(findUnmappedSpecifiers('x.ts', text)).toEqual(['@codexo/exojs-tilemap/package.json']);
  });
});
