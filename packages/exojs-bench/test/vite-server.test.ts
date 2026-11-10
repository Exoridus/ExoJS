// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { startViteServer, type ViteDevServer } from '../src/shared/viteServer';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BENCH_IMPORTER = resolve(ROOT, 'packages/exojs-bench/src/rendering/adapters/exojs.ts');
const ENGINE_IMPORTER = resolve(ROOT, 'src/index.ts');
type HashResolver = (source: string, importer: string | undefined) => string | null;
interface ResolvedServer extends ViteDevServer {
  environments: {
    client: {
      pluginContainer: { resolveId(source: string, importer: string): Promise<{ id: string } | null> };
      transformRequest(path: string): Promise<{ code: string } | null>;
    };
  };
}

let server: ResolvedServer;
let resolveEngineImport: HashResolver;

beforeAll(async () => {
  server = (await startViteServer({
    pageDir: resolve(ROOT, 'packages/exojs-bench/src/rendering/page'),
    version: 'test',
    libraryArms: [],
    extraPlugins: [
      {
        name: 'observe-engine-import-resolution',
        configResolved(config: { plugins: Array<{ name: string; resolveId?: unknown }> }) {
          resolveEngineImport = config.plugins.find(plugin => plugin.name === 'exojs-bench-engine-hash-imports')!.resolveId as HashResolver;
        },
      },
    ],
  })) as ResolvedServer;
});

afterAll(async () => {
  await server?.close();
});

const resolvedId = async (source: string, importer: string): Promise<string | undefined> =>
  (await server.environments.client.pluginContainer.resolveId(source, importer))?.id;
const vitePath = (path: string): string => path.replaceAll('\\', '/');

describe('benchmark engine source resolution', () => {
  test('resolves a known engine module for benchmark adapters', async () => {
    expect(await resolvedId('#core/Clock', BENCH_IMPORTER)).toBe(vitePath(resolve(ROOT, 'src/core/Clock.ts')));
  });

  test('leaves named package imports to the engine imports map', async () => {
    expect(resolveEngineImport('#physics-debug', ENGINE_IMPORTER)).toBeNull();
    expect(await resolvedId('#physics-debug', ENGINE_IMPORTER)).toBe(vitePath(resolve(ROOT, 'packages/exojs-physics/src/debug/index.ts')));
  });

  test.each(['#core/Loop', '#missing-benchmark-module'])('does not invent TypeScript files for unknown imports: %s', source => {
    expect(resolveEngineImport(source, BENCH_IMPORTER)).toBeNull();
  });

  test.each(['#../packages/exojs-physics/src/index', '#../src-sibling/core/Loop'])(
    'does not claim a source outside the engine root: %s',
    source => {
      expect(resolveEngineImport(source, BENCH_IMPORTER)).toBeNull();
    },
  );

  test.each(['exojs-particles', 'exojs-tilemap'])('defers package-local imports inside %s', packageName => {
    expect(resolveEngineImport('#core/Clock', resolve(ROOT, `packages/${packageName}/src/index.ts`))).toBeNull();
  });

  test('does not treat a sibling with a shared prefix as an extension package', () => {
    expect(resolveEngineImport('#core/Clock', resolve(ROOT, 'packages/exojs-particles-other/src/index.ts'))).toBe(
      resolve(ROOT, 'src/core/Clock.ts'),
    );
  });

  test('resolves package-local particle imports through their source condition', async () => {
    expect(await resolvedId('#ParticleSystem', resolve(ROOT, 'packages/exojs-particles/src/index.ts'))).toBe(
      vitePath(resolve(ROOT, 'packages/exojs-particles/src/ParticleSystem.ts')),
    );
  });

  test.each(['rendering/webgl2/shaders/sprite.vert', 'rendering/shaders/output.frag', 'rendering/shaders/output.wgsl'])(
    'keeps the real shader source for %s',
    async source => {
      expect(resolveEngineImport(`#${source}`, ENGINE_IMPORTER)).toBeNull();
      const path = resolve(ROOT, 'src', source);
      expect(await resolvedId(`#${source}`, ENGINE_IMPORTER)).toBe(vitePath(path));
      const transformed = await server.environments.client.transformRequest(`/@fs/${vitePath(path)}`);
      expect(transformed?.code).toContain(JSON.stringify(readFileSync(path, 'utf8')));
    },
  );

  test.each(['lighting', 'particles', 'tilemap', 'physics'])(
    'resolves the official %s package entry to the same source checkout',
    async name => {
      expect(await resolvedId(`@codexo/exojs/${name}`, BENCH_IMPORTER)).toBe(
        vitePath(resolve(ROOT, `packages/exojs-${name}/src/index.ts`)),
      );
    },
  );
});
