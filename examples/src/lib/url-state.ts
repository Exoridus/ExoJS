// Hash-based routing for the examples playground.
//
// Canonical URL shape:  /#/<version>/<example-slug>
// Example:             /ExoJS/#/0.4.0/rendering/display-text
//
// The hash fragment is used so the site remains safe on GitHub Pages without
// requiring server-side rewrites.  No `.js` suffix appears in the URL; it is
// stripped on write and restored on read.  Slashes in the example path are
// preserved as-is — no `%2F` encoding.

const VERSION_STORAGE_KEY = 'exojs-examples:selected-version';

export interface UrlState {
  version: string | null;
  example: string | null;
}

export interface WriteUrlOptions {
  replace?: boolean;
}

// Parse the current hash into { version, example }.
// Expected shape:  #/<version>/<example-path-without-js>
// On any malformed or missing hash, both fields are null.
export function readUrlState(): UrlState {
  const hash = window.location.hash; // '#/0.4.0/rendering/display-text'
  if (!hash || hash === '#') return { version: null, example: null };

  // Fragment must start with '#/'
  if (!hash.startsWith('#/')) return { version: null, example: null };

  const fragment = hash.slice(2); // '0.4.0/rendering/display-text'
  if (!fragment) return { version: null, example: null };

  const slashIdx = fragment.indexOf('/');
  if (slashIdx === -1) {
    // Only a version, no example part.
    return { version: fragment || null, example: null };
  }

  const version = fragment.slice(0, slashIdx);
  const slug = fragment.slice(slashIdx + 1); // 'rendering/display-text'

  if (!version) return { version: null, example: null };
  if (!slug) return { version, example: null };

  // Restore the .js extension that catalog paths carry.
  const example = slug.endsWith('.js') ? slug : `${slug}.js`;
  return { version, example };
}

// Write version and/or example to the hash.  Partial updates are supported:
// passing only `version` preserves the current example, and vice-versa.
// Any legacy query-string params (?v=…&ex=…) are cleared on write.
export function writeUrlState(
  state: Partial<UrlState>,
  options: WriteUrlOptions = {},
): void {
  const current = readUrlState();

  const version = 'version' in state ? (state.version ?? null) : current.version;
  const example = 'example' in state ? (state.example ?? null) : current.example;

  const url = new URL(window.location.href);
  url.search = '';
  url.hash = _buildFragment(version, example);

  const target = url.toString();
  if (options.replace) {
    window.history.replaceState(null, '', target);
  } else {
    window.history.pushState(null, '', target);
  }
}

// Build a shareable href for a navigation link.
// Returns  #/<version>/<slug>  (no .js suffix, no %2F encoding).
export function buildExampleHref(examplePath: string, versionId: string | null): string {
  if (!versionId) return '#';
  const slug = examplePath.replace(/\.js$/, '');
  return `#/${versionId}/${slug}`;
}

// Best-effort persistence of the user's last-picked version.  Defaults do not
// get persisted — storage only records an explicit selection so wiping the
// key returns users to the latest-stable default.
export function loadStoredVersion(): string | null {
  try {
    return window.localStorage.getItem(VERSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeSelectedVersion(versionId: string): void {
  try {
    window.localStorage.setItem(VERSION_STORAGE_KEY, versionId);
  } catch {
    // Ignore storage errors (private mode, quota, disabled).
  }
}

// Build the fragment string (without the leading '#').
// An empty string means "no hash" (URL ends without #).
function _buildFragment(version: string | null, example: string | null): string {
  if (!version) return '';
  const slug = example ? example.replace(/\.js$/, '') : null;
  return slug ? `/${version}/${slug}` : `/${version}`;
}
