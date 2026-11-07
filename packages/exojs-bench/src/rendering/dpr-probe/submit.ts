import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface SubmitPluginOptions {
  /** Directory the captures are written to. */
  readonly captureDir: string;
  /** Base for the repository-relative path echoed back to the page. */
  readonly repoRoot: string;
  /** Scheme the probe page is served over; the only scheme accepted in `Origin`. */
  readonly scheme: 'http' | 'https';
  /** Hostnames (no port) the page may be reached on: loopback plus the bound LAN addresses. */
  readonly allowedHostnames: readonly string[];
}

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
export interface SubmitRequest {
  readonly url?: string;
  readonly method?: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  on(event: 'data', listener: (chunk: Buffer) => void): void;
  on(event: 'end' | 'error', listener: () => void): void;
  destroy(): void;
}

/** Minimal surface of the Node response the submit middleware writes to. */
export interface SubmitResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}

const header = (request: SubmitRequest, name: string): string | undefined => {
  const value = request.headers[name];

  return Array.isArray(value) ? value[0] : value;
};

/** Hostname of a `Host` header value, brackets kept for IPv6 literals. */
const hostnameOf = (host: string): string => (host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]);

/**
 * Decide whether a submit comes from the probe page itself. Returns the HTTP
 * status to refuse with, or `undefined` to accept.
 *
 * The server binds every interface and sends no CORS headers, so the browser
 * only blocks a foreign page from READING the response, not from sending the
 * write. Pinning `Host` to known addresses defeats DNS rebinding (the rebound
 * page then carries an attacker hostname); requiring `Origin` (or, failing
 * that, `Referer`) to equal `<scheme>://<Host>` defeats cross-site form and
 * fetch posts. A non-JSON content type is refused because a cross-site form
 * can only send the simple types.
 *
 * Trust model: the LAN is trusted. There is no token, so any device on the
 * network that sets these headers by hand can still write a capture.
 */
const refusalStatus = (request: SubmitRequest, options: SubmitPluginOptions): number | undefined => {
  if (!/^application\/json\s*(;|$)/i.test(header(request, 'content-type') ?? '')) {
    return 415;
  }

  const host = header(request, 'host');

  if (host === undefined || !options.allowedHostnames.includes(hostnameOf(host).toLowerCase())) {
    return 403;
  }

  const expected = `${options.scheme}://${host.toLowerCase()}`;
  const origin = header(request, 'origin');

  if (origin !== undefined) {
    return origin.toLowerCase() === expected ? undefined : 403;
  }

  const referer = header(request, 'referer');

  try {
    return referer !== undefined && new URL(referer).origin.toLowerCase() === expected ? undefined : 403;
  } catch {
    return 403;
  }
};

/**
 * Mount `POST /submit`, which writes a capture straight into the repository.
 *
 * The alternative is copying 30 KB of JSON off a phone by hand, which is both
 * tedious and lossy. The endpoint exists only on this manually started dev
 * server, never in anything shipped.
 *
 * The filename is derived SERVER-SIDE from the parsed capture (its own
 * timestamp and device label, both slugged) and joined onto a fixed directory -
 * nothing the page sends can steer the write out of {@link options.captureDir}.
 */
export const submitPlugin = (options: SubmitPluginOptions): unknown => ({
  name: 'dpr-probe-submit',
  configureServer(server: {
    middlewares: { use: (handler: (request: SubmitRequest, response: SubmitResponse, next: () => void) => void) => void };
  }): void {
    server.middlewares.use((request, response, next) => {
      if (request.url !== '/submit' || request.method !== 'POST') {
        next();

        return;
      }

      const refusal = refusalStatus(request, options);

      if (refusal !== undefined) {
        response.statusCode = refusal;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ error: 'submit refused: not a same-origin JSON request from the probe page' }));

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

      request.on('error', () => {
        aborted = true;
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
        const device =
          typeof capture.deviceLabel === 'string' && capture.deviceLabel.trim().length > 0 ? slug(capture.deviceLabel) : 'unnamed-device';
        const target = join(options.captureDir, `${stamp}-${device}.json`);

        try {
          mkdirSync(options.captureDir, { recursive: true });
          writeFileSync(target, body, 'utf8');
        } catch (error) {
          // A throwing listener is outside connect's middleware try/catch and
          // would terminate the dev server without answering the phone.
          fail(500, `could not store the capture: ${error instanceof Error ? error.message : String(error)}`);

          return;
        }

        process.stdout.write(`\n  capture received: ${target}  (${capture.cells.length} cells)\n`);

        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ path: relative(options.repoRoot, target).replaceAll('\\', '/') }));
      });
    });
  },
});
