import type { Time } from '#core/Time';

import { Tween } from './Tween';
import { TweenSequencer } from './TweenSequencer';

/** Any object that can be driven each frame by a delta in seconds. @internal */
interface Ticker {
  update(deltaSeconds: number): void;
}

/**
 * Owns and advances a collection of {@link Tween} instances, driving them
 * once per frame from {@link Application.update}. Created tweens are tracked
 * automatically; manually constructed tweens can be opted in via
 * {@link TweenManager.add}.
 *
 * Custom updatables (such as {@link TweenSequencer}) can be registered via
 * {@link TweenManager.addTicker} so they share the same frame tick.
 *
 * Update iteration uses a snapshot so callbacks may freely add or remove
 * tweens during the same frame without corrupting the loop. Completed and
 * stopped tweens are evicted automatically.
 * @stable
 */
export class TweenManager {
  private _tweens: Tween[] = [];
  private _tickers: Ticker[] = [];
  private _destroyed = false;

  /**
   * Create a new Tween targeting `target`, register it with this manager, and
   * return it. Call .to(...).start() on the result to begin animating.
   */
  public create<T extends object>(target: T): Tween<T> {
    const tween = new Tween(target);
    tween._attachManager(this);
    this._tweens.push(tween);

    return tween;
  }

  /**
   * Chain `tweens` in sequence: each tween starts automatically when the
   * previous one completes. Returns the first tween; call `.start()` on it
   * to kick off the whole sequence. All tweens are registered with this
   * manager (idempotent — already-added tweens are not double-added).
   *
   * @example
   * ```ts
   * const move = manager.create(sprite).to({ x: 400 }, 0.5);
   * const fade = manager.create(sprite).to({ alpha: 0 }, 0.3);
   * manager.sequence([move, fade]).start();
   * ```
   */
  public sequence(tweens: readonly Tween[]): Tween {
    const [first] = tweens;

    if (first === undefined) {
      throw new Error('[ExoJS] TweenManager.sequence() requires at least one tween.');
    }

    for (let i = 0; i < tweens.length - 1; i++) {
      const current = tweens[i];
      const next = tweens[i + 1];
      if (current !== undefined && next !== undefined) current.chain(next);
    }

    for (const tween of tweens) {
      this.add(tween);
    }

    return first;
  }

  /**
   * Create a new {@link TweenSequencer} bound to this manager and return it.
   * The sequencer registers itself automatically when {@link TweenSequencer.start}
   * is called, so no manual wiring is needed.
   *
   * @example
   * ```ts
   * scene.tweens.createSequencer()
   *   .then(fadeIn)
   *   .wait(0.5)
   *   .then([moveLeft, scaleUp])
   *   .onComplete(() => console.log('done'))
   *   .start();
   * ```
   */
  public createSequencer(): TweenSequencer {
    return new TweenSequencer(this);
  }

  /**
   * Explicitly add a stand-alone Tween (created via `new Tween(target)`)
   * to this manager so it participates in the update loop.
   */
  public add(tween: Tween): this {
    tween._attachManager(this);

    if (!this._tweens.includes(tween)) {
      this._tweens.push(tween);
    }

    return this;
  }

  /** Remove a tween from the manager. Called automatically on stop/complete. */
  public remove(tween: Tween): this {
    const index = this._tweens.indexOf(tween);

    if (index !== -1) {
      this._tweens.splice(index, 1);
    }

    return this;
  }

  /**
   * Register a custom updatable so it is driven each frame alongside tweens.
   * Idempotent — registering the same ticker twice is a no-op.
   *
   * Used internally by {@link TweenSequencer}.
   */
  public addTicker(ticker: Ticker): this {
    if (!this._tickers.includes(ticker)) {
      this._tickers.push(ticker);
    }

    return this;
  }

  /**
   * Remove a previously registered ticker. Called automatically by
   * {@link TweenSequencer} when it completes or is stopped.
   */
  public removeTicker(ticker: Ticker): this {
    const index = this._tickers.indexOf(ticker);

    if (index !== -1) {
      this._tickers.splice(index, 1);
    }

    return this;
  }

  /**
   * Advance all active tweens by the frame `delta` (read as seconds), then
   * advance all registered tickers. Ticked once per frame via
   * {@link Application.systems}. Uses snapshots so callbacks that add or
   * remove tweens/tickers do not corrupt mid-iteration.
   */
  public update(delta: Time): void {
    if (this._destroyed) return;

    const snapshot = [...this._tweens];

    for (const tween of snapshot) {
      tween.update(delta.seconds);
    }

    const tickerSnapshot = [...this._tickers];

    for (const ticker of tickerSnapshot) {
      ticker.update(delta.seconds);
    }
  }

  /**
   * @internal Invoked once per frame by {@link Application.update}'s
   * internal prepare stage, after audio and ahead of fixed steps — not a
   * public {@link System} phase. Thin wrapper over {@link TweenManager.update}.
   */
  public _prepareFrame(delta: Time): void {
    this.update(delta);
  }

  /**
   * Remove all tweens and tickers immediately. No callbacks fire.
   * The tweens' states are left as-is; they are simply evicted from the list.
   */
  public clear(): this {
    this._tweens = [];
    this._tickers = [];

    return this;
  }

  /** Tear down the manager. Clears tweens and tickers and makes subsequent updates no-ops. */
  public destroy(): void {
    this.clear();
    this._destroyed = true;
  }
}
