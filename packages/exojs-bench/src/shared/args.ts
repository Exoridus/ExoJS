/**
 * Minimal `--key=value` / `--key value` / `--flag` CLI parser (domain-agnostic).
 *
 * Shared across benchmark domains so the `--domain` selector and every domain's
 * own flags are parsed by one code path. Returns a plain string map; each domain
 * interprets and validates the flags it understands.
 */
export const parseArgs = (argv: readonly string[]): Map<string, string> => {
  const args = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token?.startsWith('--') !== true) {
      continue;
    }

    const body = token.slice(2);
    const equals = body.indexOf('=');

    if (equals >= 0) {
      args.set(body.slice(0, equals), body.slice(equals + 1));
    } else {
      const next = argv[i + 1];

      if (next !== undefined && !next.startsWith('--')) {
        args.set(body, next);
        i++;
      } else {
        args.set(body, 'true');
      }
    }
  }

  return args;
};
