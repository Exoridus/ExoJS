/**
 * Content types the development server answers with.
 *
 * Three of these are the reason the server exists at all. A generic static
 * server labels an unknown extension `application/octet-stream`, and the
 * browser then refuses the response rather than guessing:
 * `WebAssembly.instantiateStreaming` rejects anything that is not
 * `application/wasm`, a KTX2 texture fetched as a generic blob loses the type
 * a transcoder dispatches on, and an `.exoa` container reads as an opaque
 * download instead of engine data.
 */
const CONTENT_TYPES = new Map<string, string>([
  ['.avif', 'image/avif'],
  ['.bin', 'application/octet-stream'],
  ['.css', 'text/css; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.exoa', 'application/vnd.exojs.container'],
  ['.frag', 'text/plain; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.glsl', 'text/plain; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.ktx2', 'image/ktx2'],
  ['.m4a', 'audio/mp4'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.otf', 'font/otf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.vert', 'text/plain; charset=utf-8'],
  ['.vtt', 'text/vtt; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.wgsl', 'text/plain; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

/** What an unrecognised extension is served as. */
export const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** The `Content-Type` for a file path, matched on its extension, case-insensitively. */
export const contentTypeFor = (filePath: string): string => {
  const dot = filePath.lastIndexOf('.');
  const extension = dot === -1 ? '' : filePath.slice(dot).toLowerCase();

  return CONTENT_TYPES.get(extension) ?? DEFAULT_CONTENT_TYPE;
};
