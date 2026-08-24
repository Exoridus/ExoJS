import { Signal } from '#core/Signal';
import { browserNetworkHints, type OwnedNetworkHintSource } from '#platform/networkHints';
import type { NetworkHint, NetworkHintSource, PlatformSubscription } from '#platform/PlatformAdapter';

/**
 * What the environment appears to provide.
 *
 * `'unknown'` is a real answer, not a placeholder: a host that reports nothing
 * about reachability is genuinely not saying whether an origin can be reached,
 * and treating that as `'online'` would make the distinction unavailable to
 * anything that cares.
 */
export type ConnectivityState = NetworkHint;

/**
 * What the application allows.
 *
 * `'auto'` follows {@link Connectivity.state}. `'online'` and `'offline'` are
 * the application's own decision and override it - `'offline'` in particular is
 * a hard rule rather than a hint, and is what a "play offline" setting sets.
 */
export type NetworkMode = 'auto' | 'online' | 'offline';

/**
 * The connectivity facts one acquisition started under.
 *
 * A value, taken once and never updated: an acquisition that was allowed to
 * reach the network keeps that permission to completion, and a policy resolver
 * reading this cannot observe a change that happened after the decision it was
 * asked to make.
 *
 * It carries facts, not the service. Nothing downstream of an acquisition holds
 * a {@link Connectivity}, subscribes to it, or can change it.
 */
export interface NetworkSnapshot {
  /** Whether this acquisition may reach the network. */
  readonly allowsNetwork: boolean;
  /** What the environment appeared to provide. */
  readonly state: ConnectivityState;
  /** What the application allowed. */
  readonly mode: NetworkMode;
}

/**
 * What an acquisition assumes when nothing configured connectivity: the network
 * is permitted, and no claim is made about the environment.
 *
 * A loader built without a {@link Connectivity} is not offline - it simply has
 * nobody telling it otherwise, and refusing on no evidence would break every
 * such loader.
 */
export const unrestrictedNetwork: NetworkSnapshot = Object.freeze({ allowsNetwork: true, state: 'unknown', mode: 'auto' });

/**
 * Whether the application should reach the network at all, right now.
 *
 * Two separate questions, deliberately never equated:
 *
 * - {@link state} - what the environment appears to provide;
 * - {@link mode} - what the application allows.
 *
 * The state is a hint. `navigator.onLine === true` means the host has a network
 * interface, not that a given origin answers; a captive portal, a dead DNS
 * server and a firewalled origin all report as online. Nothing here promises
 * reachability, and code that needs certainty has to try.
 *
 * Connectivity is not cache-specific. It is an ordinary runtime service: UI
 * subscribes to it for an offline banner, and the cache uses it through a
 * {@link CachePolicyResolver} rather than reaching into it.
 *
 * @example
 * ```ts
 * app.connectivity.onStateChange.add(state => {
 *   offlineBanner.visible = state === 'offline';
 * });
 *
 * app.connectivity.mode = 'offline'; // no network acquisition from here on
 * ```
 */
export class Connectivity {
  /** Fires when {@link state} changes, with the new state. */
  public readonly onStateChange = new Signal<[ConnectivityState]>();
  /** Fires when {@link mode} changes, with the new mode. */
  public readonly onModeChange = new Signal<[NetworkMode]>();

  private readonly _subscription: PlatformSubscription;
  /** The source this instance built for itself, and must therefore tear down. */
  private readonly _ownedSource: OwnedNetworkHintSource | null;
  private _state: ConnectivityState;
  private _mode: NetworkMode = 'auto';

  /**
   * `source` is normally the application's {@link PlatformAdapter}, which
   * satisfies {@link NetworkHintSource}. Omit it to build one over the browser's
   * own signals - which is what lets a `Connectivity` exist BEFORE an
   * application does, so the same instance can be handed to a
   * {@link ConnectivityPolicyResolver} and to `ApplicationOptions.connectivity`.
   */
  public constructor(source?: NetworkHintSource) {
    this._ownedSource = source === undefined ? browserNetworkHints() : null;

    const hints = source ?? this._ownedSource!;

    this._state = hints.networkHint;
    this._subscription = hints.onNetworkHintChange(hint => this._setState(hint));
  }

  /**
   * What the environment appears to provide. A hint from the host, never a
   * promise that any particular origin is reachable.
   */
  public get state(): ConnectivityState {
    return this._state;
  }

  /**
   * What the application allows. Defaults to `'auto'`, which follows
   * {@link state}.
   *
   * Changing it affects acquisitions that START afterwards. One already in
   * flight keeps the contract it began under: a request that was allowed to
   * reach the network is not retroactively forbidden mid-transfer.
   */
  public get mode(): NetworkMode {
    return this._mode;
  }

  public set mode(value: NetworkMode) {
    if (value === this._mode) {
      return;
    }

    this._mode = value;
    this.onModeChange.dispatch(value);
  }

  /**
   * The facts an acquisition starting now would run under, as one immutable
   * value.
   *
   * This is what reaches a {@link CachePolicyResolver} and an asset type's
   * transport decision - never this object, so neither can subscribe to it,
   * hold it past the acquisition, or change it.
   */
  public snapshot(): NetworkSnapshot {
    return { allowsNetwork: this.allowsNetwork, state: this._state, mode: this._mode };
  }

  /**
   * Whether an acquisition starting now may use the network.
   *
   * `'unknown'` counts as permitted: the host is not saying the network is
   * gone, and refusing on no evidence would break every environment that
   * reports nothing.
   */
  public get allowsNetwork(): boolean {
    if (this._mode === 'offline') {
      return false;
    }

    if (this._mode === 'online') {
      return true;
    }

    return this._state !== 'offline';
  }

  /**
   * Stops listening to the host and clears the signals.
   *
   * A hint source handed in belongs to whoever built it - normally the
   * application's platform adapter, which outlives this - and is left alone;
   * one this instance built for itself is torn down here.
   */
  public destroy(): void {
    this._subscription();
    this._ownedSource?.destroy();
    this.onStateChange.destroy();
    this.onModeChange.destroy();
  }

  private _setState(state: ConnectivityState): void {
    if (state === this._state) {
      return;
    }

    this._state = state;
    this.onStateChange.dispatch(state);
  }
}
