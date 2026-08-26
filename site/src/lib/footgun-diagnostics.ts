/**
 * Playground editor: dropped-promise hints.
 *
 * The editor runs no linter - only Monaco's TypeScript language service - and
 * TypeScript has no floating-promise check of its own, which is why the rule
 * lives in ESLint. So an expression statement whose value is a promise reads as
 * perfectly fine in the editor while its rejection goes nowhere: the failure
 * surfaces later, somewhere unrelated, or not at all.
 *
 * That class is worth a squiggle for someone writing their own code in the
 * playground. It is not worth a second TypeScript program in the browser: the
 * committed catalog is already held to `@typescript-eslint/no-floating-promises`
 * by the repository's lint gate, so this layer only has to be useful, not
 * exhaustive.
 *
 * The approach is therefore deliberately partial. Candidate statements are found
 * by reading lines; each candidate's callee is then handed to the language
 * service, which answers with the real resolved signature. So the decision "is
 * this a promise" is exact - the compiler makes it - while the decision "is this
 * a statement worth asking about" is a heuristic.
 *
 * What it does not see:
 *
 * - a call spread across lines before its own argument list opens;
 * - a promise reached through anything but a plain identifier chain
 *   (`getThing().save();`, `handlers[key]();`);
 * - a promise produced without a call at all (`const p = fetch(...); p;`).
 *
 * Each of those is a miss, never a false alarm: the scan only proposes
 * candidates, and a candidate that is not a promise is dropped.
 */

/** One `displayPart` of a quick-info response, as the TypeScript worker returns them. */
export interface QuickInfoDisplayPart {
  readonly text: string;
  readonly kind: string;
}

/** The subset of the worker's quick-info response this module reads. */
export interface QuickInfoResponse {
  readonly displayParts?: readonly QuickInfoDisplayPart[];
}

/** A statement the line scan proposes, and the offset of the callee to ask about. */
export interface FootgunCandidate {
  /** 1-based line the statement starts on. */
  readonly lineNumber: number;
  /** 1-based column of the first character of the statement. */
  readonly column: number;
  /** 1-based column just past the callee's closing parenthesis position on this line. */
  readonly endColumn: number;
  /** 0-based offset of the callee's final identifier, which is what quick info is asked about. */
  readonly calleeOffset: number;
  /** The callee chain as written, e.g. `this.app.scenes.change`. */
  readonly callee: string;
}

/**
 * A statement that begins with an identifier chain followed by `(`. The chain
 * may start with `this`, and the line may open a multi-line argument list.
 */
const STATEMENT_CALL = /^((?:this\.)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/;

/**
 * Prefixes that already say what happens to the value. `void` and `await` are
 * the two answers this hint asks for, so a statement carrying one is finished.
 */
const HANDLED_PREFIX = /^(?:await|void|return|yield|new|delete|typeof)\b/;

/** A line that continues an argument list rather than starting a statement. */
const CONTINUES_ARGUMENTS = /[(,[{]$/;

const lineIsCandidate = (line: string, previous: string | undefined): boolean => {
  const trimmed = line.trim();

  if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
  if (HANDLED_PREFIX.test(trimmed)) return false;

  // `.then`/`.catch` on the same line means the caller already answered for the
  // rejection, whatever it did with the value.
  if (trimmed.includes('.then(') || trimmed.includes('.catch(')) return false;

  // An argument, not a statement: `foo(\n  bar.baz(x),\n)`.
  if (trimmed.endsWith(',')) return false;
  if (previous !== undefined && CONTINUES_ARGUMENTS.test(previous.trim())) return false;

  return STATEMENT_CALL.test(trimmed);
};

/**
 * Reads `text` and returns the call statements worth asking the language service
 * about, in source order.
 */
export const findFootgunCandidates = (text: string): FootgunCandidate[] => {
  const lines = text.split('\n');
  const candidates: FootgunCandidate[] = [];
  let offset = 0;

  for (const [index, line] of lines.entries()) {
    const lineStart = offset;
    offset += line.length + 1;

    if (!lineIsCandidate(line, index > 0 ? lines[index - 1] : undefined)) continue;

    const trimmed = line.trim();
    const match = STATEMENT_CALL.exec(trimmed);
    if (!match) continue;

    const callee = match[1];
    const indent = line.length - line.trimStart().length;
    // Quick info is asked at the final identifier of the chain, where the
    // language service reports the resolved signature rather than the receiver.
    const lastDot = callee.lastIndexOf('.');
    const calleeStart = indent + (lastDot === -1 ? 0 : lastDot + 1);

    candidates.push({
      lineNumber: index + 1,
      column: indent + 1,
      endColumn: indent + trimmed.length + 1,
      calleeOffset: lineStart + calleeStart,
      callee,
    });
  }

  return candidates;
};

/**
 * True when quick info describes something whose call signature returns a
 * promise.
 *
 * Reads the structured `displayParts` rather than the joined string: a parameter
 * or a receiver may well be named `Promise`, and only the part after the
 * signature's `):` decides. A generic `Promise<T>` and a bare `Promise` both
 * count, as does a union that contains one.
 */
export const returnsPromise = (info: QuickInfoResponse | undefined | null): boolean => {
  const parts = info?.displayParts;
  if (!parts || parts.length === 0) return false;

  let depth = 0;
  let seenReturn = false;

  for (const part of parts) {
    if (part.kind === 'punctuation') {
      if (part.text === '(') depth += 1;
      else if (part.text === ')') depth -= 1;
      // The return type of the outermost signature starts at its `:` - a `:`
      // inside the parameter list belongs to a parameter.
      else if (part.text === ':' && depth === 0) seenReturn = true;
    }

    if (seenReturn && part.text === 'Promise') return true;
  }

  return false;
};

/** The message a dropped-promise marker carries. */
export const footgunMessage = (callee: string): string =>
  `\`${callee}(...)\` returns a promise that nothing here waits for, so a failure inside it is discarded rather than reported. ` +
  `Write \`await\` to wait for it, \`.catch(...)\` to handle a failure, or \`void\` to say the result is deliberately ignored.`;
