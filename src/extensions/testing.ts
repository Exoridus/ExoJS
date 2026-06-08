// NOT listed in package.json "exports".
// Tests import via direct source path, not via package specifier.
import { _clearRegistryStore } from './ExtensionRegistry';

/**
 * Reset the global ExtensionRegistry to empty state.
 * For use in test suites only. Import via direct source path:
 *   import { resetExtensionRegistryForTesting } from 'src/extensions/testing';
 */
export function resetExtensionRegistryForTesting(): void {
  _clearRegistryStore();
}
