import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https';
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

const good = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  Host: `${LAN}:${port}`,
  Origin: `https://${LAN}:${port}`,
});

const withoutOrigin = (): Record<string, string> => {
  const { Origin: _origin, ...rest } = good();

  return rest;
};

describe('dpr-probe POST /submit guard', () => {
  test('accepts a same-origin JSON submit on a LAN address', async () => {
    expect(await post(good())).toBe(200);
    expect(readdirSync(dir)).toHaveLength(1);
  });

  test('accepts a loopback host with a matching origin', async () => {
    expect(await post({ ...good(), Host: `localhost:${port}`, Origin: `https://localhost:${port}` })).toBe(200);
  });

  test('rejects a non-JSON content type', async () => {
    expect(await post({ ...good(), 'Content-Type': 'text/plain' })).toBe(415);
  });

  test('rejects a foreign origin', async () => {
    expect(await post({ ...good(), Origin: 'https://evil.example' })).toBe(403);
  });

  test('rejects an origin with the wrong scheme', async () => {
    expect(await post({ ...good(), Origin: `http://${LAN}:${port}` })).toBe(403);
  });

  test('rejects a DNS-rebinding host even when the origin matches it', async () => {
    expect(await post({ ...good(), Host: `evil.example:${port}`, Origin: `https://evil.example:${port}` })).toBe(403);
  });

  test('rejects a missing origin without a referer', async () => {
    expect(await post(withoutOrigin())).toBe(403);
  });

  test('accepts a missing origin with a same-origin referer', async () => {
    expect(await post({ ...withoutOrigin(), Referer: `https://${LAN}:${port}/` })).toBe(200);
  });

  test('rejects a missing origin with a foreign referer', async () => {
    expect(await post({ ...withoutOrigin(), Referer: 'https://evil.example/' })).toBe(403);
  });

  test('rejects a host port that is not the bound port, even with a matching origin', async () => {
    expect(await post({ ...good(), Host: `${LAN}:${port + 1}`, Origin: `https://${LAN}:${port + 1}` })).toBe(403);
  });

  test('rejects an absent host port unless the bound port is the scheme default', async () => {
    expect(await post({ ...good(), Host: LAN, Origin: `https://${LAN}` })).toBe(403);
  });

  test('parses a bracketed IPv6 host with the bound port', async () => {
    expect(await post({ ...good(), Host: `[::1]:${port}`, Origin: `https://[::1]:${port}` })).toBe(200);
  });

  test('rejects an IPv6 host with a wrong, missing or malformed port', async () => {
    expect(await post({ ...good(), Host: `[::1]:${port + 1}`, Origin: `https://[::1]:${port + 1}` })).toBe(403);
    expect(await post({ ...good(), Host: '[::1]', Origin: 'https://[::1]' })).toBe(403);
    expect(await post({ ...good(), Host: `[::1]:x${port}`, Origin: `https://[::1]:x${port}` })).toBe(403);
    expect(await post({ ...good(), Host: `[::1]evil.example:${port}`, Origin: `https://[::1]evil.example:${port}` })).toBe(403);
  });
});

describe('dpr-probe POST /submit over real TLS', () => {
  let tlsDir: string;
  let tlsServer: ReturnType<typeof createHttpsServer>;
  let tlsPort: number;
  let cert: Buffer;

  beforeAll(async () => {
    tlsDir = mkdtempSync(join(tmpdir(), 'dpr-submit-tls-'));

    const keyPath = join(tlsDir, 'key.pem');
    const certPath = join(tlsDir, 'cert.pem');
    const openssl = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'].find(candidate => {
      try {
        execFileSync(candidate, ['version'], { stdio: 'ignore' });

        return true;
      } catch {
        return false;
      }
    });

    if (openssl === undefined) {
      throw new Error('openssl is required to generate the self-signed test certificate');
    }

    execFileSync(
      openssl,
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=IP:127.0.0.1,DNS:localhost',
      ],
      { stdio: 'ignore' },
    );
    cert = readFileSync(certPath);

    let handler: Handler | undefined;

    (
      submitPlugin({ captureDir: tlsDir, repoRoot: tlsDir, scheme: 'https', allowedHostnames: ['localhost', '127.0.0.1'] }) as {
        configureServer(s: { middlewares: { use(h: Handler): void } }): void;
      }
    ).configureServer({ middlewares: { use: h => (handler = h) } });

    tlsServer = createHttpsServer({ key: readFileSync(keyPath), cert }, (req, res) =>
      handler!(req as unknown as SubmitRequest, res as unknown as SubmitResponse, () => res.end('next')),
    );
    await new Promise<void>(resolve => tlsServer.listen(0, '127.0.0.1', resolve));
    tlsPort = (tlsServer.address() as AddressInfo).port;
  });

  afterAll(() => {
    tlsServer.close();
    rmSync(tlsDir, { recursive: true, force: true });
  });

  const tlsPost = (headers: Record<string, string>): Promise<number> =>
    new Promise((resolve, reject) => {
      const req = httpsRequest({ host: '127.0.0.1', port: tlsPort, path: '/submit', method: 'POST', ca: cert, headers }, res => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      });

      req.on('error', reject);
      req.end(CAPTURE);
    });

  const tlsGood = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Host: `127.0.0.1:${tlsPort}`,
    Origin: `https://127.0.0.1:${tlsPort}`,
  });

  test('accepts an https origin on the bound port', async () => {
    expect(await tlsPost(tlsGood())).toBe(200);
  });

  test('refuses an http origin, a wrong port and a foreign origin', async () => {
    expect(await tlsPost({ ...tlsGood(), Origin: `http://127.0.0.1:${tlsPort}` })).toBe(403);
    expect(await tlsPost({ ...tlsGood(), Host: `127.0.0.1:${tlsPort + 1}`, Origin: `https://127.0.0.1:${tlsPort + 1}` })).toBe(403);
    expect(await tlsPost({ ...tlsGood(), Origin: 'https://evil.example' })).toBe(403);
  });
});
