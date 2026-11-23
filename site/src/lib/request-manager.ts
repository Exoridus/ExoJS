import { RequestError } from './request-errors';

const REQUEST_TIMEOUT_MS = 15_000;

class FetchRequest {
  private readonly _abortController = new AbortController();
  private _finished = false;

  constructor(
    private readonly _url: string,
    private readonly _requestOptions: RequestInit,
    private readonly _onComplete?: () => void,
  ) {}

  public getJson<T>(): Promise<T> {
    return this.read(async response => {
      try {
        return (await response.json()) as T;
      } catch (cause) {
        throw new RequestError('invalid-response', this._url, undefined, { cause });
      }
    });
  }

  public getText(): Promise<string> {
    return this.read(response => response.text());
  }

  public getResponse(): Promise<Response> {
    return this.read(response => Promise.resolve(response));
  }

  public cancel(): void {
    if (!this._finished) {
      this._abortController.abort(new RequestError('cancelled', this._url));
    }
  }

  private async read<T>(consume: (response: Response) => Promise<T>): Promise<T> {
    const signal = this._abortController.signal;
    let onAbort = (): void => undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new RequestError('cancelled', this._url));
      signal.addEventListener('abort', onAbort, { once: true });

      if (signal.aborted) {
        onAbort();
      }
    });
    const timer = setTimeout(() => this._abortController.abort(new RequestError('timeout', this._url)), REQUEST_TIMEOUT_MS);

    try {
      return await Promise.race([
        cancelled,
        (async () => {
          const response = await fetch(this._url, { ...this._requestOptions, signal });

          if (!response.ok) {
            throw new RequestError('http', this._url, response.status);
          }

          return consume(response);
        })(),
      ]);
    } catch (cause) {
      if (cause instanceof RequestError) {
        throw cause;
      }

      throw new RequestError('network', this._url, undefined, { cause });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      this._finished = true;
      this._onComplete?.();
    }
  }
}

const defaultRequestOptions: RequestInit = { cache: 'no-cache', method: 'GET', mode: 'cors' };
const uniqueRequests = new Map<string, FetchRequest>();

export const createRequest = (url: string, options: RequestInit = {}): FetchRequest =>
  new FetchRequest(url, { ...defaultRequestOptions, ...options });

export const createUniqueRequest = (url: string): FetchRequest => {
  uniqueRequests.get(url)?.cancel();
  const request = new FetchRequest(url, defaultRequestOptions, () => {
    if (uniqueRequests.get(url) === request) {
      uniqueRequests.delete(url);
    }
  });
  uniqueRequests.set(url, request);

  return request;
};
