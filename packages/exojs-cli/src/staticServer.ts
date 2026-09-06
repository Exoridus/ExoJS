import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join, resolve, sep } from 'node:path';

import { CliError } from './CliError.js';
import { contentTypeFor } from './contentTypes.js';

/** How {@link startStaticServer} serves a directory. */
export interface StaticServerOptions {
  /** Directory to serve, resolved against the current working directory. */
  readonly root: string;
  /** Port to listen on. `0` picks a free one, which the returned server reports. */
  readonly port?: number;
  /** Interface to bind. The default stays on the loopback address. */
  readonly host?: string;
  /** Serve `index.html` for a path that matches no file. Defaults to `true`. */
  readonly spaFallback?: boolean;
  /**
   * Send `Cross-Origin-Opener-Policy: same-origin` and
   * `Cross-Origin-Embedder-Policy: require-corp`. Defaults to `true`, which is
   * what makes `SharedArrayBuffer` and a high-resolution clock available. Turn
   * it off for a page that embeds third-party content unable to supply CORP.
   */
  readonly crossOriginIsolation?: boolean;
}

/** A listening {@link startStaticServer}. */
export interface StaticServer {
  /** The address to open, with the port actually bound. */
  readonly url: string;
  readonly port: number;
  /** Stops listening and waits for the open connections to finish. */
  close(): Promise<void>;
}

const DEFAULT_PORT = 4173;
const DEFAULT_HOST = 'localhost';

const readBody = async (filePath: string): Promise<Buffer> => readFile(filePath);

const isFile = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await stat(filePath);

    return stats.isFile();
  } catch {
    return false;
  }
};

/**
 * Map a request path to a file inside `root`, or `null` when it escapes.
 *
 * A percent-encoded `..` decodes to a real traversal, so the check is made
 * against the resolved path rather than against the request text.
 */
const resolveWithinRoot = (root: string, pathname: string): string | null => {
  let decoded: string;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const target = resolve(root, `.${decoded.startsWith('/') ? decoded : `/${decoded}`}`);

  return target === root || target.startsWith(root + sep) ? target : null;
};

/**
 * Serve `root` over HTTP for an already-built application.
 *
 * This is a file server, not a toolchain: nothing is watched, bundled or
 * transformed. What it does add over a generic static server is the content
 * types the engine's own formats need and the cross-origin isolation headers.
 *
 * @throws CliError when `root` is not a directory, or when the port is taken.
 */
export const startStaticServer = async (options: StaticServerOptions): Promise<StaticServer> => {
  const root = resolve(options.root);
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  const spaFallback = options.spaFallback ?? true;
  const crossOriginIsolation = options.crossOriginIsolation ?? true;

  try {
    const stats = await stat(root);

    if (!stats.isDirectory()) {
      throw new CliError(`"${options.root}" is not a directory`);
    }
  } catch (error: unknown) {
    if (error instanceof CliError) throw error;

    throw new CliError(`cannot serve "${options.root}": the directory does not exist`, {
      hint: 'Build the app first, then point `exo serve` at its output directory.',
      cause: error,
    });
  }

  const indexPath = join(root, 'index.html');

  const send = (response: ServerResponse, status: number, body: Buffer, contentType: string, headOnly: boolean): void => {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Length', body.byteLength);
    // A development server that lets a browser cache is a development server
    // that serves yesterday's build after a rebuild.
    response.setHeader('Cache-Control', 'no-store');

    if (crossOriginIsolation) {
      response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }

    response.writeHead(status);
    response.end(headOnly ? undefined : body);
  };

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method ?? 'GET';

    if (method !== 'GET' && method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      response.writeHead(405);
      response.end();

      return;
    }

    const headOnly = method === 'HEAD';
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const target = resolveWithinRoot(root, pathname);

    if (target === null) {
      send(response, 403, Buffer.from('Forbidden'), 'text/plain; charset=utf-8', headOnly);

      return;
    }

    const candidate = pathname.endsWith('/') ? join(target, 'index.html') : target;

    if (await isFile(candidate)) {
      send(response, 200, await readBody(candidate), contentTypeFor(candidate), headOnly);

      return;
    }

    if (spaFallback && (await isFile(indexPath))) {
      // A client-side route has no file of its own; the app resolves it once
      // the document has booted.
      send(response, 200, await readBody(indexPath), contentTypeFor(indexPath), headOnly);

      return;
    }

    send(response, 404, Buffer.from('Not Found'), 'text/plain; charset=utf-8', headOnly);
  };

  const server: Server = createServer((request, response) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.writeHead(500);
      }

      response.end('Internal Server Error');
    });
  });

  const boundPort = await new Promise<number>((resolvePort, rejectPort) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      rejectPort(
        error.code === 'EADDRINUSE'
          ? new CliError(`port ${port} is already in use`, { hint: 'Pass --port with a free port, or --port 0 to let the system pick one.', cause: error })
          : error,
      );
    });

    server.listen(port, host, () => {
      const address = server.address();

      resolvePort(typeof address === 'object' && address !== null ? address.port : port);
    });
  });

  return {
    url: `http://${host}:${boundPort}/`,
    port: boundPort,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close(error => (error ? rejectClose(error) : resolveClose()));
        server.closeAllConnections();
      }),
  };
};
