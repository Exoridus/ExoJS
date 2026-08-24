/**
 * Any abstract or concrete constructor whose instances are the resource an
 * asset type produces (e.g. `typeof Texture`, `typeof Sound`).
 *
 * Constructors act as the dispatch token of a constructor-bound asset binding:
 * they identify the type a request is routed to and take part in its resource
 * identity. A first-class {@link AssetType} carries its own stable string
 * identity instead and needs no constructor of its own.
 */

export type AssetConstructor<T = unknown> = abstract new (...args: any[]) => T;
