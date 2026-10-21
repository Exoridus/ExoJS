/**
 * The channel this site was built for, with the version, commit and time of
 * the build. Stable and Next share one origin, so anything a page stores per
 * channel goes through `channelStorageKey`.
 */

export interface SiteBuildInfo {
  readonly channel: 'stable' | 'next';
  readonly basePath: string;
  readonly sourceSha: string;
  readonly packageVersion: string;
  readonly createdAt: string;
  /** Base of the other channel for an explicit switch; `null` when there is none. */
  readonly counterpartBase: string | null;
}

// Outside a site build (unit tests importing site modules) the build constant
// is not defined; those callers get an unconfigured Stable identity.
export const siteBuild: SiteBuildInfo =
  typeof __EXOJS_SITE_BUILD__ === 'undefined'
    ? { channel: 'stable', basePath: '/ExoJS/', sourceSha: '', packageVersion: '', createdAt: '', counterpartBase: null }
    : __EXOJS_SITE_BUILD__;

const STORAGE_SCHEMA = 1;

/**
 * A Web Storage key scoped to this channel and base, so Stable and Next never
 * read each other's state on the shared origin.
 */
export const channelStorageKey = (name: string): string =>
  `exojs-site:v${STORAGE_SCHEMA}:${siteBuild.channel}:${siteBuild.basePath}:${name}`;
