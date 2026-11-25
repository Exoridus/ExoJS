/** Applies a value asset's synchronous transform before a promise can adopt its result. @internal */
export const parseAssetValue = (raw: unknown, parse?: (raw: unknown) => unknown): unknown => {
  const value = parse === undefined ? raw : parse(raw);

  if (typeof (value as { then?: unknown } | null)?.then === 'function') {
    try {
      void Promise.prototype.then.call(value, undefined, () => undefined);
    } catch {
      // Only native promises can be observed here without running an arbitrary thenable.
    }

    throw new Error('Asset parse() must be synchronous. Move asynchronous work into the asset handler load phase.');
  }

  return value;
};
