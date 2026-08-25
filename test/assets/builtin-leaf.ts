import { createLeaf } from '#assets/catalogLeaf';
import { builtinLeaf } from '#assets/coreAssetTypes';

/** Materializes the catalog leaf a built-in type hands out, the way `Assets.from` does. */
export const createBuiltinLeaf = (kind: string, src: string, opts?: unknown): object => {
  return createLeaf(builtinLeaf(kind), kind, src, opts);
};
