import { afterEach, describe, expect, test, vi } from 'vitest';

import { flag, integer, type OptionSpec, parseArgs, text } from '../src/args';
import { runCli } from '../src/cli';
import { CliError } from '../src/CliError';
import { readCliVersion } from '../src/cliVersion';

const serveOptions: OptionSpec = new Map([
  ['port', 'value'],
  ['host', 'value'],
  ['no-spa', 'boolean'],
]);
const portOnly: OptionSpec = new Map([['port', 'value']]);
const spaOnly: OptionSpec = new Map([['no-spa', 'boolean']]);

const captureOutput = (): { out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];

  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => out.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => err.push(args.join(' ')));

  return { out, err };
};

afterEach(() => {
  vi.restoreAllMocks();
});

// A CLI's failure text is its interface: a caller reads it, not a stack trace,
// so the wording is asserted rather than merely the exit code.
describe('exo argument parsing', () => {
  test('collects positionals and both option spellings', () => {
    const args = parseArgs(['dist', '--port', '8080', '--host=0.0.0.0', '--no-spa'], serveOptions);

    expect(args.positionals).toEqual(['dist']);
    expect(text(args, 'port', '4173')).toBe('8080');
    expect(text(args, 'host', 'localhost')).toBe('0.0.0.0');
    expect(flag(args, 'no-spa')).toBe(true);
  });

  test('an option the command does not declare is an error, not a silent no-op', () => {
    expect(() => parseArgs(['--porrt', '8080'], portOnly)).toThrow(CliError);
    expect(() => parseArgs(['--porrt', '8080'], portOnly)).toThrow('unknown option "--porrt"');
  });

  test('a value option with no value names the option', () => {
    expect(() => parseArgs(['--port'], portOnly)).toThrow('option "--port" expects a value');
  });

  test('a boolean option given a value names the option', () => {
    expect(() => parseArgs(['--no-spa=yes'], spaOnly)).toThrow('option "--no-spa" takes no value');
  });

  test('a non-integer port reports what was given', () => {
    const args = parseArgs(['--port', 'eighty'], portOnly);

    expect(() => integer(args, 'port', 4173)).toThrow('option "--port" expects a non-negative integer, got "eighty"');
  });

  test('falls back when an option is absent', () => {
    const args = parseArgs([], portOnly);

    expect(integer(args, 'port', 4173)).toBe(4173);
    expect(flag(args, 'port')).toBe(false);
  });
});

describe('exo command dispatch', () => {
  test('no command prints the usage and fails', async () => {
    const { out } = captureOutput();

    await expect(runCli([])).resolves.toBe(1);
    expect(out.join('\n')).toContain('Usage: exo <command>');
  });

  test('--help prints the usage and succeeds', async () => {
    const { out } = captureOutput();

    await expect(runCli(['--help'])).resolves.toBe(0);
    expect(out.join('\n')).toContain('assets pack <manifest>');
  });

  test('--version prints this package version', async () => {
    const { out } = captureOutput();

    await expect(runCli(['--version'])).resolves.toBe(0);
    expect(out).toEqual([readCliVersion()]);
  });

  test('an unknown command names it and points at --help', async () => {
    const { err } = captureOutput();

    await expect(runCli(['frobnicate'])).resolves.toBe(1);
    expect(err).toEqual(['exo: unknown command "frobnicate"', 'Run `exo --help` to see the commands this tool accepts.']);
  });

  test('a command help flag prints that command help', async () => {
    const { out } = captureOutput();

    await expect(runCli(['serve', '--help'])).resolves.toBe(0);
    expect(out.join('\n')).toContain('--no-cross-origin-isolation');
  });

  test('assets with no subcommand says which one exists', async () => {
    const { err } = captureOutput();

    await expect(runCli(['assets'])).resolves.toBe(1);
    expect(err).toEqual(['exo: assets needs a subcommand', 'The only one is `exo assets pack <manifest>`.']);
  });

  test('an unknown assets subcommand names it', async () => {
    const { err } = captureOutput();

    await expect(runCli(['assets', 'unpack'])).resolves.toBe(1);
    expect(err[0]).toBe('exo: unknown assets subcommand "unpack"');
  });
});
