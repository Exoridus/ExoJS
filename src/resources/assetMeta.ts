import type { AssetDefinitions } from './AssetDefinitions';

/** Descriptor metadata stamped onto a handle-hybrid catalog leaf. */
export interface AssetMeta {
  readonly kind: keyof AssetDefinitions;
  readonly src: string;
  readonly opts?: unknown;
}

/** Symbol under which {@link AssetMeta} rides on a handle-hybrid leaf. @internal */
export const assetMeta: unique symbol = Symbol('exo.assetMeta');

/** Stamp {@link AssetMeta} onto a handle (non-enumerable); returns the handle. @internal */
export function stampMeta<T extends object>(target: T, meta: AssetMeta): T {
  Object.defineProperty(target, assetMeta, { value: meta, enumerable: false, configurable: false, writable: false });
  return target;
}

/** Read the {@link AssetMeta} off a value, or `undefined` if not stamped. @internal */
export function readMeta(value: unknown): AssetMeta | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as { [assetMeta]?: AssetMeta })[assetMeta];
}
