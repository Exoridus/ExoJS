import { CliError } from './CliError.js';
import { readCliVersion } from './cliVersion.js';
import { ASSETS_USAGE, runAssetsPack } from './commands/assetsPack.js';
import { CREATE_USAGE, runCreate } from './commands/create.js';
import { DOCTOR_USAGE, runDoctor } from './commands/doctor.js';
import { runServe, SERVE_USAGE } from './commands/serve.js';

export const USAGE = `Usage: exo <command> [options]

Commands:
  serve [dir]            Serve a built app with the right content types and the
                         cross-origin isolation headers
  create [name]          Scaffold a new app
  doctor [dir]           Check an installed project's environment
  assets pack <manifest> Pack assets into an .exoa container

Options:
  -h, --help             Show this help, or a command's help after the command
  -v, --version          Print the version of this tool`;

const COMMAND_USAGE = new Map<string, string>([
  ['serve', SERVE_USAGE],
  ['create', CREATE_USAGE],
  ['doctor', DOCTOR_USAGE],
  ['assets', ASSETS_USAGE],
]);

const wantsHelp = (argv: readonly string[]): boolean => argv.includes('--help') || argv.includes('-h');

const runAssets = (argv: readonly string[]): number => {
  const subcommand = argv[0];

  if (subcommand === undefined) {
    throw new CliError('assets needs a subcommand', { hint: 'The only one is `exo assets pack <manifest>`.' });
  }

  if (subcommand !== 'pack') {
    throw new CliError(`unknown assets subcommand "${subcommand}"`, { hint: 'The only one is `exo assets pack <manifest>`.' });
  }

  return runAssetsPack(argv.slice(1));
};

/**
 * Run one `exo` invocation.
 *
 * `argv` excludes the executable and script path. Failures the caller can act on
 * are reported as a message on stderr and a non-zero result; anything else is
 * rethrown, because it is a defect in the tool rather than a usage error.
 *
 * @returns The process exit code.
 */
export const runCli = async (argv: readonly string[]): Promise<number> => {
  const [command, ...rest] = argv;

  if (command === undefined || (command.startsWith('-') && wantsHelp(argv))) {
    console.log(USAGE);

    return command === undefined ? 1 : 0;
  }

  if (command === '--version' || command === '-v') {
    console.log(readCliVersion());

    return 0;
  }

  const usage = COMMAND_USAGE.get(command);

  if (usage !== undefined && wantsHelp(rest)) {
    console.log(usage);

    return 0;
  }

  try {
    switch (command) {
      case 'serve':
        return await runServe(rest);
      case 'create':
        return await runCreate(rest);
      case 'doctor':
        return runDoctor(rest);
      case 'assets':
        return runAssets(rest);
      default:
        throw new CliError(`unknown command "${command}"`, { hint: 'Run `exo --help` to see the commands this tool accepts.' });
    }
  } catch (error: unknown) {
    if (!(error instanceof CliError)) throw error;

    console.error(`exo: ${error.message}`);

    if (error.hint !== undefined) console.error(error.hint);

    return error.exitCode;
  }
};
