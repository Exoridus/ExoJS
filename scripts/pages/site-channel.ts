import { pathToFileURL } from 'node:url';

/**
 * The site channel build contract.
 *
 * One Pages project site carries two channels: Stable at `/ExoJS/` and Next at
 * `/ExoJS/next/`. A build selects its channel with `EXOJS_SITE_CHANNEL` and may
 * name its base with `EXOJS_SITE_BASE`; the base ends up in every URL the
 * build emits, so only the canonical pairs are accepted. A custom base exists
 * for local experiments only (`EXOJS_SITE_LOCAL_TEST=1`), is refused on CI and
 * is recorded in `site-build.json` so the publisher can refuse it as well.
 *
 * Dependency-free and erasable TypeScript: the Astro config, the site build
 * and the Pages publisher (which runs with plain `node` and no install) all
 * read this one table.
 */

export type SiteChannel = 'stable' | 'next';

export const SITE_CHANNELS: readonly SiteChannel[] = ['stable', 'next'];

export const SITE_CHANNEL_BASE: Readonly<Record<SiteChannel, string>> = { stable: '/ExoJS/', next: '/ExoJS/next/' };

/** The branch whose pushes publish each channel. */
export const SITE_CHANNEL_BRANCH: Readonly<Record<SiteChannel, string>> = { stable: 'main', next: 'next' };

export interface SiteChannelConfig {
  readonly channel: SiteChannel;
  readonly basePath: string;
  /** A non-canonical base accepted for a local experiment; never publishable. */
  readonly localTest: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/**
 * A base path that can be interpolated into a URL, an HTML attribute or a
 * shell word without escaping: `/`, or `/seg/.../` of letters, digits, `.`,
 * `_` and `-`, with no empty, `.` or `..` segment.
 */
export const isSafeBasePath = (value: string): boolean => {
  if (value === '/') {
    return true;
  }

  if (!value.startsWith('/') || !value.endsWith('/')) {
    return false;
  }

  return value
    .slice(1, -1)
    .split('/')
    .every(segment => SEGMENT.test(segment) && segment !== '.' && segment !== '..');
};

const isChannel = (value: string): value is SiteChannel => (SITE_CHANNELS as readonly string[]).includes(value);

const channelForBase = (base: string): SiteChannel | null => SITE_CHANNELS.find(channel => SITE_CHANNEL_BASE[channel] === base) ?? null;

/**
 * Resolves the channel a site build targets from its environment. Unset keeps
 * the Stable site at `/ExoJS/`. Throws on an unknown channel, a contradictory
 * pair, or a non-canonical base outside explicit local test mode.
 */
export const resolveSiteChannel = (env: Env): SiteChannelConfig => {
  const rawChannel = env['EXOJS_SITE_CHANNEL'] ?? '';
  const rawBase = env['EXOJS_SITE_BASE'] ?? '';
  const localTest = env['EXOJS_SITE_LOCAL_TEST'] === '1';

  if (rawChannel !== '' && !isChannel(rawChannel)) {
    throw new Error(`EXOJS_SITE_CHANNEL must be one of ${SITE_CHANNELS.join(', ')}; got ${JSON.stringify(rawChannel)}.`);
  }

  if (rawBase === '') {
    const channel = rawChannel === '' ? 'stable' : rawChannel;

    return { channel, basePath: SITE_CHANNEL_BASE[channel], localTest: false };
  }

  if (!isSafeBasePath(rawBase)) {
    throw new Error(`EXOJS_SITE_BASE must look like /segment/.../ with safe segments; got ${JSON.stringify(rawBase)}.`);
  }

  const canonicalChannel = channelForBase(rawBase);

  if (canonicalChannel !== null) {
    if (rawChannel !== '' && rawChannel !== canonicalChannel) {
      throw new Error(`EXOJS_SITE_BASE ${rawBase} is the ${canonicalChannel} base and contradicts EXOJS_SITE_CHANNEL=${rawChannel}.`);
    }

    return { channel: canonicalChannel, basePath: rawBase, localTest: false };
  }

  if (!localTest) {
    throw new Error(
      `EXOJS_SITE_BASE ${rawBase} is not a published base (${SITE_CHANNELS.map(channel => SITE_CHANNEL_BASE[channel]).join(', ')}); ` +
        'set EXOJS_SITE_LOCAL_TEST=1 to build it for a local experiment.',
    );
  }

  if (env['GITHUB_ACTIONS'] === 'true' || env['CI'] === 'true') {
    throw new Error('EXOJS_SITE_LOCAL_TEST is refused on CI: a CI site build must target a published base.');
  }

  if (rawChannel === '') {
    throw new Error('EXOJS_SITE_LOCAL_TEST needs an explicit EXOJS_SITE_CHANNEL for its custom base.');
  }

  return { channel: rawChannel, basePath: rawBase, localTest: true };
};

/** The channel a push to `branch` publishes, or `null` for any other ref. */
export const channelForBranch = (branch: string): SiteChannel | null => SITE_CHANNELS.find(channel => SITE_CHANNEL_BRANCH[channel] === branch) ?? null;

/** Where an explicit channel switch leads; a local test build has no counterpart. */
export const counterpartBasePath = (config: SiteChannelConfig): string | null =>
  config.localTest ? null : SITE_CHANNEL_BASE[config.channel === 'stable' ? 'next' : 'stable'];

/**
 * `$GITHUB_OUTPUT` lines for building `ref`: a long-lived branch builds its own
 * channel, every other ref the unconfigured default.
 */
export const siteChannelOutputs = (ref: string): string[] => {
  const channel = channelForBranch(ref) ?? 'stable';

  return [`channel=${channel}`, `base=${SITE_CHANNEL_BASE[channel]}`];
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${siteChannelOutputs(process.env['SITE_REF'] ?? '').join('\n')}\n`);
}
