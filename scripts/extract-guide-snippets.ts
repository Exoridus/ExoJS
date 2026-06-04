/**
 * Extracts TypeScript/JavaScript code blocks from guide MDX files and writes
 * them as standalone .ts files into .workspace/generated/guide-typecheck/ for
 * typechecking via `pnpm typecheck:guides`.
 *
 * Skip conventions (applied inside the guide MDX source):
 *   - Fence with `no-check` meta:  ```ts no-check
 *     Marks the block as intentionally untypeable — partial snippets, prose
 *     illustrations, or temporarily stale API. Use sparingly.
 *   - Blocks without any `import` statement are skipped automatically as
 *     partial/context-free snippets (method bodies, one-liners, etc.).
 *
 * Output location: .workspace/generated/guide-typecheck/ (gitignored).
 * Each file is named after its source MDX path and block index, and carries
 * a header comment that maps back to the original guide location.
 */

import { mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const GUIDE_DIR = join(import.meta.dirname, '..', 'site', 'src', 'content', 'guide');
const OUT_DIR = join(import.meta.dirname, '..', '.workspace', 'generated', 'guide-typecheck');

const CHECKED_LANGS = new Set(['ts', 'tsx', 'typescript', 'js', 'javascript']);

// Matches a fenced code block. Group "lang" = language tag, "meta" = rest of
// the opening fence line, "body" = the block content (without the fences).
const FENCE_RE = /^```(?<lang>[a-zA-Z]+)?(?<meta>[^\n]*)?\n(?<body>[\s\S]*?)^```/gm;

// Bare-method prefixes that indicate a snippet is a class method body shown
// without its enclosing class — these snippets cannot be compiled standalone.
const BARE_METHOD_RE = /^(?:async\s+|override\s+)?[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/;
const TOPLEVEL_KEYWORD_RE = /^(?:class|function|const|let|var|export|type|interface|new|document|window)\b/;

// Variable names that guide authors typically reference from surrounding
// prose context without re-declaring in the snippet itself.
// Note: `backend` and `context` are intentionally excluded — they appear as
// named method parameters inside class bodies, not as external context vars.
// `app` is included because standalone snippets always declare it explicitly
// via `const app = new Application(...)`.
const CONTEXT_VAR_RE = /\b(loader|delta|texture|sheet|spritesheetJson|app)\b/g;

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

  const firstCodeLine = body
    .split('\n')
    .map(l => l.trimStart())
    .find(l => l && !l.startsWith('import ') && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'));

  if (!firstCodeLine) return false;

  // Bare class method (e.g. `init(loader) {`).
  if (BARE_METHOD_RE.test(firstCodeLine) && !TOPLEVEL_KEYWORD_RE.test(firstCodeLine)) return false;

  // Top-level `this.x` — property reference outside any class body.
  if (firstCodeLine.startsWith('this.')) return false;

  // Uses a common lifecycle / context variable that isn't declared within the
  // snippet itself (e.g. `loader.get(...)` without a `const loader = ...`).
  // Important: do NOT use CONTEXT_VAR_RE.test() + matchAll() on the same
  // regex instance — the /g flag's lastIndex state causes missed matches.
  // body.matchAll() always starts from position 0 on a fresh copy.
  const declared = topLevelDeclaredNames(body);
  for (const m of body.matchAll(CONTEXT_VAR_RE)) {
    if (!declared.has(m[1])) return false;
  }

  return true;
}

function walkMdx(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMdx(full));
    } else if (entry.name.endsWith('.mdx') || entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

// Clean and recreate output directory.
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const files = walkMdx(GUIDE_DIR);
let extracted = 0;
let skippedMeta = 0;
let skippedPartial = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const rel = relative(GUIDE_DIR, file).replaceAll('\\', '/');

  let blockIndex = 0;

  for (const match of content.matchAll(FENCE_RE)) {
    const lang = (match.groups?.lang ?? '').toLowerCase();
    const meta = match.groups?.meta ?? '';
    const body = match.groups?.body ?? '';

    if (!CHECKED_LANGS.has(lang)) continue;

    // Skip blocks marked no-check in the fence meta.
    if (meta.includes('no-check')) {
      skippedMeta++;
      continue;
    }

    // Skip partial snippets — those without any import statement, or those
    // whose first real code line is a bare class method (i.e. the snippet shows
    // methods without their enclosing class, a common guide pattern).
    if (!isStandaloneSnippet(body)) {
      skippedPartial++;
      continue;
    }

    // Derive a unique output file name from the guide path and block index.
    // Double underscores separate path segments.
    const slug = rel
      .replace(/\.(mdx?|tsx?)$/, '')
      .replaceAll('/', '__');
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
  }
}

const total = extracted + skippedMeta + skippedPartial;
console.log(
  `guide-snippets: ${extracted} extracted, ${skippedMeta} no-check, ${skippedPartial} partial (${total} total blocks)`
);
