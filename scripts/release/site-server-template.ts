#!/usr/bin/env node
/**
 * Source of the `serve.mjs` shipped inside the site archive: `full-zip`
 * substitutes the base path below and transpiles this file to JavaScript, so
 * the artifact runs on any Node without a type-stripping flag.
 *
 * Serves the bundled ExoJS site from the directory it sits in.
 *
 *   node serve.mjs [port]
 *
 * A server is required - opening the pages over `file://` cannot work, because
 * the playground loads ES modules and an import map, which browsers refuse to
 * fetch from that scheme.
 *
 * The site is built for a hosted base path, so every URL inside it is prefixed
 * with that path while this directory holds the files flat. The prefix is
 * therefore stripped from incoming requests, and the printed URL includes it.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
// Rewritten by `full-zip` before the file ships; the empty base is a real case,
// so the guard below is not dead code despite the literal that stands here.
const BASE = '__SITE_BASE__';
const PORT = Number.parseInt(process.argv[2] ?? '', 10) || 4321;

const MIME: Readonly<Record<string, string>> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.fnt': 'text/xml',
  '.atlas': 'text/plain',
};

const server = createServer((request, response) => {
  try {
    let urlPath = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');

    if (BASE && urlPath.startsWith(BASE)) {
      urlPath = urlPath.slice(BASE.length) || '/';
    }

    let filePath = resolve(join(ROOT, urlPath));

    if (!filePath.startsWith(ROOT)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }

    if (!existsSync(filePath)) {
      response.writeHead(404);
      response.end(`Not found: ${urlPath}`);
      return;
    }

    response.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(readFileSync(filePath));
  } catch (error) {
    response.writeHead(500);
    response.end(String(error));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ExoJS site: http://127.0.0.1:${PORT}${BASE}/`);
  console.log(`Playground: http://127.0.0.1:${PORT}${BASE}/en/playground/`);
  console.log('Press Ctrl+C to stop.');
});
