/**
 * Guide sources link site pages through the Stable base, `/ExoJS/`. A build
 * for another base moves those links onto its own base while it renders, so
 * Next pages stay under `/ExoJS/next/`.
 */
export const SOURCE_LINK_BASE = '/ExoJS/';

/** `href` on `basePath` when it is written against the source base; anything else unchanged. */
export const rewriteSiteHref = (href: string, basePath: string): string =>
  basePath !== SOURCE_LINK_BASE && href.startsWith(SOURCE_LINK_BASE) ? `${basePath}${href.slice(SOURCE_LINK_BASE.length)}` : href;
