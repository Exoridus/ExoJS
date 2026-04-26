// URL + localStorage helpers for the shared `?v=<version>&ex=<example>` shape.
// Centralising these keeps routing logic out of Lit components and makes the
// legacy-hash migration a single well-defined step.

const VERSION_PARAM = 'v';
const EXAMPLE_PARAM = 'ex';
const VERSION_STORAGE_KEY = 'exojs-examples:selected-version';

export interface UrlState {
  version: string | null;
  example: string | null;
}

export interface WriteUrlOptions {
  replace?: boolean;
}

export function readUrlState(): UrlState {
  const url = new URL(window.location.href);
  return {
    version: url.searchParams.get(VERSION_PARAM),
    example: url.searchParams.get(EXAMPLE_PARAM),
  };
}

export function writeUrlState(
  state: Partial<UrlState>,
  options: WriteUrlOptions = {},
): void {
  const url = new URL(window.location.href);

  if ('version' in state) {
    applyParam(url.searchParams, VERSION_PARAM, state.version ?? null);
  }

  if ('example' in state) {
    applyParam(url.searchParams, EXAMPLE_PARAM, state.example ?? null);
  }

  // Always clear any residual legacy hash — we migrate away from it.
  url.hash = '';

  const target = url.toString();

  if (options.replace) {
    window.history.replaceState(null, '', target);
  } else {
    window.history.pushState(null, '', target);
  }
}

function applyParam(params: URLSearchParams, name: string, value: string | null): void {
  if (value === null || value === '') {
    params.delete(name);
  } else {
    params.set(name, value);
  }
}

export function buildExampleHref(examplePath: string, versionId: string | null): string {
  const params = new URLSearchParams();
  if (versionId) params.set(VERSION_PARAM, versionId);
  if (examplePath) params.set(EXAMPLE_PARAM, examplePath);
  const query = params.toString();
  return query ? `?${query}` : '';
}

// Returns the legacy `#<path>` contents (without the leading `#`) if present,
// otherwise null. Callers treat this as a fallback for `ex` resolution when
// the query param is missing.
export function readLegacyHash(): string | null {
  const hash = window.location.hash;
  if (!hash || hash === '#') return null;
  return decodeURIComponent(hash.slice(1));
}

// Best-effort persistence of the user's last-picked version. Defaults do not
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
    // Ignore storage errors (private mode, quota, disabled). The URL remains
    // the source of truth; losing the sticky-default is acceptable.
  }
}
