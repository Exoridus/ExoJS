import { runScaffolder, TEMPLATES } from 'create-exo-app';

export const CREATE_USAGE = `Usage: exo create [name]

Scaffold a new ExoJS app. Identical to \`npm create exo-app\`: both run the same
scaffolder over the same templates.

Arguments:
  name                 Project directory (prompted for when omitted on a TTY)

Options:
  -t, --template <t>   One of: ${TEMPLATES.join(', ')} (default: minimal)
  -f, --force          Scaffold into a directory that already has files in it`;

/**
 * Scaffold a new app.
 *
 * Arguments are handed to the scaffolder verbatim, so `exo create` and
 * `npm create exo-app` accept exactly the same grammar.
 */
export const runCreate = async (argv: readonly string[]): Promise<number> => {
  await runScaffolder(argv);

  return 0;
};
