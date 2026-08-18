/**
 * Fenced-code-block scanner shared by the guide snippet extractor and the
 * `no-check` budget that counts through it.
 *
 * A fence is matched wherever CommonMark allows one, not only in column 0: a
 * block written inside a list item carries the item's indentation, and a
 * scanner anchored to column 0 skips it entirely. Such a block is unchecked by
 * `typecheck:guides` and absent from the budget that bounds what is unchecked,
 * so it is invisible in both directions.
 *
 * The closing fence must repeat the indentation of its opening fence. Without
 * that, an indented fence pair sitting inside a wider block would close the
 * outer block early and the remainder of its body would be read as prose.
 */

export interface GuideFence {
  /** Language tag of the opening fence, lowercase-preserving, `''` when absent. */
  readonly lang: string;
  /** Rest of the opening fence line after the language tag, e.g. `' no-check'`. */
  readonly meta: string;
  /** Block content with the fence indentation removed from every line. */
  readonly body: string;
  /** Leading whitespace the fence pair is written at. */
  readonly indent: string;
}

const FENCE_RE = /^(?<indent>[ \t]*)```(?<lang>[a-zA-Z]+)?(?<meta>[^\n]*)?\n(?<body>[\s\S]*?)^\k<indent>```/gm;

/**
 * Removes the fence indentation from each body line. A line shorter than the
 * indentation (a blank line inside an indented block is usually written as a
 * genuinely empty line) is left as it is rather than being reported as a
 * malformed block.
 */
function dedent(body: string, indent: string): string {
  if (indent === '') return body;

  return body
    .split('\n')
    .map(line => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join('\n');
}

/** Every fenced code block in `content`, in source order. */
export function parseFences(content: string): GuideFence[] {
  const fences: GuideFence[] = [];

  for (const match of content.matchAll(FENCE_RE)) {
    const indent = match.groups?.indent ?? '';

    fences.push({
      lang: (match.groups?.lang ?? '').toLowerCase(),
      meta: match.groups?.meta ?? '',
      body: dedent(match.groups?.body ?? '', indent),
      indent,
    });
  }

  return fences;
}
