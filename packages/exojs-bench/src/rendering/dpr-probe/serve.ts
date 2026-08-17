import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readEngineVersion, startViteServer } from '../../shared/viteServer';

/**
 * Serve the manual DPR / internal-render-target probe page so a real phone on
 * the same network can open it.
 *
 * There is no driver here on purpose (§1 of the brief): no result collector, no
 * device farm, no remote control. This script starts the page and prints a URL;
 * everything else happens on the device, and the capture comes back through the
 * page's own `Copy JSON`.
 *
 * ```sh
 * pnpm --filter @codexo/exojs-bench probe:dpr
 * pnpm --filter @codexo/exojs-bench probe:dpr -- --http   # no TLS, see below
 * ```
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE_DIR = resolve(HERE, 'page');
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');
/** Generated certificates live in the repo's gitignored scratch directory, never in the package. */
const CERT_DIR = join(REPO_ROOT, '.workspace', 'dpr-probe-cert');

/**
 * Interface names that belong to a virtual switch rather than to a real network.
 *
 * They are non-internal, so a naive "first non-internal IPv4" picks them — and on
 * this machine it did, printing a Hyper-V `172.24.16.1` that no phone can reach.
 * They are sorted last rather than dropped: on a host where the only usable
 * address IS such an adapter, printing it beats printing nothing.
 */
const VIRTUAL_INTERFACE_PATTERN = /vethernet|virtualbox|vmware|docker|wsl|loopback|hyper-v|tailscale|zerotier/i;

/** One candidate address a phone might reach this machine on. */
interface LanCandidate {
  readonly name: string;
  readonly address: string;
  readonly virtual: boolean;
}

/** Every non-internal IPv4 address, real networks first. */
const resolveLanCandidates = (): LanCandidate[] => {
  const candidates: LanCandidate[] = [];

  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        candidates.push({ name, address: entry.address, virtual: VIRTUAL_INTERFACE_PATTERN.test(name) });
      }
    }
  }

  return candidates.sort((a, b) => Number(a.virtual) - Number(b.virtual));
};

/** Locate an `openssl` binary. Git for Windows ships one that is not always on PATH. */
const resolveOpenssl = (): string => {
  const candidates = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', '/usr/bin/openssl'];

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore' });

      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('No usable `openssl` binary was found. Install OpenSSL, or run with `--http` and accept the caveats it prints.');
};

/**
 * Self-signed certificate for `https://<lan-ip>:<port>`, generated once per
 * address and cached.
 *
 * HTTPS is not decoration here. The page needs a SECURE context for two
 * separate reasons, and a LAN `http://` origin is not one:
 *
 * 1. `crossOriginIsolated` requires it, and without isolation WebKit coarsens
 *    `performance.now()` — the probe's primary metric.
 * 2. `navigator.gpu` is unavailable outside a secure context, so the WebGPU arm
 *    could not even be attempted.
 *
 * The certificate is self-signed, so Safari will interrupt once with a privacy
 * warning; accepting it is enough, no profile install is required.
 */
const ensureCertificate = (addresses: readonly string[]): { key: Buffer; cert: Buffer } => {
  mkdirSync(CERT_DIR, { recursive: true });

  // Keyed on the full address set: a laptop that moves between networks gets a
  // new certificate rather than one whose SAN no longer names the address the
  // phone is dialling, which Safari rejects outright instead of warning about.
  const stem = addresses.join('_').replaceAll(/[^0-9a-z._-]/gi, '-');
  const keyPath = join(CERT_DIR, `${stem}-key.pem`);
  const certPath = join(CERT_DIR, `${stem}-cert.pem`);

  if (!existsSync(keyPath) || !existsSync(certPath)) {
    const openssl = resolveOpenssl();

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
        '365',
        '-subj',
        '/CN=exojs-dpr-probe',
        '-addext',
        `subjectAltName=${[...addresses.map(value => `IP:${value}`), 'IP:127.0.0.1', 'DNS:localhost'].join(',')}`,
      ],
      { stdio: 'ignore' },
    );
  }

  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
};

/** Where submitted captures land. Inside the repo's gitignored scratch directory. */
const CAPTURE_DIR = join(REPO_ROOT, '.workspace', 'probe');

/** Hard cap on a submitted body. A full 32-cell capture is ~30 KB; this is three orders of margin. */
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

/** Reduce a free-text field to something safe to put in a filename. */
const slug = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 40);

/** Minimal surface of the Node request the submit middleware consumes. */
interface SubmitRequest {
  readonly url?: string;
  readonly method?: string;
  on(event: 'data', listener: (chunk: Buffer) => void): void;
  on(event: 'end', listener: () => void): void;
  destroy(): void;
}

/** Minimal surface of the Node response the submit middleware writes to. */
interface SubmitResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}

/**
 * Mount `POST /submit`, which writes a capture straight into the repository.
 *
 * The alternative is copying 30 KB of JSON off a phone by hand, which is both
 * tedious and lossy. The endpoint exists only on this manually started dev
 * server, never in anything shipped.
 *
 * The filename is derived SERVER-SIDE from the parsed capture (its own
 * timestamp and device label, both slugged) and joined onto a fixed directory —
 * nothing the page sends can steer the write out of {@link CAPTURE_DIR}.
 */
const submitPlugin = (): unknown => ({
  name: 'dpr-probe-submit',
  configureServer(server: { middlewares: { use: (handler: (request: SubmitRequest, response: SubmitResponse, next: () => void) => void) => void } }): void {
    server.middlewares.use((request, response, next) => {
      if (request.url !== '/submit' || request.method !== 'POST') {
        next();

        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      let aborted = false;

      const fail = (status: number, message: string): void => {
        aborted = true;
        response.statusCode = status;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ error: message }));
      };

      request.on('data', chunk => {
        if (aborted) {
          return;
        }

        size += chunk.length;

        if (size > MAX_CAPTURE_BYTES) {
          fail(413, `capture exceeds ${MAX_CAPTURE_BYTES} bytes`);
          request.destroy();

          return;
        }

        chunks.push(chunk);
      });

      request.on('end', () => {
        if (aborted) {
          return;
        }

        const body = Buffer.concat(chunks).toString('utf8');
        let capture: { schemaVersion?: unknown; timestamp?: unknown; deviceLabel?: unknown; cells?: unknown };

        try {
          capture = JSON.parse(body) as typeof capture;
        } catch {
          fail(400, 'body is not valid JSON');

          return;
        }

        // Refuse anything that is not recognisably a capture, so a stray POST
        // cannot litter the directory the report reads from.
        if (typeof capture.schemaVersion !== 'number' || !Array.isArray(capture.cells)) {
          fail(422, 'body is not a probe capture (missing schemaVersion / cells)');

          return;
        }

        const stamp = typeof capture.timestamp === 'string' ? slug(capture.timestamp) : 'no-timestamp';
        const device = typeof capture.deviceLabel === 'string' && capture.deviceLabel.trim().length > 0 ? slug(capture.deviceLabel) : 'unnamed-device';
        const target = join(CAPTURE_DIR, `${stamp}-${device}.json`);

        mkdirSync(CAPTURE_DIR, { recursive: true });
        writeFileSync(target, body, 'utf8');
        process.stdout.write(`\n  capture received: ${target}  (${capture.cells.length} cells)\n`);

        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ path: relative(REPO_ROOT, target).replaceAll('\\', '/') }));
      });
    });
  },
});

/** Commit the probe is served from, with a `-dirty` suffix when the tree is not clean. */
const readGitSha = (): string => {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

    return status.length > 0 ? `${sha}-dirty` : sha;
  } catch {
    return 'unknown';
  }
};

const main = async (): Promise<void> => {
  const plainHttp = process.argv.includes('--http');
  const candidates = resolveLanCandidates();

  if (candidates.length === 0) {
    throw new Error('No non-internal IPv4 address was found; the phone has no address to reach this machine on.');
  }

  const version = readEngineVersion();
  const gitSha = readGitSha();
  const https = plainHttp ? undefined : ensureCertificate(candidates.map(candidate => candidate.address));

  const server = await startViteServer({
    pageDir: PAGE_DIR,
    version,
    host: '0.0.0.0',
    ...(https !== undefined && { https }),
    extraDefine: { __PROBE_META__: JSON.stringify({ gitSha, engineVersion: version }) },
    extraPlugins: [submitPlugin()],
  });

  const port = new URL(server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5173').port;
  const scheme = plainHttp ? 'http' : 'https';

  process.stdout.write(
    [
      '',
      `ExoJS DPR / internal render-target probe — NEU-S4`,
      `  commit   ${gitSha}`,
      `  engine   ${version}`,
      '',
      '  On the phone, open the first URL that answers:',
      ...candidates.map(candidate => `    ${scheme}://${candidate.address}:${port}/   (${candidate.name}${candidate.virtual ? ', virtual adapter — unlikely' : ''})`),
      `  On this machine:      ${scheme}://127.0.0.1:${port}/`,
      '',
      plainHttp
        ? '  --http: NOT a secure context on a LAN address. `crossOriginIsolated` will be false\n  (so performance.now() is coarsened) and navigator.gpu will be absent. Use this only\n  to check that the page loads at all, never for a capture you intend to report.'
        : '  The certificate is self-signed. Safari warns once: tap "Show Details" then\n  "visit this website". No profile install is needed.',
      '',
      '  `Submit to host` on the page writes the capture straight into',
      `  ${relative(REPO_ROOT, CAPTURE_DIR).replaceAll('\\', '/')}/ — no copying off the phone needed.`,
      '',
      '  Keep the phone screen on and the canvas visible for the whole run —',
      '  a backgrounded tab stops receiving animation frames.',
      '',
      '  Ctrl-C to stop.',
      '',
    ].join('\n'),
  );

  await new Promise<never>(() => {
    /* serve until interrupted */
  });
};

await main();
