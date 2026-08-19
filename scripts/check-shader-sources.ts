/**
 * Shader source hygiene: the objective facts about a `.vert`/`.frag`/`.wgsl`
 * file that no other gate is in a position to check.
 *
 * The existing gates cover meaning. Real GLSL compile/link and real WGSL
 * `getCompilationInfo` run in the browser lanes, both on the authored text and
 * on the production-stripped text; structural and pixel parity run beside them.
 * What none of them can see is a file that never reaches a compiler at all -
 * an orphan nothing imports, a placeholder no caller fills, a directive spelled
 * one character wrong - or a byte-level property the compiler does not care
 * about but the repository does.
 *
 * It is not a GLSL or WGSL parser and does not try to be one. Every rule here
 * is decidable from the text: an extension that disagrees with the content, an
 * empty file, a byte that has no business in source, a placeholder the runtime
 * substituter will not match, an `#exo-` directive nothing expands. Nothing
 * about how a shader should be written is enforced - whether `pow` is too
 * expensive or a branch is worth its divergence is a measurement, not a rule,
 * and a gate that guessed at it would be wrong per shader rather than per
 * repository.
 *
 * Run with no arguments to check every tracked shader.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { SHADER_EXTENSIONS, stripShaderSource } from '@codexo/exojs-build/shader-strip';

const REPO_ROOT = resolve(import.meta.dirname, '..');

/** Roots that hold engine-owned shaders and the modules importing them. */
const SCAN_ROOTS = ['src', 'packages'];

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', 'test-results', '__screenshots__']);

const IMPORTER_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs'];

/** GLSL ES 3.00 is the only profile the WebGL2 backend compiles. */
const GLSL_VERSION_DIRECTIVE = '#version 300 es';

/** Engine-owned `//`-prefixed directives, expanded at shader-build time. */
const KNOWN_EXO_DIRECTIVES = new Set(['#exo-include']);

/** What `fillShaderSource` will substitute: `{{NAME}}` with a word-character name. */
const VALID_PLACEHOLDER = /\{\{\w+\}\}/g;

/** Anything of the shape `{{…}}` at all, so a malformed one is still seen. */
const ANY_PLACEHOLDER = /\{\{[^}]*\}\}/g;

const EXO_DIRECTIVE_LINE = /^\s*\/\/\s*(#exo-[\w-]*)/;

interface Problem {
  readonly file: string;
  readonly line: number | null;
  readonly message: string;
}

async function collectFiles(root: string, keep: (name: string) => boolean): Promise<string[]> {
  const found: string[] = [];

  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) continue;

      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(path);
      } else if (keep(entry.name)) {
        found.push(path);
      }
    }
  };

  await walk(resolve(REPO_ROOT, root));

  return found;
}

/** What a mis-decoded file looks like once it has been read as UTF-8. */
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

/**
 * True for any C0/C1 control byte other than the tab, which is reported on its
 * own. Written as a code-point scan rather than a regular expression because a
 * character class of literal control bytes is unreadable in source and is
 * exactly what `no-control-regex` exists to prevent.
 */
function hasControlCharacter(line: string): boolean {
  for (let index = 0; index < line.length; index++) {
    const code = line.charCodeAt(index);

    if (code === 0x09) continue;
    if (code < 0x20 || code === 0x7f) return true;
  }

  return false;
}

const toRepoPath = (absolutePath: string): string => relative(REPO_ROOT, absolutePath).split(sep).join('/');

/**
 * Byte-level rules. A shader ships verbatim inside the bundle, so its bytes are
 * payload; and `.gitattributes` normalises the whole tree to LF, which a shader
 * has no exemption from.
 */
function checkBytes(file: string, text: string): Problem[] {
  const problems: Problem[] = [];
  const lines = text.split('\n');

  if (text.trim() === '') {
    problems.push({ file, line: null, message: 'file is empty' });

    return problems;
  }

  if (text.charCodeAt(0) === 0xfeff) {
    problems.push({ file, line: 1, message: 'starts with a byte-order mark' });
  }

  if (text.includes('\r')) {
    problems.push({ file, line: null, message: 'contains CR; the tree is LF-only' });
  }

  if (!text.endsWith('\n')) {
    problems.push({ file, line: lines.length, message: 'does not end with a newline' });
  }

  if (text.endsWith('\n\n')) {
    problems.push({ file, line: lines.length, message: 'ends with a blank line' });
  }

  lines.forEach((line, index) => {
    if (line.includes('\t')) {
      problems.push({ file, line: index + 1, message: 'contains a tab' });
    }

    if (line !== line.trimEnd()) {
      problems.push({ file, line: index + 1, message: 'has trailing whitespace' });
    }

    // The replacement character is what a mis-decoded file looks like from here;
    // a control byte is what a truncated or binary-contaminated one looks like.
    if (line.includes(REPLACEMENT_CHARACTER)) {
      problems.push({ file, line: index + 1, message: 'contains U+FFFD; the file is not valid UTF-8' });
    }

    if (hasControlCharacter(line)) {
      problems.push({ file, line: index + 1, message: 'contains a control character' });
    }
  });

  return problems;
}

/**
 * Extension/content agreement. A `.frag` without its version directive compiles
 * as GLSL ES 1.00 and fails on the first `in`; a `#version` line in a `.wgsl`
 * is a syntax error. Both are silent until a GPU sees them, and the file
 * extension is what every loader in the repository dispatches on.
 */
function checkLanguage(file: string, text: string): Problem[] {
  const problems: Problem[] = [];
  const isWgsl = file.endsWith('.wgsl');
  const firstLine = text.split('\n', 1)[0] ?? '';

  if (isWgsl) {
    if (text.includes('#version')) {
      problems.push({ file, line: null, message: 'contains a #version directive; WGSL has no preprocessor' });
    }

    return problems;
  }

  // A GLSL fragment meant for composition (an include body) legitimately has no
  // version line; only a file the backend compiles on its own needs one, and
  // those are exactly the ones declaring an entry point.
  if (/\bvoid\s+main\s*\(/.test(text) && firstLine.trim() !== GLSL_VERSION_DIRECTIVE) {
    problems.push({ file, line: 1, message: `declares main() but line 1 is not '${GLSL_VERSION_DIRECTIVE}'` });
  }

  return problems;
}

/**
 * Placeholders and directives: the two ways a shader can pass every compiler in
 * the suite and still be wrong, because the text that reaches the GPU is not the
 * text on disk.
 */
function checkSubstitutions(file: string, text: string): Problem[] {
  const problems: Problem[] = [];
  const valid = new Set(text.match(VALID_PLACEHOLDER) ?? []);

  for (const candidate of text.match(ANY_PLACEHOLDER) ?? []) {
    if (valid.has(candidate)) continue;

    problems.push({ file, line: null, message: `'${candidate}' does not match the {{NAME}} form fillShaderSource substitutes` });
  }

  text.split('\n').forEach((line, index) => {
    const directive = EXO_DIRECTIVE_LINE.exec(line)?.[1];

    if (directive !== undefined && !KNOWN_EXO_DIRECTIVES.has(directive)) {
      problems.push({ file, line: index + 1, message: `unknown engine directive '${directive}'` });
    }
  });

  return problems;
}

/**
 * Stripping runs on every production build and its output is what ships. A file
 * whose stripped form loses its version line, or strips to nothing, is a shader
 * that only works in development.
 */
function checkStripped(file: string, text: string): Problem[] {
  const stripped = stripShaderSource(text);

  if (stripped.trim() === '') {
    return [{ file, line: null, message: 'strips to nothing; the production build would ship an empty shader' }];
  }

  if (text.startsWith(GLSL_VERSION_DIRECTIVE) && !stripped.startsWith(GLSL_VERSION_DIRECTIVE)) {
    return [{ file, line: 1, message: 'loses its #version directive when stripped' }];
  }

  return [];
}

async function main(): Promise<void> {
  console.log('Checking shader source hygiene...\n');

  const shaderFiles = (await Promise.all(SCAN_ROOTS.map(root => collectFiles(root, name => SHADER_EXTENSIONS.some(ext => name.endsWith(ext)))))).flat();
  const importerFiles = (await Promise.all(SCAN_ROOTS.map(root => collectFiles(root, name => IMPORTER_EXTENSIONS.some(ext => name.endsWith(ext)))))).flat();
  const importerText = (await Promise.all(importerFiles.map(path => readFile(path, 'utf8')))).join('\n');

  const problems: Problem[] = [];

  for (const absolutePath of shaderFiles) {
    const file = toRepoPath(absolutePath);
    const text = await readFile(absolutePath, 'utf8');

    problems.push(...checkBytes(file, text), ...checkLanguage(file, text), ...checkSubstitutions(file, text), ...checkStripped(file, text));

    // Orphan detection by basename: an import specifier is relative, so the
    // filename is the only stable part of it. A shader nobody imports is dead
    // payload that every compile gate skips precisely because it is dead.
    const basename = file.slice(file.lastIndexOf('/') + 1);

    if (!importerText.includes(`/${basename}'`) && !importerText.includes(`/${basename}"`)) {
      problems.push({ file, line: null, message: 'is not imported by any module; an orphan shader reaches no compile gate' });
    }
  }

  if (problems.length > 0) {
    console.error(`\x1b[31m${problems.length} shader source problem(s):\x1b[0m`);

    for (const problem of problems) {
      console.error(`  ${problem.file}${problem.line === null ? '' : `:${problem.line}`}  ${problem.message}`);
    }

    process.exit(1);
  }

  console.log(`\x1b[32m${shaderFiles.length} shader file(s) checked, no problems.\x1b[0m`);
}

await main();
