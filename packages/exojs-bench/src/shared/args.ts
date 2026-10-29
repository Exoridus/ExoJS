/**
 * Minimal `--key=value` / `--key value` / `--flag` CLI parser (domain-agnostic).
 *
 * Shared across benchmark domains so the `--domain` selector and every domain's
 * own flags are parsed by one code path. Each domain interprets and validates
 * the flags it understands.
 */
const scan = (argv: readonly string[]): { entries: Array<[string, string]>; unclaimed: string[] } => {
  const args: Array<[string, string]> = [];
  const unclaimed: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === undefined) {
      continue;
    }

    if (!token.startsWith('--')) {
      unclaimed.push(token);
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

  return { entries: args, unclaimed };
};

const parseEntries = (argv: readonly string[]): Array<[string, string]> => scan(argv).entries;

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

/**
 * Tokens that are neither a flag nor the value of the flag before them.
 *
 * A flag takes at most one separate value, so `--rendering a.json b.json`
 * leaves `b.json` unclaimed. A command that accepts no positional arguments
 * should reject these rather than ignore them.
 */
export const unclaimedArgs = (argv: readonly string[]): string[] => scan(argv).unclaimed;

/**
 * One positive integer flag value, rejecting anything the matrix would turn into
 * an empty measurement. `Number.parseInt` accepts a numeric prefix (`1000abc`)
 * and does not reject zero or negatives, so it cannot be used for a count.
 */
export const parsePositiveInt = (flag: string, value: string): number => {
  if (!/^\d+$/.test(value) || Number.parseInt(value, 10) < 1) {
    throw new Error(`${flag} must be a positive integer (got '${value}').`);
  }

  return Number.parseInt(value, 10);
};
