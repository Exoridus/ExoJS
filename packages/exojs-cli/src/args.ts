import { CliError } from './CliError.js';

/** Whether an option stands alone or consumes the next argument. */
export type OptionKind = 'boolean' | 'value';

/** Option names a command accepts, without the leading dashes. */
export type OptionSpec = ReadonlyMap<string, OptionKind>;

/** What {@link parseArgs} produces: everything that was not an option, and every option that was set. */
export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly options: ReadonlyMap<string, string | true>;
}

/**
 * Parse `argv` against the options a command declares.
 *
 * Accepts `--name value`, `--name=value` and, for boolean options, a bare
 * `--name`. Everything else is a positional. An option the command does not
 * declare is an error rather than a silently ignored argument, because a
 * mistyped flag that changes nothing is indistinguishable from one that worked.
 *
 * @throws CliError on an unknown option, a value option with no value, or a
 * boolean option given one.
 */
export const parseArgs = (argv: readonly string[], spec: OptionSpec): ParsedArgs => {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  const rest = [...argv];

  while (rest.length > 0) {
    const arg = rest.shift() ?? '';

    if (!arg.startsWith('-') || arg === '-') {
      positionals.push(arg);
      continue;
    }

    const separator = arg.indexOf('=');
    const spelling = separator === -1 ? arg : arg.slice(0, separator);
    const name = spelling.replace(/^--?/, '');
    const inlineValue = separator === -1 ? undefined : arg.slice(separator + 1);
    const kind = spec.get(name);

    if (kind === undefined) {
      throw new CliError(`unknown option "${spelling}"`, { hint: 'Run `exo --help` to see the options this command accepts.' });
    }

    if (kind === 'boolean') {
      if (inlineValue !== undefined) {
        throw new CliError(`option "--${name}" takes no value`);
      }

      options.set(name, true);
      continue;
    }

    const value = inlineValue ?? rest.shift();

    if (value === undefined) {
      throw new CliError(`option "--${name}" expects a value`);
    }

    options.set(name, value);
  }

  return { positionals, options };
};

/** Whether a boolean option was given. */
export const flag = (args: ParsedArgs, name: string): boolean => args.options.get(name) === true;

/** A value option, or `fallback` when it was not given. */
export const text = (args: ParsedArgs, name: string, fallback: string): string => {
  const value = args.options.get(name);

  return typeof value === 'string' ? value : fallback;
};

/**
 * A value option parsed as a non-negative integer.
 *
 * @throws CliError when the value is not one, naming what was given.
 */
export const integer = (args: ParsedArgs, name: string, fallback: number): number => {
  const value = args.options.get(name);

  if (typeof value !== 'string') return fallback;

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError(`option "--${name}" expects a non-negative integer, got "${value}"`);
  }

  return parsed;
};
