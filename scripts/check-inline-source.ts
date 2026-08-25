/**
 * Blocks executable source code from being written into a string literal.
 *
 * Three kinds of code in this repository run outside the module that produced
 * them: AudioWorklet processors, Web Workers, and shaders. All three reach
 * their runtime as text, which used to mean they were authored as text - a
 * template literal full of JavaScript or GLSL, invisible to TypeScript, ESLint,
 * the formatter and every test that type-checks anything. The costs compound:
 * such a string cannot import, so whatever it needs gets transliterated beside
 * it and the two copies drift.
 *
 * All three now have a real source form. Worklets and workers are `*.worklet.ts`
 * / `*.worker.ts` modules bundled into a string by the build (see
 * `@codexo/exojs-build`); shaders are `.vert`/`.frag`/`.wgsl`
 * files inlined by the shader plugin. This gate keeps it that way, because the
 * old shape still works at runtime and would otherwise reappear unnoticed.
 *
 * It is deliberately not a regular expression over every string in the tree.
 * The file is parsed with the TypeScript compiler, so only real string and
 * template literals are inspected - never a comment, an identifier or JSX text
 * that happens to mention `registerProcessor` - and a literal is only reported
 * when it carries a marker that has no other meaning: the call that registers
 * an AudioWorklet processor, the worker global's message plumbing, a GLSL
 * version directive, a WGSL entry-point attribute.
 *
 * Shader text is scoped to engine-owned code: the core and package sources.
 * Accepting a caller-supplied shader string IS the public `ShaderFilter` API, so
 * examples, guides and tests write shader source into strings on purpose; a rule
 * that flagged those would be flagging the feature.
 *
 * Run over the whole tree by default; pass explicit paths to check a subset.
 */
import { readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SELF_PATH = fileURLToPath(import.meta.url);

/** Roots scanned when no explicit path is given. */
const SCAN_ROOTS = ['src', 'packages', 'examples', 'test', 'scripts', 'site/src'];

/** Path segments never worth scanning. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', 'test-results', '__screenshots__', 'templates']);

const SCANNABLE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/** A literal shorter than this cannot hold a meaningful module and is not worth the noise. */
const MINIMUM_INTERESTING_LENGTH = 60;

/**
 * A module spans lines. Prose does not - and prose is where these markers have a
 * second, innocent reading: a doc string explaining `registerProcessor(name, ctor)`,
 * an error message saying `self.postMessage()` is unavailable here. Requiring a
 * newline separates "this string talks about worker code" from "this string is
 * worker code" without weakening any marker.
 */
const isMultiLine = (text: string): boolean => text.includes('\n');

interface SourceKind {
  readonly label: string;
  /** Markers that identify this kind. Any one match is enough. */
  readonly markers: readonly RegExp[];
  /** Where this kind is banned; a path prefix match against the repo-relative path. */
  readonly scope: readonly string[] | 'everywhere';
  /** Prefixes carved back out of `scope`. */
  readonly except?: readonly string[];
  /** What to author instead. */
  readonly remedy: string;
}

const SOURCE_KINDS: readonly SourceKind[] = [
  {
    label: 'AudioWorklet',
    markers: [/\bregisterProcessor\s*\(/, /\bextends\s+AudioWorkletProcessor\b/],
    scope: 'everywhere',
    remedy: "author a '*.worklet.ts' module and import it through the '?worklet' query",
  },
  {
    label: 'Web Worker',
    markers: [/\bself\s*\.\s*onmessage\s*=/, /\bself\s*\.\s*postMessage\s*\(/, /\bself\s*\.\s*addEventListener\s*\(\s*['"`]message['"`]/],
    scope: 'everywhere',
    remedy: "author a '*.worker.ts' module and import it through the '?worker' query",
  },
  {
    label: 'shader',
    markers: [/#version\s+300\s+es/, /@(?:vertex|fragment|compute)\b/, /\bprecision\s+(?:low|medium|high)p\s+float\s*;/],
    scope: ['src/', 'packages/'],
    // The benchmark suite authors custom `SpriteMaterial` fragments the way any
    // consumer does. Accepting a caller-supplied shader string IS that API, so
    // it is measured here, not maintained here.
    except: ['packages/exojs-bench/'],
    remedy: "author a '.vert', '.frag' or '.wgsl' file and import it",
  },
];

/**
 * Literals that are legitimately source-as-data, with the reason each one is.
 * An entry is a claim that the string is not a module this repository maintains.
 */
const ALLOWED: readonly { readonly file: string; readonly reason: string }[] = [
  {
    file: 'scripts/check-inline-source.ts',
    reason: 'this gate names the markers it looks for',
  },
];

if (ALLOWED.some(entry => entry.reason.trim() === '')) {
  throw new Error('check-inline-source: every allowlist entry needs a reason.');
}

const isAllowed = (file: string): boolean => ALLOWED.some(entry => entry.file === file);

const inScope = (kind: SourceKind, file: string): boolean => {
  if (kind.except?.some(prefix => file.startsWith(prefix))) return false;

  return kind.scope === 'everywhere' || kind.scope.some(prefix => file.startsWith(prefix));
};

/**
 * A generated file restates its source and is not edited, so a violation in one
 * is a violation in the generator or in the module it inlined - both of which
 * are checked on their own. The example `.js` catalog is generated from `.ts`
 * siblings and carries the bundled worker string by design.
 */
const GENERATED_BANNER = /@generated|auto[- ]generated|do not edit/i;
const GENERATED_BANNER_LINES = 5;

const isGenerated = (text: string): boolean => GENERATED_BANNER.test(text.split('\n', GENERATED_BANNER_LINES).join('\n'));

/** Every string and template literal in `source`, with its 1-based line. */
const collectLiterals = (source: ts.SourceFile): { text: string; line: number }[] => {
  const literals: { text: string; line: number }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      // A template with substitutions still reads as one body of code; taking
      // the raw text of every span keeps an interpolated worker visible.
      const text = ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map(span => span.literal.text).join('\n') : node.text;

      literals.push({ text, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return literals;
};

const collectFiles = async (root: string): Promise<string[]> => {
  const absoluteRoot = resolve(REPO_ROOT, root);
  const found: string[] = [];

  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) continue;

      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(path);
      } else if (SCANNABLE_EXTENSIONS.some(extension => entry.name.endsWith(extension)) && path !== SELF_PATH) {
        found.push(path);
      }
    }
  };

  if (!statSync(absoluteRoot, { throwIfNoEntry: false })) return found;

  if (statSync(absoluteRoot).isDirectory()) {
    await walk(absoluteRoot);
  } else {
    found.push(absoluteRoot);
  }

  return found;
};

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly kind: SourceKind;
}

const checkFile = (absolutePath: string): Violation[] => {
  const file = relative(REPO_ROOT, absolutePath).split(sep).join('/');

  if (isAllowed(file)) return [];

  const text = readFileSync(absolutePath, 'utf8');

  if (isGenerated(text)) return [];

  const source = ts.createSourceFile(absolutePath, text, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  for (const literal of collectLiterals(source)) {
    if (literal.text.length < MINIMUM_INTERESTING_LENGTH || !isMultiLine(literal.text)) continue;

    for (const kind of SOURCE_KINDS) {
      if (!inScope(kind, file)) continue;
      if (!kind.markers.some(marker => marker.test(literal.text))) continue;

      violations.push({ file, line: literal.line, kind });
      break;
    }
  }

  return violations;
};

const main = async (): Promise<void> => {
  const requested = process.argv.slice(2);
  const roots = requested.length > 0 ? requested : SCAN_ROOTS;

  console.log(`Checking for executable source in string literals (${roots.join(', ')})...\n`);

  const files = (await Promise.all(roots.map(collectFiles))).flat();
  const violations = files.flatMap(checkFile);

  if (violations.length > 0) {
    console.error(`\x1b[31mExecutable source found in ${violations.length} string literal(s):\x1b[0m`);

    for (const violation of violations) {
      console.error(`  ${violation.file}:${violation.line}  ${violation.kind.label} source in a string literal - ${violation.kind.remedy}`);
    }

    console.error('\nA string literal is invisible to TypeScript, ESLint and the formatter, and cannot import.');
    process.exit(1);
  }

  console.log(`\x1b[32m${files.length} file(s) checked, no executable source in string literals.\x1b[0m`);
};

await main();
