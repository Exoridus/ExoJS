/**
 * Whether the browsers a project targets can run the engine's two render
 * backends.
 *
 * Only the explicit forms of a browserslist query are evaluated - `chrome >= 90`
 * and `chrome 90`. Everything else (`defaults`, `last 2 versions`, `> 0.5%`)
 * depends on the browserslist database, which resolves differently every time it
 * is updated; reporting such a query as unevaluated is honest, while guessing at
 * it would produce an answer that silently goes stale.
 */

/** The first version of each browser that runs WebGL2. */
const WEBGL2_MINIMUM = new Map<string, number>([
  ['and_chr', 56],
  ['chrome', 56],
  ['edge', 79],
  ['firefox', 51],
  ['ios_saf', 15],
  ['opera', 43],
  ['safari', 15],
  ['samsung', 6.2],
]);

/** The first version of each browser that runs WebGPU. */
const WEBGPU_MINIMUM = new Map<string, number>([
  ['and_chr', 121],
  ['chrome', 113],
  ['edge', 113],
  ['firefox', 141],
  ['ios_saf', 26],
  ['opera', 99],
  ['safari', 26],
  ['samsung', 24],
]);

/** Browserslist spells one browser several ways; these are the names the tables use. */
const BROWSER_ALIASES = new Map<string, string>([
  ['and_chr', 'and_chr'],
  ['android', 'and_chr'],
  ['chrome', 'chrome'],
  ['chromeandroid', 'and_chr'],
  ['edge', 'edge'],
  ['ff', 'firefox'],
  ['firefox', 'firefox'],
  ['ios', 'ios_saf'],
  ['ios_saf', 'ios_saf'],
  ['opera', 'opera'],
  ['safari', 'safari'],
  ['samsung', 'samsung'],
]);

/** One resolved browserslist query, with the backends its lowest version supports. */
export interface BrowserTarget {
  /** Canonical browser name. */
  readonly browser: string;
  /** The lowest version the query admits, which is what decides support. */
  readonly version: number;
  readonly webgl2: boolean;
  readonly webgpu: boolean;
}

/** What {@link evaluateBrowserTargets} could and could not resolve. */
export interface BrowserTargetReport {
  readonly targets: readonly BrowserTarget[];
  /** Queries that need the browserslist database to resolve. */
  readonly unevaluated: readonly string[];
}

/**
 * Split `chrome >= 90` / `chrome 90` into its parts, or return nothing for any
 * other browserslist query. Hand-parsed rather than matched with one pattern:
 * a browserslist file is input this tool does not control, and the pattern that
 * would express this shape nests quantifiers.
 */
const parseQuery = (query: string): { browser: string; version: number } | null => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const name = words[0];
  const comparator = words.length === 3 ? words[1] : undefined;
  const versionText = words.length === 3 ? words[2] : words[1];

  if (name === undefined || versionText === undefined || words.length > 3) return null;
  if (words.length === 3 && comparator !== '>=') return null;

  const browser = BROWSER_ALIASES.get(name);
  const version = Number(versionText);

  if (browser === undefined || !Number.isFinite(version) || version <= 0) return null;

  return { browser, version };
};

/**
 * Resolve browserslist queries against the engine's backend requirements.
 *
 * An unknown browser is reported as unevaluated rather than as unsupported: the
 * tables here list what the engine is known to run on, not every browser there
 * is.
 */
export const evaluateBrowserTargets = (queries: readonly string[]): BrowserTargetReport => {
  const targets: BrowserTarget[] = [];
  const unevaluated: string[] = [];

  for (const query of queries) {
    const trimmed = query.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const parsed = parseQuery(trimmed);

    if (parsed === null) {
      unevaluated.push(trimmed);
      continue;
    }

    const { browser, version } = parsed;
    const webgl2Minimum = WEBGL2_MINIMUM.get(browser);
    const webgpuMinimum = WEBGPU_MINIMUM.get(browser);

    targets.push({
      browser,
      version,
      webgl2: webgl2Minimum !== undefined && version >= webgl2Minimum,
      webgpu: webgpuMinimum !== undefined && version >= webgpuMinimum,
    });
  }

  return { targets, unevaluated };
};
