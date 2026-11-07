import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { submitPlugin, type SubmitPluginOptions, type SubmitRequest, type SubmitResponse } from '../src/rendering/dpr-probe/submit';

const CAPTURE = JSON.stringify({ schemaVersion: 1, timestamp: '2026-01-01T00:00:00Z', deviceLabel: 'phone', cells: [] });
const LAN = '192.168.1.20';

type Handler = (request: SubmitRequest, response: SubmitResponse, next: () => void) => void;

let dir: string;
let server: Server;
let port: number;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dpr-submit-'));

  const options: SubmitPluginOptions = {
    captureDir: dir,
    repoRoot: dir,
    scheme: 'https',
    allowedHostnames: ['localhost', '127.0.0.1', '[::1]', LAN],
  };
  let handler: Handler | undefined;

  (submitPlugin(options) as { configureServer(s: { middlewares: { use(h: Handler): void } }): void }).configureServer({
    middlewares: { use: h => (handler = h) },
  });

  server = createServer((req, res) => handler!(req as unknown as SubmitRequest, res as unknown as SubmitResponse, () => res.end('next')));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const post = (headers: Record<string, string>): Promise<number> =>
  new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: '/submit', method: 'POST', headers }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });

    req.on('error', reject);
    req.end(CAPTURE);
  });

const good: Record<string, string> = { 'Content-Type': 'application/json', Host: `${LAN}:4443`, Origin: `https://${LAN}:4443` };

const withoutOrigin = (): Record<string, string> => {
  const { Origin: _origin, ...rest } = good;

  return rest;
};

describe('dpr-probe POST /submit guard', () => {
  test('accepts a same-origin JSON submit on a LAN address', async () => {
    expect(await post(good)).toBe(200);
    expect(readdirSync(dir)).toHaveLength(1);
  });

  test('accepts a loopback host with a matching origin', async () => {
    expect(await post({ ...good, Host: `localhost:${port}`, Origin: `https://localhost:${port}` })).toBe(200);
  });

  test('rejects a non-JSON content type', async () => {
    expect(await post({ ...good, 'Content-Type': 'text/plain' })).toBe(415);
  });

  test('rejects a foreign origin', async () => {
    expect(await post({ ...good, Origin: 'https://evil.example' })).toBe(403);
  });

  test('rejects an origin with the wrong scheme', async () => {
    expect(await post({ ...good, Origin: `http://${LAN}:4443` })).toBe(403);
  });

  test('rejects a DNS-rebinding host even when the origin matches it', async () => {
    expect(await post({ ...good, Host: 'evil.example:4443', Origin: 'https://evil.example:4443' })).toBe(403);
  });

  test('rejects a missing origin without a referer', async () => {
    expect(await post(withoutOrigin())).toBe(403);
  });

  test('accepts a missing origin with a same-origin referer', async () => {
    expect(await post({ ...withoutOrigin(), Referer: `https://${LAN}:4443/` })).toBe(200);
  });

  test('rejects a missing origin with a foreign referer', async () => {
    expect(await post({ ...withoutOrigin(), Referer: 'https://evil.example/' })).toBe(403);
  });
});
