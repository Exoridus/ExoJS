/**
 * The project's budget for the published Pages tree, measured in unpacked
 * bytes on disk. GitHub supports published sites up to 1 GB; these thresholds
 * leave headroom below that and are a project decision, not a GitHub limit.
 * A compressed artifact size says nothing about either.
 */

export const SITE_SIZE_WARN_BYTES = 750_000_000;

export const SITE_SIZE_REFUSE_BYTES = 900_000_000;

export interface SiteSizeThresholds {
  warn: number;
  refuse: number;
}

export interface SiteSizeVerdict {
  level: 'ok' | 'warn' | 'refuse';
  bytes: number;
  message: string;
}

export const evaluateSiteSize = (
  bytes: number,
  thresholds: SiteSizeThresholds = { warn: SITE_SIZE_WARN_BYTES, refuse: SITE_SIZE_REFUSE_BYTES },
): SiteSizeVerdict => {
  const amount = `${bytes.toLocaleString('en-US')} unpacked bytes`;

  if (bytes >= thresholds.refuse) {
    return { level: 'refuse', bytes, message: `${amount} reaches the ${thresholds.refuse.toLocaleString('en-US')}-byte refusal budget` };
  }

  if (bytes >= thresholds.warn) {
    return { level: 'warn', bytes, message: `${amount} reaches the ${thresholds.warn.toLocaleString('en-US')}-byte warning budget` };
  }

  return { level: 'ok', bytes, message: `${amount}, below the ${thresholds.warn.toLocaleString('en-US')}-byte warning budget` };
};
