import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const TEMPLATES = ['minimal', 'game-starter', 'audio-reactive'] as const;
type TemplateName = (typeof TEMPLATES)[number];

const TEMPLATE_DESCRIPTIONS: Record<TemplateName, string> = {
  'minimal': 'smallest TypeScript ExoJS app with one Scene and one visible object',
  'game-starter': 'keyboard-controlled game loop starter with Scene structure',
  'audio-reactive': 'AudioAnalyser-driven shapes and animations',
};

function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}

function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptProjectName(): Promise<string> {
  const answer = await prompt('Project name: ');

  if (!answer) {
    console.error('Error: project name cannot be empty.');
    process.exit(1);
  }

  return answer;
}

async function promptTemplate(): Promise<TemplateName> {
  console.log('\nWhich template?');
  for (let i = 0; i < TEMPLATES.length; i++) {
    const t = TEMPLATES[i];
    const marker = i === 0 ? '❯' : ' ';
    console.log(`  ${marker} ${(i + 1).toString()}) ${t.padEnd(16)} — ${TEMPLATE_DESCRIPTIONS[t]}`);
  }

  const answer = await prompt('\nEnter number or name [1]: ');

  if (!answer || answer === '1') return 'minimal';

  const num = parseInt(answer, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= TEMPLATES.length) {
    return TEMPLATES[num - 1];
  }

  const matched = TEMPLATES.find(t => t === answer);
  if (matched) return matched;

  console.error(`Unknown template: "${answer}". Using "minimal".`);
  return 'minimal';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let projectName = '';
  let templateArg: string | null = null;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--template' || arg === '-t') {
      templateArg = args[++i] ?? null;
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

  const destDir = resolve(process.cwd(), projectName);

  if (existsSync(destDir)) {
    const entries = readdirSync(destDir);
    if (entries.length > 0 && !force) {
      console.error(`Error: directory "${projectName}" already exists and is not empty.`);
      console.error('Use --force to overwrite.');
      process.exit(1);
    }
  }

  // Locate templates relative to dist/index.js (one level up)
  const templateDir = join(__dirname, '..', 'templates', template);

  mkdirSync(destDir, { recursive: true });
  cpSync(templateDir, destDir, { recursive: true });

  // Set package name to the project directory's basename
  const pkgPath = join(destDir, 'package.json');
  const pkgContent = readFileSync(pkgPath, 'utf-8');
  const pkgJson = JSON.parse(pkgContent) as Record<string, unknown>;
  pkgJson['name'] = basename(projectName);
  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');

  console.log(`\nDone.\n`);
  console.log(`Next steps:`);
  console.log(`  cd ${projectName}`);
  console.log(`  npm install`);
  console.log(`  npm run dev`);
  console.log('');
}

main().catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
