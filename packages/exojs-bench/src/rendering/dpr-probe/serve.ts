import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
