import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { AssetFactoryContext } from '@codexo/exojs';
import { Texture } from '@codexo/exojs';
import type { TileMap } from '@codexo/exojs-tilemap';
import { vi } from 'vitest';

import type { TiledMap } from '../src/TiledMap';
import { tiledSourceType } from '../src/tiledSourceType';
import { tileMapType } from '../src/tileMapType';

// Support both "pnpm test" (cwd=repo root) and "pnpm --filter ... test" (cwd=package).
const PKG_DIR = basename(process.cwd()) === 'exojs-tiled' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-tiled');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

export function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

/**
 * Drives the two Tiled types against a set of in-memory fixtures.
 *
 * The dependency scope answers the three requests a Tiled load makes: a
 * `texture` for every image, a `json` for every external `.tsj`, and a
 * `tiledSource` for the document the runtime map is derived from.
 */
export function makeTiledContext(fixtures: Record<string, unknown>, textureSizes: Record<string, { w: number; h: number }> = {}) {
  const textureLoad = vi.fn((asset: unknown): Texture => {
    const source = (asset as { _config: { source: string } })._config.source;
    const texture = new Texture();
    // A runtime TileSet validates its atlas dimensions, so a fixture that
    // declares a specific atlas needs a texture that matches it.
    const size = textureSizes[source] ?? { w: 32, h: 32 };

    texture.width = size.w;
    texture.height = size.h;

    return texture;
  });

  const load = vi.fn(async (asset: unknown): Promise<unknown> => {
    const { type, source } = (asset as { _config: { type: string; source: string } })._config;

    if (type === 'texture') {
      return textureLoad(asset);
    }

    if (type === 'json') {
      if (Object.hasOwn(fixtures, source)) return fixtures[source];

      throw new Error(`makeTiledContext: no fixture registered for "${source}"`);
    }

    if (type === 'tiledSource') {
      return loadSource(source);
    }

    throw new Error(`makeTiledContext: unexpected dependency "${type}"`);
  });

  const contextFor = (source: string, options?: unknown): AssetFactoryContext =>
    ({
      source,
      resourceKey: `test|${source}`,
      sourceKey: `url:${source}`,
      locator: `url:${source}`,
      ...(options !== undefined && { options }),
      dependencies: { load } as unknown as AssetFactoryContext['dependencies'],
    }) as unknown as AssetFactoryContext;

  /** Runs a fixture through the source type's own codec and factory. */
  async function loadSource(source: string, options?: unknown): Promise<TiledMap> {
    if (!Object.hasOwn(fixtures, source)) {
      throw new Error(`makeTiledContext: no fixture registered for "${source}"`);
    }

    const data = await tiledSourceType.codec!.decode(JSON.stringify(fixtures[source]), { locator: `url:${source}` });

    return tiledSourceType.createFactory().create(data, contextFor(source, options) as never);
  }

  /** Runs the runtime type, which reaches its document through the dependency scope. */
  async function loadRuntime(source: string, options?: unknown): Promise<TileMap> {
    return tileMapType.createFactory().create(undefined, contextFor(source, options) as never);
  }

  return { load, textureLoad, contextFor, loadSource, loadRuntime };
}
