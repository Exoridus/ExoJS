const enum RequestStatus {
  initialized,
  loading,
  finished,
  cancelled,
  failed,
}

class FetchRequest {
  private readonly _url: string;
  private readonly _requestOptions: RequestInit;
  private readonly _abortController: AbortController;
  private _response: Response | null = null;
  private _status: RequestStatus = RequestStatus.initialized;

  constructor(url: string, requestOptions: RequestInit) {
    this._url = url;
    this._abortController = new AbortController();
    this._requestOptions = {
      ...requestOptions,
      signal: this._abortController.signal,
    };
  }

  public async getJson<T>(): Promise<T | null> {
    const response = await this.getResponse();

    if (response === null) {
      return null;
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      console.error(`Error while parsing json response! (${this._url})`, error);
      return null;
    }
  }

  public async getText(): Promise<string | null> {
    const response = await this.getResponse();
    return response && (await response.text());
  }

  public async getResponse(): Promise<Response | null> {
    if (this._status !== RequestStatus.initialized) {
      return this._response;
    }

    this._status = RequestStatus.loading;

    try {
      this._response = await fetch(this._url, this._requestOptions);
      this._status = RequestStatus.finished;

      if (!this._response.ok) {
        console.error(`Response was not successful! (${this._url})`, this._response);
      }
    } catch (error) {
      console.error(`Error while fetching data! (${this._url})`, error);
      this._status = RequestStatus.failed;
    }

    return this._response;
  }

  public cancel(): void {
    if (this._status !== RequestStatus.loading) {
      return;
    }

    this._abortController.abort();
    this._status = RequestStatus.cancelled;
  }
}

const defaultRequestOptions: RequestInit = {
  cache: 'no-cache',
  method: 'GET',
  mode: 'cors',
};

const uniqueRequests = new Map<string, FetchRequest>();

export function createRequest(url: string): FetchRequest {
  return new FetchRequest(url, defaultRequestOptions);
}

export function createUniqueRequest(url: string): FetchRequest {
  const existing = uniqueRequests.get(url);

  if (existing) {
    existing.cancel();
  }

  const request = new FetchRequest(url, defaultRequestOptions);
  uniqueRequests.set(url, request);

  return request;
}
