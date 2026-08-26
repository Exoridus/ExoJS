/**
 * Keeps JavaScript out of the repository except where something outside the
 * TypeScript toolchain has to read the file itself.
 *
 * A `.js` or `.mjs` is not merely a style choice here: it is a file that no
 * `tsconfig` includes by default, so it lands outside every type-check gate at
 * the moment it is written and stays there silently. The tooling trees have
 * been through exactly that twice, and the fix each time was to notice the file
 * at all. This gate is the notice.
 *
 * The default is TypeScript everywhere, including programs that run with no
 * compiler behind them - node strips the types itself, so "it has to run under
 * bare node" is not a reason to author JavaScript. What remains are files a
 * foreign tool loads directly, which is why every exemption below names the
 * tool rather than a preference.
 *
 * Both directions fail. A new unexempted JavaScript file fails, and so does an
 * exemption that matches nothing: an allowlist nobody prunes is how a rule
 * quietly becomes untrue.
 *
 * Untracked files count, as long as git does not ignore them. Build output is
 * ignored and therefore invisible here; a freshly written source file is not,
 * and is caught before it is ever committed.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

const JAVASCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx'];

interface Exemption {
  /** Repository-relative path; a trailing slash matches the whole subtree. */
  readonly path: string;
  /** What loads these files in a form TypeScript cannot be handed to. */
  readonly reason: string;
}

const EXEMPTIONS: readonly Exemption[] = [
  {
    path: 'examples/',
    reason: 'the playground catalog: `.ts` sources plus the `.js` twins the transpiler emits and `examples:sync:check` keeps in step',
  },
  {
    path: 'packages/exojs-config/',
    reason: 'shared presets that ESLint, Prettier, Vitest and Rolldown load at runtime, typed through JSDoc under `checkJs` (see tsconfig.scripts.json)',
  },
  {
    path: 'site/public/brand/svgo.config.js',
    reason: 'read by the `svgo` CLI, which loads a config module and understands no TypeScript',
  },
];

// A `never` return only ends control flow for the caller when the callee is a
// function declaration or a constant with an explicit type annotation.
type Abort = (message: string) => never;

const fail: Abort = message => {
  console.error(message);
  process.exit(1);
};

const isJavaScript = (file: string): boolean => JAVASCRIPT_EXTENSIONS.some(extension => file.endsWith(extension));

const matches = (exemption: Exemption, file: string): boolean => (exemption.path.endsWith('/') ? file.startsWith(exemption.path) : file === exemption.path);

/** Tracked plus untracked-but-not-ignored files, so a stray lands here before it is committed. */
const listFiles = (): string[] =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(file => file.length > 0);

const javaScriptFiles = listFiles().filter(isJavaScript);

if (javaScriptFiles.length === 0) {
  fail('lint:js-files: found no JavaScript at all, which the exemptions below say is impossible - the scan itself is broken, not the tree.');
}

const unexempted = javaScriptFiles.filter(file => !EXEMPTIONS.some(exemption => matches(exemption, file)));
const stale = EXEMPTIONS.filter(exemption => !javaScriptFiles.some(file => matches(exemption, file)));

if (unexempted.length > 0) {
  fail(
    [
      `lint:js-files: ${unexempted.length} JavaScript file(s) outside every recorded exemption.`,
      '',
      ...unexempted.map(file => `    ${file}`),
      '',
      'Nothing type-checks these. Resolve each by:',
      '',
      '  1. Renaming it to `.ts`. This is almost always the answer, including for',
      '     scripts that run under bare node with no install behind them - node',
      '     strips the types itself, so keep the syntax erasable (no enums, no',
      '     parameter properties) and add it to the matching tsconfig program.',
      '',
      '  2. Adding an exemption in scripts/check-javascript-files.ts naming the tool',
      '     that loads the file and cannot be handed TypeScript. A preference is not',
      '     a tool.',
    ].join('\n'),
  );
}

if (stale.length > 0) {
  fail(
    [
      `lint:js-files: ${stale.length} exemption(s) match no file any more.`,
      '',
      ...stale.map(exemption => `    ${exemption.path}`),
      '',
      'Nothing is broken - the allowlist just needs pruning, so it keeps describing',
      'the tree it claims to describe. Delete them from scripts/check-javascript-files.ts.',
    ].join('\n'),
  );
}

console.log(`\x1b[32mlint:js-files: ${javaScriptFiles.length} JavaScript file(s), all inside ${EXEMPTIONS.length} recorded exemption(s).\x1b[0m`);
