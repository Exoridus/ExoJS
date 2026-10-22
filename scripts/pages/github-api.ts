/**
 * The few GitHub REST calls the Pages publisher makes, with the workflow
 * token. The token is only ever sent to the API host: an artifact download
 * redirects to blob storage, and that request goes out without it. Errors
 * name the status and the API path, never a header.
 *
 * Dependency-free and erasable TypeScript, run with plain `node`.
 */

export interface GitHubClient {
  /** `owner/name` of the repository the workflow runs in. */
  readonly repository: string;
  /** GET an API path; `null` for a 404 when `allowMissing` is set. */
  getJson<T>(path: string, options?: { allowMissing?: boolean }): Promise<T | null>;
  /** GET an API path that answers with a redirect to a download, and return the bytes. */
  download(path: string): Promise<Buffer>;
}

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const createGitHubClient = (env: Readonly<Record<string, string | undefined>>): GitHubClient => {
  const token = env['GITHUB_TOKEN'] ?? '';
  const repository = env['GITHUB_REPOSITORY'] ?? '';
  const apiUrl = (env['GITHUB_API_URL'] ?? 'https://api.github.com').replace(/\/+$/, '');

  if (token === '') {
    throw new Error('[github-api] GITHUB_TOKEN is not set');
  }

  if (!REPOSITORY.test(repository)) {
    throw new Error(`[github-api] GITHUB_REPOSITORY ${JSON.stringify(repository)} is not owner/name`);
  }

  if (!apiUrl.startsWith('https://')) {
    throw new Error('[github-api] GITHUB_API_URL must be an https URL');
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const request = (path: string, redirect: RequestRedirect): Promise<Response> => {
    if (!path.startsWith('/')) {
      throw new Error(`[github-api] API path must start with a slash: ${path}`);
    }

    return fetch(`${apiUrl}${path}`, { headers, redirect });
  };

  return {
    repository,

    async getJson<T>(path: string, options: { allowMissing?: boolean } = {}): Promise<T | null> {
      const response = await request(path, 'follow');

      if (response.status === 404 && options.allowMissing) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`[github-api] GET ${path} answered ${response.status}`);
      }

      return (await response.json()) as T;
    },

    async download(path: string): Promise<Buffer> {
      const response = await request(path, 'manual');
      let body: Response = response;

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');

        if (location === null || !location.startsWith('https://')) {
          throw new Error(`[github-api] GET ${path} redirected without an https location`);
        }

        body = await fetch(location, { redirect: 'follow' });
      }

      if (!body.ok) {
        throw new Error(`[github-api] download of ${path} answered ${body.status}`);
      }

      return Buffer.from(await body.arrayBuffer());
    },
  };
};
