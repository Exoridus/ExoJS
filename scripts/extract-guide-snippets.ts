/**
 * Extracts TypeScript/JavaScript code blocks from guide MDX files and writes
 * them as standalone .ts files into .workspace/generated/guide-typecheck/ for
 * typechecking via `pnpm typecheck:guides`.
 *
 * Skip conventions (applied inside the guide MDX source):
 *   - Fence with `no-check` meta:  ```ts no-check
 *     Marks the block as intentionally untypeable — partial snippets, prose
 *     illustrations, or temporarily stale API. Use sparingly.
 *   - Blocks without any `import` statement, that are also not recognized as
 *     a bare method/fragment (see below), are skipped automatically as
 *     partial/context-free snippets (object literals, mid-expression
 *     fragments, etc.).
 *
 * Two extraction strategies:
 *
 * 1. STANDALONE — a block with its own `import` line(s), not shaped like a
 *    bare class-method body. Written verbatim to its own output file, one
 *    file per block (`isStandaloneSnippet`, unchanged from the original
 *    extractor).
 *
 * 2. BARE — a block with no import, whose first real line either looks like
 *    a class-method declaration (`update(delta) {`, `async load(loader) {`)
 *    or a raw `this.*` statement/control-flow fragment shown without its
 *    enclosing class. These are guide-prose illustrations of "one hook of
 *    the scene you already built two paragraphs ago" and are the most common
 *    shape in the guide — until this fix they were silently skipped, so a
 *    guide could reference `this.bunny` in a bare `update()` block forever
 *    without any type-checker ever seeing it (see the "your-first-scene.mdx"
 *    incident this fix closes).
 *
 *    All BARE blocks belonging to the same MDX file are merged into ONE
 *    synthetic class per file, so a field assigned in one bare block's
 *    `init()` is known to a later bare block's `update()` — exactly how the
 *    guide narrates it. How strictly `this.*` access is checked depends on
 *    whether the page embeds a real example class:
 *
 *    ANCHORED — the chapter embeds a real, fully-typed class via
 *    `<SourceSnippet source=".." region=".." />` (the common "one real
 *    example, several follow-up hook snippets" pattern). The bare blocks are
 *    spliced directly into that real class (the best-covering class among
 *    the region and the referenced file's classes — see `findAnchor`), so
 *    `this.sprite` is checked against the actual `private sprite!: Sprite`
 *    field of the example. A `this.bunny` that the example never declares is
 *    a hard error — the F8 bug class ("prose snippet contradicts the very
 *    example it explains") this gate exists to catch. Fields the page
 *    assigns in other snippets are mined page-wide (`mineAssignedFields`)
 *    and declared `any` so legitimate cross-snippet narrative still
 *    resolves.
 *
 *    UNANCHORED — no example class on the page. Narrative shorthand
 *    (`this.player`, `this.world`, ... introduced only in prose) is
 *    pervasive there and indistinguishable from a typo, so the synthetic
 *    shell carries a `[key: string]: any` index signature: `this.*` member
 *    EXISTENCE is not checked, but everything else still is — engine
 *    imports (renamed/removed exports fail), the inherited Scene API
 *    (`this.app`, `this.loader`, `this.inputs` keep their real types), and
 *    all argument/assignment typing against those APIs (this is how
 *    `Keyboard.Plus` and the read-only `scene.ui` reassignment were caught).
 *
 *    Free identifiers the bare blocks reference without declaring (`loader`,
 *    `delta`, `app`, a bare `sprite` used as shorthand for "your sprite",
 *    etc.) are intentionally NOT type-checked — that's an established guide
 *    convention (see CONTEXT_VAR_RE below), not a bug class this gate
 *    targets. They're declared as `any` (`var x;`, plus a merging
 *    `type X = any;` for PascalCase names used in type position) so they
 *    resolve without noise. Bare `PascalCase` identifiers that resolve to a
 *    real `@codexo/exojs` export are imported for real (so a renamed/removed
 *    export still gets caught); anything else (extension-package types like
 *    `BeatDetector`, or guide-local placeholder class names like
 *    `GameScene`) also falls back to `any`.
 *
 * Output location: .workspace/generated/guide-typecheck/ (gitignored).
 * Each file is named after its source MDX path (and block index, for
 * standalone blocks) and carries a header comment mapping back to the
 * original guide location.
 */

import { mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const REPO_ROOT = join(import.meta.dirname, '..');
const GUIDE_DIR = join(REPO_ROOT, 'site', 'src', 'content', 'guide');
const SRC_DIR = join(REPO_ROOT, 'src');
const OUT_DIR = join(REPO_ROOT, '.workspace', 'generated', 'guide-typecheck');

const CHECKED_LANGS = new Set(['ts', 'tsx', 'typescript', 'js', 'javascript']);

// Matches a fenced code block. Group "lang" = language tag, "meta" = rest of
// the opening fence line, "body" = the block content (without the fences).
const FENCE_RE = /^```(?<lang>[a-zA-Z]+)?(?<meta>[^\n]*)?\n(?<body>[\s\S]*?)^```/gm;

// Bare-method prefixes that indicate a snippet is a class method body shown
// without its enclosing class — these snippets cannot be compiled standalone
// without a wrapper. This shape also matches control-flow fragments shown in
// isolation (`if (pad.canVibrate) {`) — both are handled by the BARE path.
const BARE_METHOD_RE = /^(?:async\s+|override\s+)?[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/;
const TOPLEVEL_KEYWORD_RE = /^(?:class|function|const|let|var|export|type|interface|new|document|window)\b/;

// JS/TS control-flow keywords: BARE_METHOD_RE also matches `if (...) {` etc.
// (an identifier followed by "(") — these are raw statement fragments, not
// method declarations, so they get wrapped in a synthetic method rather than
// spliced verbatim as a class member.
const CONTROL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'try', 'catch', 'else', 'do', 'function', 'return', 'with']);

// Variable names that guide authors typically reference from surrounding
// prose context without re-declaring in the snippet itself.
// Note: `backend` and `context` are intentionally excluded — they appear as
// named method parameters inside class bodies, not as external context vars.
// `app` is included because standalone snippets always declare it explicitly
// via `const app = new Application(...)`.
const CONTEXT_VAR_RE = /\b(loader|delta|texture|sheet|spritesheetJson|app)\b/g;

// Reserved words and common ambient globals excluded when scanning BARE
// blocks for free identifiers that need a fallback `var x;` declaration
// (see `collectFreeIdentifiers`). Not exhaustive — false negatives here just
// mean an extra unused `var` that costs nothing; false positives (excluding
// a name that DOES need a decl) would surface as a compile error, which is
// easy to spot and add here.
const RESERVED_OR_GLOBAL = new Set([
  'if',
  'else',
  'for',
  'while',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'do',
  'try',
  'catch',
  'finally',
  'throw',
  'return',
  'function',
  'class',
  'extends',
  'super',
  'this',
  'new',
  'typeof',
  'instanceof',
  'in',
  'of',
  'void',
  'delete',
  'yield',
  'await',
  'async',
  'import',
  'export',
  'from',
  'as',
  'let',
  'const',
  'var',
  'static',
  'get',
  'set',
  'true',
  'false',
  'null',
  'undefined',
  'NaN',
  'Infinity',
  'with',
  'debugger',
  // TypeScript keywords / modifiers / built-in type names (anchor class text
  // is full TS source, so these appear in the identifier scan).
  'private',
  'public',
  'protected',
  'readonly',
  'override',
  'declare',
  'abstract',
  'implements',
  'interface',
  'type',
  'namespace',
  'enum',
  'keyof',
  'infer',
  'satisfies',
  'asserts',
  'is',
  'constructor',
  'number',
  'string',
  'boolean',
  'any',
  'unknown',
  'never',
  'object',
  'symbol',
  'bigint',
  'console',
  'Math',
  'Promise',
  'Date',
  'JSON',
  'Array',
  'Object',
  'Number',
  'String',
  'Boolean',
  'Symbol',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'RegExp',
  'Error',
  'TypeError',
  'RangeError',
  'window',
  'document',
  'globalThis',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'fetch',
  'localStorage',
  'sessionStorage',
  'structuredClone',
  'performance',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'Scene',
]);

// Collects all top-level declared names (const/let/var/function/class) in
// a body, excluding import bindings.
function topLevelDeclaredNames(body: string): Set<string> {
  const names = new Set<string>();
  for (const line of body.split('\n')) {
    const m = line.match(/^(?:const|let|var)\s+(\{[^}]+\}|\[?[\w$]+)/);
    if (m) {
      // Destructuring or simple binding — just add everything that looks like a name
      for (const name of m[1].matchAll(/[\w$]+/g)) names.add(name[0]);
    }
    const fm = line.match(/^(?:function|class)\s+([\w$]+)/);
    if (fm) names.add(fm[1]);
  }
  return names;
}

/**
 * Returns true when a code block is self-contained enough to be written to a
 * standalone .ts/.js file and type-checked without a surrounding class or
 * lifecycle context.
 *
 * A block is standalone when it:
 *   1. Has at least one `import` statement, AND
 *   2. Its first real code line is NOT a bare class method (`init(loader) {`),
 *      AND
 *   3. Its first real code line does NOT start with `this.` (top-level
 *      property reference — context only available inside a class method), AND
 *   4. It does NOT reference common lifecycle/context variables (like `loader`,
 *      `delta`, `texture`) that are never declared within the snippet itself.
 */
function isStandaloneSnippet(body: string): boolean {
  if (!/^import\s/m.test(body)) return false;

  const firstCodeLine = firstRealCodeLine(body);
  if (!firstCodeLine) return false;

  // Bare class method (e.g. `init(loader) {`).
  if (BARE_METHOD_RE.test(firstCodeLine) && !TOPLEVEL_KEYWORD_RE.test(firstCodeLine)) return false;

  // Top-level `this.x` — property reference outside any class body.
  if (firstCodeLine.startsWith('this.')) return false;

  // Uses a common lifecycle / context variable that isn't declared within the
  // snippet itself (e.g. `loader.get(...)` without a `const loader = ...`).
  // Skip this check for full-module snippets that contain a class body:
  // method parameters (e.g. `init(loader)`, `update(delta)`) are scoped
  // inside methods and are not external context variables.
  // Important: do NOT use CONTEXT_VAR_RE.test() + matchAll() on the same
  // regex instance — the /g flag's lastIndex state causes missed matches.
  // body.matchAll() always starts from position 0 on a fresh copy.
  const hasClassBody = /\bclass\s+\w/.test(body);
  if (!hasClassBody) {
    const declared = topLevelDeclaredNames(body);
    for (const m of body.matchAll(CONTEXT_VAR_RE)) {
      if (!declared.has(m[1])) return false;
    }
  }

  return true;
}

function firstRealCodeLine(body: string): string | undefined {
  return body
    .split('\n')
    .map(l => l.trimStart())
    .find(l => l && !l.startsWith('import ') && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'));
}

/** A method-declaration-shaped first line (`update(delta) {`), as opposed to
 * a control-flow fragment shaped the same way (`if (x) {`) or a bare `this.`
 * statement. */
function isGenuineMethodDeclLine(firstCodeLine: string): boolean {
  if (TOPLEVEL_KEYWORD_RE.test(firstCodeLine)) return false;
  const m = firstCodeLine.match(/^(?:async\s+|override\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  return m !== null && !CONTROL_KEYWORDS.has(m[1]);
}

/** True when a no-import block is shaped like a bare class-method body or a
 * `this.*` / control-flow fragment shown without its enclosing class — the
 * gap this fix closes (see file header). */
function isBareWrappable(firstCodeLine: string): boolean {
  if (TOPLEVEL_KEYWORD_RE.test(firstCodeLine)) return false;
  if (BARE_METHOD_RE.test(firstCodeLine)) return true; // genuine method OR control-flow fragment
  return firstCodeLine.startsWith('this.');
}

function walkFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, predicate));
    } else if (predicate(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Core export names — a static scan of src/**/*.ts for `export`ed names, used
// to decide whether a bare PascalCase identifier referenced by a BARE block
// (`new Sprite(...)`, `Keyboard.Space`) should be imported for real (and thus
// validated — catching a renamed/removed export) or declared `any` (covers
// extension-package types like `BeatDetector` and guide-local placeholder
// class names like `GameScene` that were never real exports).
// ---------------------------------------------------------------------------
function computeCoreExportNames(): Set<string> {
  const names = new Set<string>();
  const files = walkFiles(SRC_DIR, name => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.spec.ts'));
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const m of content.matchAll(/^export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of content.matchAll(/^export\s+function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of content.matchAll(/^export\s+const\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of content.matchAll(/^export\s+enum\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of content.matchAll(/^export\s+type\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of content.matchAll(/^export\s+\{([^}]+)\}/gm)) {
      for (const item of m[1].split(',')) {
        const parts = item.trim().split(/\s+as\s+/);
        const exported = parts.length > 1 ? parts[1] : parts[0];
        const name = exported.replace(/^type\s+/, '').trim();
        if (name) names.add(name);
      }
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// SourceSnippet anchor resolution — finds a real, fully-typed class embedded
// via <SourceSnippet source=".." region=".."/> in the same MDX file, so bare
// blocks can be spliced into it instead of a synthetic shell.
// ---------------------------------------------------------------------------
const SOURCE_SNIPPET_TAG_RE = /<SourceSnippet\s+([^>]*?)\/>/gs;

function parseSourceSnippetRefs(mdxContent: string): Array<{ source: string; region: string }> {
  const refs: Array<{ source: string; region: string }> = [];
  for (const m of mdxContent.matchAll(SOURCE_SNIPPET_TAG_RE)) {
    const attrs = m[1];
    const source = attrs.match(/source="([^"]+)"/)?.[1];
    const region = attrs.match(/region="([^"]+)"/)?.[1];
    if (source && region) refs.push({ source, region });
  }
  return refs;
}

const REGION_OPEN_RE = /^[ \t]*\/\/ #region guide:(.+)$/;
const REGION_CLOSE_RE = /^[ \t]*\/\/ #endregion guide:(.+)$/;

/** Local re-implementation of site/src/lib/source-snippets.ts#extractSnippetRegion
 * (kept independent so this Node-only script has no dependency on the Astro
 * site's module graph). Returns null instead of throwing on any failure —
 * a guide build error there is loud and separate; here we just skip the
 * anchor and fall back to the synthetic shell. */
function tryExtractSnippetRegion(filePath: string, region: string): string | null {
  try {
    const source = readFileSync(join(REPO_ROOT, filePath), 'utf8');
    const lines = source.split('\n');
    const snippetLines: string[] = [];
    let inside = false;
    let found = false;
    for (const line of lines) {
      const openMatch = line.match(REGION_OPEN_RE);
      if (openMatch?.[1].trim() === region) {
        inside = true;
        found = true;
        continue;
      }
      const closeMatch = line.match(REGION_CLOSE_RE);
      if (closeMatch?.[1].trim() === region) {
        inside = false;
        continue;
      }
      if (inside) snippetLines.push(line);
    }
    if (!found) return null;
    while (snippetLines.length > 0 && snippetLines[snippetLines.length - 1].trim() === '') snippetLines.pop();
    const nonEmpty = snippetLines.filter(l => l.trim() !== '');
    if (nonEmpty.length === 0) return null;
    const minIndent = nonEmpty.reduce((min, line) => Math.min(min, line.match(/^(\s*)/)?.[1].length ?? 0), Infinity);
    return snippetLines.map(line => (line.length >= minIndent ? line.slice(minIndent) : line)).join('\n');
  } catch {
    return null;
  }
}

/** Strips leading import/comment lines and checks whether what remains is a
 * single `class X extends Y { ... }` spanning the whole text. Returns the
 * bare class text (imports stripped) or null if the shape doesn't match. */
function extractAnchorClass(regionText: string): string | null {
  const withoutLeading = regionText.replace(/^(?:[ \t]*(?:\/\/[^\n]*|import\s[\s\S]*?;)[ \t]*\n)+/, '');
  const trimmed = withoutLeading.trim();
  if (/^(?:export\s+)?class\s+[A-Za-z_$][\w$]*\s+extends\s+[\w.$]+/.test(trimmed) && trimmed.endsWith('}')) {
    return trimmed;
  }
  return null;
}

/** Import lines of the referenced source file, filtered to specifiers the
 * guide-typecheck tsconfig can actually resolve (`@codexo/...`). Names bound
 * by dropped imports simply fall through to the `var x;` any-fallback. */
function collectFileImportLines(filePath: string): string[] {
  try {
    const content = readFileSync(join(REPO_ROOT, filePath), 'utf8');
    const matches = content.match(/^import\s[\s\S]*?;\s*$/gm) ?? [];
    return matches.map(s => s.trim()).filter(s => /from\s+['"]@codexo\//.test(s));
  } catch {
    return [];
  }
}

/** All top-level `class X extends Y { ... }` declarations in a source file. */
function collectFileClasses(filePath: string): string[] {
  try {
    const content = readFileSync(join(REPO_ROOT, filePath), 'utf8');
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.ES2022, true);
    const classes: string[] = [];
    for (const stmt of sourceFile.statements) {
      if (ts.isClassDeclaration(stmt) && stmt.heritageClauses?.length) {
        classes.push(content.slice(stmt.getStart(sourceFile), stmt.end).replace(/^export\s+/, ''));
      }
    }
    return classes;
  } catch {
    return [];
  }
}

interface Anchor {
  /** The class text (e.g. `class HelloWorldScene extends Scene { ... }`), imports stripped. */
  classText: string;
  /** Import lines pulled from the referenced source file. */
  importLines: string[];
}

/**
 * Finds the real, fully-typed class the page's bare blocks belong to.
 *
 * Candidates come from every <SourceSnippet/> reference on the page: the
 * region text itself (when it is a whole class) plus every top-level class in
 * the referenced source file — the region a page embeds is not necessarily
 * the class its follow-up hook snippets narrate (build-orb-dodge embeds the
 * GameOverScene region while its bare blocks walk through PlayScene).
 * Among the candidates, the one covering the most `this.*` names referenced
 * by the bare blocks wins.
 *
 * Returns null when the page embeds no class at all — those pages get the
 * synthetic shell instead.
 */
function findAnchor(mdxContent: string, thisRefs: Set<string>): Anchor | null {
  const candidates: Anchor[] = [];
  const seenFiles = new Set<string>();
  for (const ref of parseSourceSnippetRefs(mdxContent)) {
    const regionText = tryExtractSnippetRegion(ref.source, ref.region);
    if (regionText) {
      const classText = extractAnchorClass(regionText);
      if (classText) candidates.push({ classText, importLines: collectFileImportLines(ref.source) });
    }
    if (!seenFiles.has(ref.source)) {
      seenFiles.add(ref.source);
      for (const classText of collectFileClasses(ref.source)) {
        candidates.push({ classText, importLines: collectFileImportLines(ref.source) });
      }
    }
  }
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = -1;
  for (const candidate of candidates) {
    let score = 0;
    for (const name of thisRefs) {
      if (new RegExp(`\\b${name}\\b`).test(candidate.classText)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// BARE block → synthetic member text
// ---------------------------------------------------------------------------

let bareMemberCounter = 0;

/** Renames a genuine method declaration's identifier to a unique synthetic
 * name (avoiding collisions when several bare blocks/chunks in the same file
 * declare methods with the same real name, e.g. two `init(loader) {}`
 * blocks), stripping `override` (the synthetic name no longer overrides
 * anything) and keeping `async` and the original parameter list intact.
 * The original name is recorded in `methodNames` so `this.originalName(...)`
 * calls from other bare blocks on the same page still resolve. */
function renameMethodChunk(chunk: string, methodNames: Set<string>): string {
  const name = `__block${bareMemberCounter++}`;
  const lines = chunk.split('\n');
  const firstLineIdx = lines.findIndex(l => l.trim().length > 0 && !l.trimStart().startsWith('//'));
  if (firstLineIdx === -1) return chunk;
  lines[firstLineIdx] = lines[firstLineIdx].replace(
    /^(\s*)(async\s+)?(override\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*\()/,
    (_all, indent, asyncKw = '', _overrideKw, origName, paren) => {
      methodNames.add(origName);
      return `${indent}${asyncKw}${name}${paren}`;
    },
  );
  return lines.join('\n');
}

/** Wraps a bare `this.*`/control-flow fragment body in a synthetic
 * zero-argument method so it becomes a valid class member. Free identifiers
 * it references are resolved separately via a fallback `var` declaration. */
function wrapFragment(body: string): string {
  const name = `__block${bareMemberCounter++}`;
  return `${name}() {\n${body}\n}`;
}

/**
 * Splits a "genuine method declaration" block into one chunk per sibling
 * method. A fenced block can show more than one method back to back
 * (`async load(loader) {...}\n\ninit() {...}`) — but a *single* method body
 * can just as easily contain its own internal blank line between statement
 * groups, so naively splitting on blank lines is wrong (it would slice a
 * method's body in half). Real parsing is required to tell the two apart:
 * wrap the block as a class body and let the TypeScript parser find the
 * actual member boundaries (it correctly handles chained calls spanning
 * multiple lines, nested braces, comments, etc. — none of which a
 * brace-depth or blank-line heuristic can fully get right).
 */
function splitSiblingMethods(body: string): string[] {
  const wrapped = `class __Probe {\n${body}\n}`;
  const sourceFile = ts.createSourceFile('__probe.ts', wrapped, ts.ScriptTarget.ES2022, true);
  const classDecl = sourceFile.statements.find(ts.isClassDeclaration);
  if (!classDecl || classDecl.members.length === 0) return [body];
  return classDecl.members.map(member => wrapped.slice(member.pos, member.end).trim()).filter(Boolean);
}

/** Converts one BARE block's body into one-or-more synthetic class-member
 * texts, ready to be joined into a class body. Original method names of
 * renamed chunks are recorded in `methodNames`. */
function bareBlockToMembers(body: string, methodNames: Set<string>): string[] {
  const firstCodeLine = firstRealCodeLine(body);
  if (firstCodeLine && isGenuineMethodDeclLine(firstCodeLine)) {
    return splitSiblingMethods(body).map(chunk =>
      isGenuineMethodDeclLine(firstRealCodeLine(chunk) ?? '') ? renameMethodChunk(chunk, methodNames) : wrapFragment(chunk),
    );
  }
  return [wrapFragment(body)];
}

// ---------------------------------------------------------------------------
// Identifier scanning helpers
// ---------------------------------------------------------------------------

/** Blanks out string literals, template literals, and comments so identifier
 * scans don't pick up prose words from comments (`// A/D and Left/Right`) or
 * string content. Regex-literal slashes can confuse the comment pass in
 * theory — harmless here, since the result is only used for name scans that
 * tolerate both false negatives (an extra unused `var`) and rare false
 * positives (a missing one shows up as a clear compile error). */
function stripStringsAndComments(text: string): string {
  return text
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

// ---------------------------------------------------------------------------
// Free-identifier resolution (import-for-real vs `var x;` any-fallback)
// ---------------------------------------------------------------------------

const FREE_IDENTIFIER_RE = /(?<![.\w$])([A-Za-z_$][\w$]*)/g;

/** The `any`-fallback declaration(s) for one unresolved free identifier.
 * PascalCase names may be used in type position too (`orb: OrbData`), so
 * they get a merging `type X = any;` alongside the value declaration. */
function anyFallbackDecl(name: string): string[] {
  return /^[A-Z]/.test(name) ? [`var ${name};`, `type ${name} = any;`] : [`var ${name};`];
}

function collectFreeIdentifiers(memberTexts: string[]): Set<string> {
  const combined = stripStringsAndComments(memberTexts.join('\n'));
  const found = new Set<string>();
  for (const m of combined.matchAll(FREE_IDENTIFIER_RE)) {
    const name = m[1];
    if (!RESERVED_OR_GLOBAL.has(name) && !/^__block\d+$/.test(name)) found.add(name);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Page-wide field mining
//
// Guide chapters narrate one running example across many snippets: a field is
// assigned in one fenced block (`this.detector = new BeatDetector()`), then
// read in a bare block three paragraphs later (`this.detector.tempo`). The
// bare blocks of a page are merged into one synthetic class, but assignments
// that live in *standalone*, *no-check*, or *partial* blocks never reach that
// class — so without mining, every such read would be a false positive.
//
// Mining scans EVERY ts/js fenced block on the page (regardless of how it is
// otherwise handled) for `this.x = ...` assignments (plain, compound, and
// array-destructuring forms) and declares each mined name as an `any` field
// on the synthetic class. A field that is READ somewhere but ASSIGNED nowhere
// on the page — the `this.bunny` class of staleness — is deliberately NOT
// mined and stays a hard error.
// ---------------------------------------------------------------------------
function mineAssignedFields(blockBodies: string[]): Set<string> {
  const mined = new Set<string>();
  for (const body of blockBodies) {
    const text = stripStringsAndComments(body);
    // Plain and compound assignment: this.x = / += / ||= / ??= ...
    for (const m of text.matchAll(/this\.([A-Za-z_$][\w$]*)\s*(?:[+\-*/%&|^]|\|\||&&|\?\?)?=(?![=>])/g)) {
      mined.add(m[1]);
    }
    // Array-destructuring assignment: [this.a, this.b] = await Promise.all(...)
    for (const d of text.matchAll(/\[([^\]\n]*this\.[^\]\n]*)\]\s*=(?![=>])/g)) {
      for (const m of d[1].matchAll(/this\.([A-Za-z_$][\w$]*)/g)) mined.add(m[1]);
    }
  }
  return mined;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function walkMdx(dir: string): string[] {
  return walkFiles(dir, name => name.endsWith('.mdx') || name.endsWith('.md'));
}

// Clean and recreate output directory.
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const coreExportNames = computeCoreExportNames();

const files = walkMdx(GUIDE_DIR);
let extracted = 0;
let skippedMeta = 0;
let skippedPartial = 0;
let bareFiles = 0;
let bareBlocksTotal = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const rel = relative(GUIDE_DIR, file).replaceAll('\\', '/');
  const slug = rel.replace(/\.(mdx?|tsx?)$/, '').replaceAll('/', '__');

  let blockIndex = 0;
  const bareBodies: string[] = [];
  // Every ts/js block on the page — including no-check, standalone, and
  // partial ones — feeds the page-wide field mining (see mineAssignedFields).
  const allCodeBodies: string[] = [];
  bareMemberCounter = 0;

  for (const match of content.matchAll(FENCE_RE)) {
    const lang = (match.groups?.lang ?? '').toLowerCase();
    const meta = match.groups?.meta ?? '';
    const body = match.groups?.body ?? '';

    if (!CHECKED_LANGS.has(lang)) continue;

    allCodeBodies.push(body);

    // Skip blocks marked no-check in the fence meta.
    if (meta.includes('no-check')) {
      skippedMeta++;
      continue;
    }

    if (isStandaloneSnippet(body)) {
      // ts/typescript/tsx blocks → .ts (full TypeScript syntax allowed).
      // js/javascript blocks    → .js (allowJs mode; class properties inferred
      //                               from assignments, no false positives).
      const isTs = lang === 'ts' || lang === 'typescript' || lang === 'tsx';
      const ext = isTs ? 'ts' : 'js';
      const outName = `${slug}__block${blockIndex}.${ext}`;
      const header = `// guide: ${rel} | block ${blockIndex}\n`;
      writeFileSync(join(OUT_DIR, outName), header + body);
      extracted++;
      blockIndex++;
      continue;
    }

    // No import, and not shaped like a bare method/fragment either — a
    // partial snippet (object literal, mid-expression fragment, etc.) that
    // still cannot be usefully type-checked. Leave it skipped, as before.
    if (!/^import\s/m.test(body)) {
      const firstCodeLine = firstRealCodeLine(body);
      if (firstCodeLine && isBareWrappable(firstCodeLine)) {
        bareBodies.push(body);
        continue;
      }
    }

    skippedPartial++;
  }

  if (bareBodies.length === 0) continue;

  bareFiles++;
  bareBlocksTotal += bareBodies.length;

  const bareMethodNames = new Set<string>();
  const memberTexts = bareBodies.flatMap(body => bareBlockToMembers(body, bareMethodNames));

  // Distinct `this.x` names the bare blocks reference — used to pick the
  // best-matching anchor class.
  const thisRefs = new Set<string>();
  for (const m of stripStringsAndComments(memberTexts.join('\n')).matchAll(/this\.([A-Za-z_$][\w$]*)/g)) {
    if (!/^__block\d+$/.test(m[1])) thisRefs.add(m[1]);
  }

  const anchor = findAnchor(content, thisRefs);

  // Free identifiers to resolve: the bare members' own, plus — in the anchor
  // case — whatever the spliced-in real class references from its module
  // scope (module-level consts like CANVAS_WIDTH, sibling classes, ...).
  // The anchor class's own name declares itself.
  const freeIdentifiers = collectFreeIdentifiers(anchor ? [...memberTexts, anchor.classText] : memberTexts);
  if (anchor) {
    const ownName = anchor.classText.match(/^class\s+([A-Za-z_$][\w$]*)/)?.[1];
    if (ownName) freeIdentifiers.delete(ownName);
  }

  const toImport = new Set<string>();
  const toDeclareAny = new Set<string>();
  for (const name of freeIdentifiers) {
    if (/^[A-Z]/.test(name) && coreExportNames.has(name)) {
      toImport.add(name);
    } else {
      toDeclareAny.add(name);
    }
  }

  const importLines: string[] = [];
  const varLines: string[] = [];
  const alreadyImported = new Set<string>();

  if (anchor) {
    // Already-imported names (from the real example file) don't need a
    // second import statement, and must not collide with a fallback `var`.
    for (const line of anchor.importLines) {
      const braceContent = line.match(/\{([^}]*)\}/)?.[1] ?? '';
      for (const item of braceContent.split(',')) {
        const parts = item.trim().split(/\s+as\s+/);
        const local = (parts.length > 1 ? parts[1] : parts[0]).replace(/^type\s+/, '').trim();
        if (local) alreadyImported.add(local);
      }
    }
    importLines.push(...anchor.importLines);
    const extraImports = [...toImport].filter(n => !alreadyImported.has(n)).sort();
    if (extraImports.length > 0) {
      importLines.push(`import { ${extraImports.join(', ')} } from '@codexo/exojs';`);
    }
    for (const name of [...toDeclareAny].sort()) {
      if (!alreadyImported.has(name)) varLines.push(...anyFallbackDecl(name));
    }
  } else {
    const coreImports = ['Scene', ...[...toImport].sort()];
    importLines.push(`import { ${coreImports.join(', ')} } from '@codexo/exojs';`);
    for (const name of [...toDeclareAny].sort()) varLines.push(...anyFallbackDecl(name));
  }

  const membersBlock = memberTexts
    .map(m =>
      m
        .split('\n')
        .map(l => `    ${l}`)
        .join('\n'),
    )
    .join('\n\n');

  let classText: string;
  if (anchor) {
    // ANCHORED page: the bare blocks narrate a real, fully-typed example
    // class — splice them into it (just before its final `}`) so every
    // `this.*` access is checked STRICTLY against the example's actual
    // shape. This is the F8/`this.bunny` bug class: a prose snippet that
    // contradicts the very example it explains.
    //
    // Fields the page assigns in OTHER snippets (page-wide mining) and the
    // original names of renamed bare methods are declared `any` so
    // legitimate cross-snippet narrative state still resolves; names the
    // anchor already declares are skipped (the real declaration wins).
    const minedNames = new Set<string>([...mineAssignedFields(allCodeBodies), ...bareMethodNames]);
    const fieldDeclLines: string[] = [];
    for (const name of [...minedNames].sort()) {
      if (new RegExp(`\\b${name}\\b`).test(anchor.classText)) continue;
      fieldDeclLines.push(`    declare ${name}: any;`);
    }
    const classBody = [fieldDeclLines.join('\n'), membersBlock].filter(Boolean).join('\n\n');
    const trimmedAnchor = anchor.classText.trimEnd();
    classText = `${trimmedAnchor.slice(0, -1).trimEnd()}\n\n${classBody}\n}`;
  } else {
    // UNANCHORED page: no real example class to check against. Narrative
    // shorthand (`this.player`, `this.world`, ... introduced only in prose)
    // is pervasive and indistinguishable from a typo without an anchor, so
    // `this.*` member EXISTENCE is not checked here — the index signature
    // resolves any name to `any`. Everything else still is: engine imports
    // (a renamed/removed export fails), inherited Scene API used with real
    // types (`this.app`, `this.loader`, `this.inputs` keep their declared
    // types and are checked strictly), and all argument/assignment typing
    // against those APIs.
    classText = `class __GuideSnippet extends Scene {\n    [key: string]: any;\n\n${membersBlock}\n}`;
  }

  const header = `// guide: ${rel} | ${bareBodies.length} bare block(s) merged (method-body/this-fragment snippets)\n`;
  const fileText = [header, ...importLines, '', ...varLines, varLines.length > 0 ? '' : null, classText, ''].filter((l): l is string => l !== null).join('\n');

  writeFileSync(join(OUT_DIR, `${slug}__bare.ts`), fileText);
}

const total = extracted + skippedMeta + skippedPartial + bareBlocksTotal;
console.log(
  `guide-snippets: ${extracted} extracted, ${bareBlocksTotal} bare (merged into ${bareFiles} file(s)), ` +
    `${skippedMeta} no-check, ${skippedPartial} partial (${total} total blocks)`,
);
