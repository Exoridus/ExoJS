/**
 * The canonical form of a file suffix: no leading dots, lower case. Every table
 * keyed by a suffix - built-in, per-application, per-request - normalizes
 * through this, so `.PNG`, `png` and `..png` are one key.
 * @internal
 */
export function normalizeExtension(extension: string): string {
  return extension.replace(/^\.+/, '').toLowerCase();
}
