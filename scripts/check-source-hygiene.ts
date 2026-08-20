/**
 * Blocks development provenance from leaking into source comments and JSDoc.
 *
 * Comments are the one place where the working context of a change survives
 * into the shipped tree: a private planning-directory path, a machine-local
 * absolute path, a commit hash, a tracker ID, an issue or pull-request number,
 * or the name of whichever assistant happened to write the line. None of it
 * means anything to a reader six months later, and JSDoc is worse than a plain
 * comment here because it is reused verbatim in the generated API reference.
 * The durable technical rationale is worth keeping; how it was discovered is
 * not. See the source-comment section of `AGENTS.md` for the policy this gate
 * enforces.
 *
 * Only comment trivia is inspected. The file is parsed with the TypeScript
 * compiler and every token's leading trivia is collected, so string literals,
 * identifiers and JSX text can never be mistaken for a comment, and a comment
 * in an otherwise empty block is still seen.
 *
 * The gate is line-scoped by default. It diffs against the merge base with the
 * default branch, including staged, unstaged and untracked work, and reports
 * only comments that touch a changed line. Scoping by file would be unusable:
 * the tree predates the policy, most files carry some legacy violation, and a
 * one-line edit in a grown file would block on decades of comment history the
 * change never touched. A comment block counts as touched when any of its lines
 * changed, so editing one sentence inside an existing JSDoc block puts the whole
 * block in scope rather than just the new line; a new file has every line
 * changed and is therefore checked in full.
 *
 * Pass `--all` to scan every comment in the tree (reporting mode, for scoping
 * the cleanup), `--base` to compare against another ref, or explicit paths to
 * check those files end to end. Every run prints the scope it used, so a
 * line-scoped run cannot be mistaken for full coverage.
 *
 * `--json` writes the findings as one machine-readable array instead of the
 * human report, and `--fix-safe` applies the transformations that are provably
 * meaning-preserving. Everything else is left for a human to rewrite.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * Hyphenated tokens that match the tracker-ID shape but are not work items:
 * published standards and vendor part numbers, plus the index and scale
 * notation this codebase writes inline (the frame before the current one, the
 * device pixel ratio of a phone). Extend this rather than loosening the rule.
 * An entry here is a claim that the token means the same thing to a reader who
 * never saw the change that introduced it.
 */
export const TASK_ID_ALLOWLIST: readonly string[] = [
  'AES-128',
  'AES-192',
  'AES-256',
  'DPR-1',
  'DPR-2',
  'DPR-3',
  'DPR-4',
  'IEEE-754',
  'ISO-8601',
  'N-1',
  'N-2',
  'N-3',
  'N-4',
  'RFC-3339',
  'SHA-1',
  'SHA-256',
  'SHA-512',
  'UTF-16',
  'UTF-32',
  'UTF-8',
  'WUP-028',
];

/**
 * The repositories whose issue and pull-request numbers are this project's own
 * development history. A link into someone else's tracker is a technical
 * reference a workaround comment often needs, and stays allowed; a link into
 * one of these is provenance.
 */
export const OWN_REPOSITORIES: readonly string[] = ['Exoridus/ExoJS'];

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SELF_PATH = fileURLToPath(import.meta.url);
const SCANNABLE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Path segments never worth scanning: dependencies, build output, test
 * artifacts, and every dot-directory (private workspace, tool caches, agent
 * scratch worktrees) which is handled separately by the leading-dot check.
 */
const SKIPPED_SEGMENTS = new Set(['node_modules', 'dist', 'coverage', 'test-results', '__screenshots__']);

/** Markers a generated file carries in its banner. Only the first few lines are inspected. */
const GENERATED_BANNER = /@generated|auto[- ]generated|do not edit/i;
const GENERATED_BANNER_LINES = 5;

const ALLOWED_TASK_IDS = new Set(TASK_ID_ALLOWLIST.map(id => id.toUpperCase()));
const OWN_REPOSITORY_SET = new Set(OWN_REPOSITORIES.map(name => name.toLowerCase()));
const GITHUB_ISSUE_URL = /https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull|pulls)\/\d+/i;

/** True for a GitHub issue or pull-request link that points outside this project. */
function isForeignIssueUrl(match: string): boolean {
  const url = GITHUB_ISSUE_URL.exec(match);

  return url !== null && !OWN_REPOSITORY_SET.has(`${url[1]}/${url[2]}`.toLowerCase());
}

/**
 * "This session" is the one provenance phrase that is also ordinary domain
 * vocabulary here: a `SceneTransitionSession` is a session, and a doc comment
 * on one says so. Every other phrase the rule matches names a tool or a past
 * conversation and cannot mean anything else.
 */
const AMBIGUOUS_SESSION = /^this session$/i;

/**
 * What separates "this session owns the transition state" from "this session
 * changed the default": a verb that can only have a person as its subject.
 * Matched against the whole comment block, since the sentence that gives the
 * phrase away is often the next one.
 */
const RECOUNTS_A_CONVERSATION = /\b(?:discussed|decided|requested|asked|mentioned|agreed|suggested|reviewed)\b/i;

interface HygieneRule {
  readonly name: string;
  readonly patterns: readonly RegExp[];
  /**
   * Returns true for a match that is legitimate despite matching the pattern.
   * Receives the whole comment block, because a word can be domain vocabulary
   * in one comment and provenance in the next; the block is the smallest unit
   * that can tell them apart.
   */
  readonly allow?: (match: string, comment: string) => boolean;
}

/**
 * Patterns live here rather than in prose so this file does not trip its own
 * rules; it excludes itself from every scan as a second line of defence.
 *
 * The hash rule deliberately requires both a letter and a digit: without it
 * every seven-letter word spelled from a-f and every seven-digit number reads
 * as an abbreviated hash. The task-ID rule leans on the allowlist above for the
 * same reason. A bare hash-prefixed number needs at least three digits, which
 * separates a tracker reference from the enumeration ("case 1", "case 2") that
 * comments legitimately use; the spelled-out forms still catch small numbers.
 */
const RULES: readonly HygieneRule[] = [
  {
    name: 'workspace-reference',
    patterns: [/(?<![\w.])\.workspace(?![\w-])[^\r\n]{0,32}/g],
  },
  {
    name: 'absolute-path',
    patterns: [/(?<![\w:])[A-Za-z]:[\\/](?![\\/])[^\s'"`)\],;]*/g, /\\\\[A-Za-z0-9_.$-]+\\[^\s'"`)\],;]+/g],
  },
  {
    name: 'commit-sha',
    patterns: [/(?<![\w#/-])(?=[\da-fA-F]*[a-fA-F])(?=[\da-fA-F]*\d)[\da-fA-F]{7,40}(?![\w-])/g],
  },
  {
    name: 'agent-provenance',
    patterns: [
      /\bclaude\b/gi,
      /\bcodex\b/gi,
      /\bchatgpt\b/gi,
      /\bthe agent\b/gi,
      /\b(?:agent|coding|conversation|chat|previous|earlier|prior|last)\s+session\b/gi,
      /\bthis session\b/gi,
    ],
    allow: (match, comment) => AMBIGUOUS_SESSION.test(match) && !RECOUNTS_A_CONVERSATION.test(comment),
  },
  {
    name: 'unicode-dash',
    patterns: [/[–—][^\r\n]{0,32}/g],
  },
  {
    name: 'task-id',
    patterns: [/\b[A-Z]{1,4}-[A-Z]?\d{1,4}\b/g],
    allow: match => ALLOWED_TASK_IDS.has(match.toUpperCase()),
  },
  {
    name: 'issue-reference',
    patterns: [
      /(?<![\w#])#\d{3,6}(?![\w])/g,
      /\b(?:PR|pull request)[ -]?#?\d{1,6}\b/gi,
      /\bissues?[ -]#?\d{1,6}\b/gi,
      new RegExp(GITHUB_ISSUE_URL.source, 'gi'),
    ],
    allow: isForeignIssueUrl,
  },
];

/** Which flavour of comment a finding sits in, as a hint for how strictly to rewrite it. */
type CommentKind = 'jsdoc' | 'block-comment' | 'line-comment';

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly kind: CommentKind;
  readonly text: string;
}

function commentKind(text: string): CommentKind {
  if (text.startsWith('/**')) return 'jsdoc';

  return text.startsWith('/*') ? 'block-comment' : 'line-comment';
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function git(args: readonly string[]): string {
  return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function tryGit(args: readonly string[]): string {
  try {
    return git(args);
  } catch {
    return '';
  }
}

function gitLines(args: readonly string[]): string[] {
  try {
    return git(args)
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch {
    return [];
  }
}

function toRepoPath(absolutePath: string): string {
  return relative(REPO_ROOT, absolutePath).split(sep).join('/');
}

function isScannable(repoPath: string): boolean {
  if (!SCANNABLE_EXTENSIONS.some(extension => repoPath.endsWith(extension))) return false;

  return !repoPath.split('/').some(segment => segment.startsWith('.') || SKIPPED_SEGMENTS.has(segment));
}

function isGenerated(source: string): boolean {
  return GENERATED_BANNER.test(source.split('\n', GENERATED_BANNER_LINES).join('\n'));
}

/**
 * Every comment range in the file, found by walking all tokens and reading
 * their leading trivia. Trailing comments need no separate pass: they are the
 * leading trivia of the following token, and the end-of-file token catches the
 * ones that close a file.
 */
function collectComments(sourceFile: ts.SourceFile, source: string): ts.CommentRange[] {
  const seen = new Set<number>();
  const comments: ts.CommentRange[] = [];

  const visit = (node: ts.Node): void => {
    const children = node.getChildren(sourceFile);

    if (children.length > 0) {
      for (const child of children) visit(child);

      return;
    }

    for (const range of ts.getLeadingCommentRanges(source, node.getFullStart()) ?? []) {
      if (seen.has(range.pos)) continue;

      seen.add(range.pos);
      comments.push(range);
    }
  };

  visit(sourceFile);

  return comments;
}

/** A one-based, inclusive span of source lines. */
interface LineRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Whether any line of the comment falls inside a changed range. Testing the
 * whole span rather than the comment's first line is what puts an existing
 * JSDoc block in scope when a single sentence inside it is rewritten.
 */
function isInScope(sourceFile: ts.SourceFile, comment: ts.CommentRange, ranges: readonly LineRange[] | null): boolean {
  if (ranges === null) return true;

  const first = sourceFile.getLineAndCharacterOfPosition(comment.pos).line + 1;
  const last = sourceFile.getLineAndCharacterOfPosition(Math.max(comment.pos, comment.end - 1)).line + 1;

  return ranges.some(range => range.start <= last && range.end >= first);
}

interface Match {
  readonly rule: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * Collapses matches that describe the same offence. Two patterns of one rule
 * can both fire on a reference and its longer spelled-out form, and two rules
 * can fire on the exact same token; either way it is one thing to fix. Spans of
 * *different* rules that merely overlap are kept, because a rule that quotes
 * trailing context would otherwise swallow an unrelated finding inside it.
 */
function dedupe(matches: readonly Match[]): Match[] {
  const ordered = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Match[] = [];
  const seenSpans = new Set<string>();

  for (const match of ordered) {
    if (seenSpans.has(`${match.start}:${match.end}`)) continue;
    if (kept.some(other => other.rule === match.rule && other.start <= match.start && other.end >= match.end)) continue;

    seenSpans.add(`${match.start}:${match.end}`);
    kept.push(match);
  }

  return kept;
}

function summarize(text: string): string {
  const collapsed = text.replaceAll(/\s+/g, ' ').trim();

  return collapsed.length > 120 ? `${collapsed.slice(0, 117)}...` : collapsed;
}

/**
 * Scans one file. `ranges` limits reporting to comments intersecting those
 * one-based, inclusive line ranges; `null` reports every comment.
 */
function scanFile(repoPath: string, absolutePath: string, ranges: readonly LineRange[] | null): Violation[] {
  const source = readFileSync(absolutePath, 'utf8');

  if (isGenerated(source)) return [];

  const sourceFile = ts.createSourceFile(absolutePath, source, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  for (const comment of collectComments(sourceFile, source)) {
    if (!isInScope(sourceFile, comment, ranges)) continue;

    const text = source.slice(comment.pos, comment.end);
    const matches: Match[] = [];

    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        for (const match of text.matchAll(pattern)) {
          if (rule.allow?.(match[0], text)) continue;

          matches.push({ rule: rule.name, start: match.index, end: match.index + match[0].length, text: match[0] });
        }
      }
    }

    for (const match of dedupe(matches)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(comment.pos + match.start);

      violations.push({
        file: repoPath,
        line: line + 1,
        rule: match.rule,
        kind: commentKind(text),
        text: summarize(match.text),
      });
    }
  }

  return violations;
}

/**
 * The typographic dashes, and the one transformation this gate can apply
 * without reading the prose. Both forms are punctuation alone here: the en dash
 * separates a numeric range or stands in for a minus sign, the em dash breaks a
 * sentence, and a hyphen carries either without losing meaning. The replacement
 * is one character wide, so line lengths and the surrounding formatting survive.
 */
const TYPOGRAPHIC_DASHES = /[–—]/g;

/**
 * Normalizes the typographic dashes inside one file's in-scope comments and
 * writes it back, returning how many were replaced.
 *
 * Only comment trivia is rewritten, so a dash in a string literal, an
 * identifier or JSX content is left alone.
 */
function fixFile(absolutePath: string, ranges: readonly LineRange[] | null): number {
  const source = readFileSync(absolutePath, 'utf8');

  if (isGenerated(source)) return 0;

  const sourceFile = ts.createSourceFile(absolutePath, source, ts.ScriptTarget.Latest, true);
  const comments = collectComments(sourceFile, source).sort((a, b) => a.pos - b.pos);

  let result = '';
  let cursor = 0;
  let fixed = 0;

  for (const comment of comments) {
    if (!isInScope(sourceFile, comment, ranges)) continue;

    const text = source.slice(comment.pos, comment.end);
    const hits = text.match(TYPOGRAPHIC_DASHES)?.length ?? 0;

    if (hits === 0) continue;

    result += source.slice(cursor, comment.pos) + text.replaceAll(TYPOGRAPHIC_DASHES, '-');
    cursor = comment.end;
    fixed += hits;
  }

  if (fixed === 0) return 0;

  writeFileSync(absolutePath, result + source.slice(cursor), 'utf8');

  return fixed;
}

interface Scope {
  readonly description: string;
  /** Repo-relative path to the changed line ranges to report on, or `null` for the whole file. */
  readonly files: Map<string, LineRange[] | null>;
}

function unique(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

function wholeFiles(paths: readonly string[]): Map<string, LineRange[] | null> {
  return new Map(unique(paths).map(path => [path, null]));
}

/**
 * New-side line ranges per file from a zero-context diff.
 *
 * Only the header block of each entry may name a file: a `+++` line is honoured
 * until the first hunk, after which everything starting with `+` is added
 * content that can look like a header. A hunk with a zero new-side count is a
 * pure deletion and contributes nothing to scan.
 */
function parseChangedRanges(diff: string): Map<string, LineRange[]> {
  const ranges = new Map<string, LineRange[]>();
  let current: string | null = null;
  let inHeader = false;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = null;
      inHeader = true;
    } else if (inHeader && line.startsWith('+++ ')) {
      const path = line.slice(4).trim();

      current = path === '/dev/null' ? null : path.replace(/^b\//, '');
    } else if (line.startsWith('@@')) {
      inHeader = false;

      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);

      if (!hunk || current === null) continue;

      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);

      if (count === 0) continue;

      const existing = ranges.get(current) ?? [];

      existing.push({ start, end: start + count - 1 });
      ranges.set(current, existing);
    }
  }

  return ranges;
}

/** The default branch to compare against, preferring the remote's own HEAD over a guess. */
function defaultBaseRef(): string {
  const symbolic = gitLines(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])[0];

  if (symbolic) return symbolic.replace('refs/remotes/', '');

  for (const candidate of ['origin/main', 'main', 'origin/master', 'master']) {
    if (gitLines(['rev-parse', '--verify', '--quiet', candidate]).length > 0) return candidate;
  }

  return 'HEAD';
}

/**
 * Comments touching a line this branch changed. The diff runs against the
 * working tree, so it already spans committed, staged and unstaged edits and
 * its line numbers describe the file as it sits on disk. Untracked files have
 * no diff to read and are scanned whole.
 */
function changedScope(baseRef: string): Scope {
  const mergeBase = gitLines(['merge-base', 'HEAD', baseRef])[0] ?? baseRef;
  const files = new Map<string, LineRange[] | null>();

  for (const [path, ranges] of parseChangedRanges(tryGit(['diff', '--unified=0', '--diff-filter=ACMR', mergeBase]))) {
    files.set(path, ranges);
  }

  for (const path of gitLines(['ls-files', '--others', '--exclude-standard'])) {
    files.set(path, null);
  }

  return {
    description:
      `lines changed vs merge base with ${baseRef} (${mergeBase.slice(0, 12)}), including staged, unstaged and untracked work ` +
      '(line-scoped: only comments touching a changed line)',
    files,
  };
}

function allScope(): Scope {
  return {
    description: 'the whole tree, every comment (reporting mode)',
    files: wholeFiles([...gitLines(['ls-files']), ...gitLines(['ls-files', '--others', '--exclude-standard'])]),
  };
}

function explicitScope(paths: readonly string[]): Scope {
  return {
    description: `${paths.length} explicitly named path(s), every comment`,
    files: wholeFiles(paths.map(path => toRepoPath(resolve(REPO_ROOT, path)))),
  };
}

function parseArguments(argv: readonly string[]): {
  all: boolean;
  base?: string;
  fixSafe: boolean;
  json: boolean;
  paths: string[];
} {
  const paths: string[] = [];
  let all = false;
  let base: string | undefined;
  let fixSafe = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;

    if (argument === '--all') {
      all = true;
    } else if (argument === '--fix-safe') {
      fixSafe = true;
    } else if (argument === '--json') {
      json = true;
    } else if (argument === '--base') {
      base = argv[index + 1];
      index += 1;

      if (base === undefined) fail('lint:source-hygiene: --base needs a git ref.');
    } else if (argument.startsWith('--base=')) {
      base = argument.slice('--base='.length);
    } else if (argument.startsWith('-')) {
      fail(`lint:source-hygiene: unknown option '${argument}'. ` + 'Usage: check-source-hygiene [--all] [--base <ref>] [--json] [--fix-safe] [paths...]');
    } else {
      paths.push(argument);
    }
  }

  return { all, base, fixSafe, json, paths };
}

const { all, base, fixSafe, json, paths } = parseArguments(process.argv.slice(2));

if (all && paths.length > 0) fail('lint:source-hygiene: --all and explicit paths are mutually exclusive.');
if (fixSafe && json) fail('lint:source-hygiene: --fix-safe and --json are mutually exclusive.');

const scope = paths.length > 0 ? explicitScope(paths) : all ? allScope() : changedScope(base ?? defaultBaseRef());

const scanned: string[] = [];
const violations: Violation[] = [];

let dashesFixed = 0;
let filesFixed = 0;

for (const [repoPath, ranges] of [...scope.files].sort(([a], [b]) => a.localeCompare(b))) {
  if (!isScannable(repoPath)) continue;

  const absolutePath = resolve(REPO_ROOT, repoPath);

  if (absolutePath === SELF_PATH) continue;
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;

  scanned.push(repoPath);

  if (fixSafe) {
    const fixed = fixFile(absolutePath, ranges);

    if (fixed > 0) {
      dashesFixed += fixed;
      filesFixed += 1;
    }

    continue;
  }

  violations.push(...scanFile(repoPath, absolutePath, ranges));
}

const scanLine = `lint:source-hygiene: scanned ${scanned.length} source file(s) in scope: ${scope.description}.`;

if (fixSafe) {
  console.log(
    `${scanLine} Normalized ${dashesFixed} typographic dash(es) in ${filesFixed} file(s); ` + 're-run without --fix-safe for the findings that need a human.',
  );
  process.exit(0);
}

if (json) {
  console.log(JSON.stringify(violations));
  console.error(scanLine);
  process.exit(violations.length === 0 ? 0 : 1);
}

if (violations.length === 0) {
  console.log(`${scanLine} No development provenance found.`);
  process.exit(0);
}

for (const violation of violations) {
  console.error(`${violation.file}:${violation.line}: ${violation.rule}: ${violation.text}`);
}

const affected = new Set(violations.map(violation => violation.file)).size;

console.error(`\n${scanLine}`);
fail(
  `lint:source-hygiene: ${violations.length} development-provenance violation(s) in ${affected} file(s). ` +
    'Keep the durable technical rationale and drop how it was discovered; see the source-comment section of AGENTS.md.',
);
