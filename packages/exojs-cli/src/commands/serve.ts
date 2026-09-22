import { flag, integer, type OptionSpec, parseArgs, text } from '../args.js';
import { startStaticServer } from '../staticServer.js';

export const SERVE_USAGE = `Usage: exo serve [dir]

Serve an already-built ExoJS app over HTTP. Nothing is watched, bundled or
transformed - this serves a directory with the content types and the isolation
headers a built app needs.

Arguments:
  dir                          Directory to serve (default: the current directory)

Options:
  --port <n>                   Port to listen on (default: 4173; 0 picks a free one)
  --host <host>                Interface to bind (default: localhost)
  --no-spa                     Return 404 instead of index.html for a path with no file
  --no-cross-origin-isolation  Omit the COOP/COEP headers, for a page that embeds
                               third-party content unable to supply CORP. Without
                               them SharedArrayBuffer and the high-resolution
                               clock are unavailable.`;

const OPTIONS: OptionSpec = new Map([
  ['port', 'value'],
  ['host', 'value'],
  ['no-spa', 'boolean'],
  ['no-cross-origin-isolation', 'boolean'],
]);

/** Start the development server and print where it listens. Resolves once it is listening. */
export const runServe = async (argv: readonly string[]): Promise<number> => {
  const args = parseArgs(argv, OPTIONS);
  const server = await startStaticServer({
    root: args.positionals[0] ?? '.',
    port: integer(args, 'port', 4173),
    host: text(args, 'host', 'localhost'),
    spaFallback: !flag(args, 'no-spa'),
    crossOriginIsolation: !flag(args, 'no-cross-origin-isolation'),
  });

  console.log(`exo serve: ${server.url}`);

  if (flag(args, 'no-cross-origin-isolation')) {
    console.log('exo serve: cross-origin isolation is off; SharedArrayBuffer is unavailable.');
  }

  const shutdown = (): void => {
    void server.close().then(() => process.exit(0));
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return 0;
};
