import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { startStaticServer, type StaticServer } from '../src/staticServer';

let root: string;

const write = (relativePath: string, contents: string | Uint8Array): void => {
  const target = join(root, relativePath);

  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, contents);
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'exo-serve-'));

  write('index.html', '<!doctype html><title>app</title>');
  write('assets/app.js', 'export const ok = true;');
  write('assets/module.wasm', new Uint8Array([0x00, 0x61, 0x73, 0x6d]));
  write('assets/atlas.ktx2', new Uint8Array([0xab, 0x4b, 0x54, 0x58]));
  write('assets/level.exoa', new Uint8Array([0x45, 0x58, 0x4f, 0x41]));
  write('assets/data.bin', new Uint8Array([1, 2, 3]));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const serving = async (options: Parameters<typeof startStaticServer>[0], run: (server: StaticServer) => Promise<void>): Promise<void> => {
  const server = await startStaticServer(options);

  try {
    await run(server);
  } finally {
    await server.close();
  }
};

describe('exo serve', () => {
  test('serves the content types a built ExoJS app needs', async () => {
    await serving({ root, port: 0 }, async server => {
      // These three are the reason the server exists: a generic static server
      // answers all of them `application/octet-stream`, and streaming
      // instantiation then refuses the response.
      const expected: readonly (readonly [string, string])[] = [
        ['assets/module.wasm', 'application/wasm'],
        ['assets/atlas.ktx2', 'image/ktx2'],
        ['assets/level.exoa', 'application/vnd.exojs.container'],
        ['assets/app.js', 'text/javascript; charset=utf-8'],
        ['index.html', 'text/html; charset=utf-8'],
        ['assets/data.bin', 'application/octet-stream'],
      ];

      const served: [string, number, string | null][] = [];

      for (const [path] of expected) {
        const response = await fetch(`${server.url}${path}`);

        served.push([path, response.status, response.headers.get('content-type')]);
        await response.arrayBuffer();
      }

      expect(served).toEqual(expected.map(([path, contentType]) => [path, 200, contentType]));
    });
  });

  test('sends both cross-origin isolation headers by default', async () => {
    await serving({ root, port: 0 }, async server => {
      const response = await fetch(`${server.url}index.html`);

      expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
      expect(response.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
      await response.arrayBuffer();
    });
  });

  test('--no-cross-origin-isolation omits both of them', async () => {
    await serving({ root, port: 0, crossOriginIsolation: false }, async server => {
      const response = await fetch(`${server.url}index.html`);

      expect(response.headers.get('cross-origin-opener-policy')).toBeNull();
      expect(response.headers.get('cross-origin-embedder-policy')).toBeNull();
      await response.arrayBuffer();
    });
  });

  test('a path with no file falls back to index.html', async () => {
    await serving({ root, port: 0 }, async server => {
      const response = await fetch(`${server.url}level/3/settings`);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<title>app</title>');
    });
  });

  test('a directory is served as its index.html', async () => {
    await serving({ root, port: 0 }, async server => {
      const response = await fetch(server.url);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await response.text()).toContain('<title>app</title>');
    });
  });

  test('with the fallback off, a missing file is a 404', async () => {
    await serving({ root, port: 0, spaFallback: false }, async server => {
      const response = await fetch(`${server.url}level/3/settings`);

      expect(response.status).toBe(404);
      await response.arrayBuffer();
    });
  });

  test('refuses a path that escapes the served directory', async () => {
    await serving({ root, port: 0, spaFallback: false }, async server => {
      // Encoded, because the check has to survive decoding rather than pattern
      // matching on the request text.
      const response = await fetch(`${server.url}%2e%2e%2f%2e%2e%2fetc%2fpasswd`);

      expect(response.status).toBe(403);
      await response.arrayBuffer();
    });
  });

  test('answers a method it does not implement with 405 and Allow', async () => {
    await serving({ root, port: 0 }, async server => {
      const response = await fetch(`${server.url}index.html`, { method: 'DELETE' });

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
      await response.arrayBuffer();
    });
  });

  test('reports a directory that does not exist', async () => {
    await expect(startStaticServer({ root: join(root, 'nope'), port: 0 })).rejects.toThrow(/cannot serve .*: the directory does not exist/);
  });

  test('reports a port that is already taken', async () => {
    await serving({ root, port: 0 }, async server => {
      await expect(startStaticServer({ root, port: server.port })).rejects.toThrow(`port ${server.port} is already in use`);
    });
  });
});
