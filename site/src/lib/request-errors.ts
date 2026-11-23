export type RequestFailureKind = 'http' | 'network' | 'timeout' | 'cancelled' | 'invalid-response';

/** A transport failure, never a source or runtime diagnostic. */
export class RequestError extends Error {
  constructor(
    public readonly kind: RequestFailureKind,
    public readonly url: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    const reason = kind === 'http' ? `HTTP ${String(status)}` : kind.replace('-', ' ');
    super(`Could not load ${url}: ${reason}.`, options);
    this.name = 'RequestError';
  }
}
