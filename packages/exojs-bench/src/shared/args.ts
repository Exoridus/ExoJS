/**
 * Minimal `--key=value` / `--key value` / `--flag` CLI parser (domain-agnostic).
 *
 * Shared across benchmark domains so the `--domain` selector and every domain's
 * own flags are parsed by one code path. Each domain interprets and validates
 * the flags it understands.
 */
const parseEntries = (argv: readonly string[]): Array<[string, string]> => {
  const args: Array<[string, string]> = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token?.startsWith('--') !== true) {
      continue;
    }

    const body = token.slice(2);
    const equals = body.indexOf('=');

    if (equals !== -1) {
      args.push([body.slice(0, equals), body.slice(equals + 1)]);
    } else {
      const next = argv[i + 1];

      if (next !== undefined && !next.startsWith('--')) {
        args.push([body, next]);
        i++;
      } else {
        args.push([body, 'true']);
      }
    }
  }

  return args;
};

/** Parsed flags, last occurrence winning - the behaviour a single-valued flag wants. */
export const parseArgs = (argv: readonly string[]): Map<string, string> => new Map(parseEntries(argv));

/**
 * Every value given for one repeatable flag, in the order it appeared.
 *
 * A flag a caller may repeat - one results path per benchmark run - needs all
 * of its values, and the order is the run order the output reports. Values are
 * taken whole, so a path containing a comma or a space survives.
 */
export const parseArgList = (argv: readonly string[], key: string): string[] =>
  parseEntries(argv)
    .filter(([name]) => name === key)
    .map(([, value]) => value);
