import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/**
 * The scaffolder behind `npm create exo-app` and `exo create`.
 *
 * Both entry points call {@link runScaffolder}, so they cannot drift: there is
 * one argument grammar, one prompt sequence and one set of templates, shipped
 * in this package.
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** Template names in the order the interactive picker lists them; the first is the default. */
export const TEMPLATES = ['minimal', 'game-starter', 'audio-reactive'] as const;

export type TemplateName = (typeof TEMPLATES)[number];

/** One-line summary per template, as shown by the interactive picker. */
export const TEMPLATE_DESCRIPTIONS: Record<TemplateName, string> = {
  minimal: 'smallest TypeScript ExoJS app with one Scene and one visible object',
  'game-starter': 'keyboard-controlled game loop starter with Scene structure',
  'audio-reactive': 'AudioAnalyser-driven shapes and animations',
};

/** Absolute path of a template's source directory inside this package. */
export const templateDirectory = (template: TemplateName): string => join(__dirname, '..', 'templates', template);

const isInteractive = (): boolean => {
  return process.stdin.isTTY === true;
};

const prompt = (question: string): Promise<string> => {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

const promptProjectName = async (): Promise<string> => {
  const answer = await prompt('Project name: ');

  if (!answer) {
    console.error('Error: project name cannot be empty.');
    process.exit(1);
  }

  return answer;
};

const promptTemplate = async (): Promise<TemplateName> => {
  console.log('\nWhich template?');
  TEMPLATES.forEach((t, i) => {
    const marker = i === 0 ? '❯' : ' ';
    console.log(`  ${marker} ${(i + 1).toString()}) ${t.padEnd(16)} — ${TEMPLATE_DESCRIPTIONS[t]}`);
  });

  const answer = await prompt('\nEnter number or name [1]: ');

  if (!answer || answer === '1') return 'minimal';

  const num = parseInt(answer, 10);
  const byNumber = Number.isNaN(num) ? undefined : TEMPLATES[num - 1];
  if (byNumber) return byNumber;

  const matched = TEMPLATES.find(t => t === answer);
  if (matched) return matched;

  console.error(`Unknown template: "${answer}". Using "minimal".`);
  return 'minimal';
};

/** What {@link scaffoldApp} needs: where to write, which template, and whether a non-empty target is allowed. */
export interface ScaffoldOptions {
  /** Project directory, resolved against the current working directory. */
  readonly projectName: string;
  readonly template: TemplateName;
  /** Overwrite into a directory that already has files in it. */
  readonly force?: boolean;
}

/**
 * Copy a template into `projectName` and set the generated `package.json` name
 * to the target directory's basename.
 *
 * Exits the process with a message when the target exists, is not empty and
 * `force` is not set.
 *
 * @returns The absolute path of the created project directory.
 */
export const scaffoldApp = (options: ScaffoldOptions): string => {
  const { projectName, template, force = false } = options;
  const destDir = resolve(process.cwd(), projectName);

  if (existsSync(destDir)) {
    const entries = readdirSync(destDir);
    if (entries.length > 0 && !force) {
      console.error(`Error: directory "${projectName}" already exists and is not empty.`);
      console.error('Use --force to overwrite.');
      process.exit(1);
    }
  }

  mkdirSync(destDir, { recursive: true });
  cpSync(templateDirectory(template), destDir, { recursive: true });

  const pkgPath = join(destDir, 'package.json');
  const pkgContent = readFileSync(pkgPath, 'utf-8');
  const pkgJson = JSON.parse(pkgContent) as Record<string, unknown>;
  pkgJson.name = basename(projectName);
  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');

  return destDir;
};

/**
 * Run the scaffolder end to end: parse `argv`, prompt for anything missing when
 * attached to a TTY, copy the template and print the next steps.
 *
 * `argv` excludes the executable and script path. Exits the process on a usage
 * error rather than throwing, so a caller does not have to translate one.
 */
export const runScaffolder = async (argv: readonly string[]): Promise<void> => {
  let projectName = '';
  let templateArg: string | null = null;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--template' || arg === '-t') {
      templateArg = argv[++i] ?? null;
    } else if (arg === '--force' || arg === '-f') {
      force = true;
    } else if (!arg.startsWith('-')) {
      projectName = arg;
    }
  }

  if (!projectName) {
    if (!isInteractive()) {
      console.error('Error: project name is required in non-interactive mode.');
      console.error('Usage: create-exo-app <project-name> [--template minimal|game-starter|audio-reactive]');
      process.exit(1);
    }
    projectName = await promptProjectName();
  }

  let template: TemplateName;
  if (templateArg !== null) {
    if (!(TEMPLATES as readonly string[]).includes(templateArg)) {
      console.error(`Error: unknown template "${templateArg}".`);
      console.error(`Valid templates: ${TEMPLATES.join(', ')}`);
      process.exit(1);
    }
    template = templateArg as TemplateName;
  } else if (isInteractive()) {
    template = await promptTemplate();
  } else {
    template = 'minimal';
  }

  scaffoldApp({ projectName, template, force });

  console.log(`\nDone.\n`);
  console.log(`Next steps:`);
  console.log(`  cd ${projectName}`);
  console.log(`  npm install`);
  console.log(`  npm run dev`);
  console.log('');
};
