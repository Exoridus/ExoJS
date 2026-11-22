/** Disjoint, ordered slices of the already selected catalog; each runner stays serial. */
export const selectSmokeShard = <T>(entries: readonly T[], shard?: string): T[] => {
  if (shard === undefined) {
    return [...entries];
  }

  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);

  if (!match || !Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count) {
    throw new Error(`Invalid smoke shard ${JSON.stringify(shard)}; use a one-based index/count.`);
  }

  if (entries.length === 0 || count > entries.length) {
    throw new Error(`Smoke shard ${shard} would produce an empty catalog partition (${entries.length} entries).`);
  }

  return entries.filter((_entry, position) => position % count === index - 1);
};
