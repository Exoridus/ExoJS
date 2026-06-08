import type { AssetBinding } from '@/extensions/Extension';

/**
 * Core asset bindings — empty in PR-1. Built-in asset types continue to be
 * registered through the existing _registerBuiltinFactories() path in Loader.
 * This array will be populated in PR-2 when factories are migrated to the
 * AssetBinding model and _registerBuiltinFactories is removed.
 * @internal
 */
export const coreAssetBindings: readonly AssetBinding[] = Object.freeze([]);
