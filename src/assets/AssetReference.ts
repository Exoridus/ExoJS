/** A reference to an asset by its persisted type ID and logical source. */
export interface AssetReference {
  readonly $type: string;
  readonly source: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

type UntaggedAssetReference = Omit<AssetReference, '$type'>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Read a typed reference or either legacy Scene/Prefab form. @internal */
export const readAssetReference = (value: unknown): AssetReference | UntaggedAssetReference | null => {
  if (typeof value === 'string') {
    return { source: value };
  }

  if (!isRecord(value) || typeof value.source !== 'string') {
    return null;
  }

  const { $type, source, options } = value;

  if ('$type' in value && typeof $type !== 'string') {
    return null;
  }

  const reference = isRecord(options) ? { source, options } : { source };

  return typeof $type === 'string' ? { $type, ...reference } : reference;
};
