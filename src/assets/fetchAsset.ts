import { AssetNetworkError } from './AssetNetworkError';
import { isAbortError } from './SharedAbort';

/**
 * Fetch `url` and return the response, or reject with an
 * {@link AssetNetworkError} carrying the URL, the HTTP status (when one
 * arrived) and the original rejection as `cause`.
 *
 * Shared by every built-in {@link CacheStrategy} so the network leg of a load
 * reports identically no matter which policy issued it.
 *
 * A cancellation is rethrown unwrapped: the residency dispatches on the
 * `AbortError` name to tell a deliberate cancel apart from a genuine failure,
 * and an envelope would rename it.
 * @internal
 */
export async function fetchAsset(url: string, requestOptions: RequestInit): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(url, requestOptions);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }

    // `fetch` rejects with an opaque `TypeError: Failed to fetch` that names
    // neither the URL nor the reason, so the URL and the original rejection
    // are all the diagnostics a caller can get.
    throw new AssetNetworkError({ url, message: `Failed to fetch "${url}".`, cause: error });
  }

  if (!response.ok) {
    throw new AssetNetworkError({
      url,
      message: `Failed to fetch "${url}" (${response.status} ${response.statusText}).`,
      status: response.status,
      statusText: response.statusText,
    });
  }

  return response;
}
