import type { Seconds } from '#core/units';

import { Tween } from './Tween';
import { TweenSequencer } from './TweenSequencer';
import { TweenState } from './types';

/**
 * Refill `cursor` with the contents of `source` and return it, without
 * allocating. The copy is what makes the walk tolerate a callback that mutates
 * `source` while it runs.
 */
const fill = <T>(cursor: T[], source: readonly T[]): T[] => {
  cursor.length = 0;

  for (const item of source) {
    cursor.push(item);
  }

  return cursor;
};

/** Any object that can be driven each frame by a delta in seconds. @internal */
interface Ticker {
  update(deltaSeconds: number): void;
  /** Cancel whatever this ticker is driving. Called by {@link TweenSystem.clear}. */
  stop?(): void;
}

/**
 * Owns and advances a collection of {@link Tween} instances, driving them
 * once per frame from {@link Application.update}. A tween enters the update
 * list when {@link Tween.start} is called and leaves it again on completion or
 * {@link Tween.stop}, so the system only ever holds tweens that are running
 * or paused - regardless of whether it was created here or handed over via
 * {@link TweenSystem.add}.
 *
 * Custom updatables (such as {@link TweenSequencer}) can be registered via
 * {@link TweenSystem.addTicker} so they share the same frame tick.
 *
 * Update iteration uses a snapshot so callbacks may freely add or remove
 * tweens during the same frame without corrupting the loop. Completed and
 * stopped tweens are evicted automatically.
 * @stable
 */
export class TweenSystem {
  private _tweens: Tween[] = [];
  private _tickers: Ticker[] = [];
  private _destroyed = false;

  /**
   * Reused iteration buffers for {@link preUpdate}. A tween callback may add or
   * remove entries while the frame is walking the list, so the walk has to read
   * a snapshot - but taking that snapshot with a fresh array would allocate two
   * arrays on every frame of every application that animates anything. These
   * are refilled in place instead, and their capacity survives across frames.
   *
   * Safe to hold as state because `preUpdate` is never re-entrant: it is driven
   * by one system phase, and a callback that reached it again would already be
   * corrupting the tween list it is iterating.
   */
  private readonly _tweenCursor: Tween[] = [];
  private readonly _tickerCursor: Ticker[] = [];

  /**
   * Create a new Tween bound to this system and return it. Call
   * `.to(...).start()` on the result to begin animating.
   *
   * The tween is only entered into the update list by {@link Tween.start} - a
   * tween that is configured but never started is not retained here, so it
   * cannot keep its target alive for the lifetime of the application.
   */
  public create<T extends object>(target: T): Tween<T> {
    const tween = new Tween(target);
    tween._attachSystem(this);

    return tween;
  }

  /**
   * Chain `tweens` in sequence: each tween starts automatically when the
   * previous one completes. Returns the first tween; call `.start()` on it
   * to kick off the whole sequence.
   *
   * All tweens are bound to this system, but only enter the update list when
   * they are actually started - the first through your own `.start()` call,
   * every later one through the chain. A sequence that is composed and never
   * started therefore leaves nothing behind here.
   *
   * @example
   * ```ts
   * const move = app.tweens.create(sprite).to({ x: 400 }, 0.5);
   * const fade = app.tweens.create(sprite.tint).to({ a: 0 }, 0.3);
   * app.tweens.sequence([move, fade]).start();
   * ```
   */
  public sequence(tweens: readonly Tween[]): Tween {
    const [first] = tweens;

    if (first === undefined) {
      throw new Error('[ExoJS] TweenSystem.sequence() requires at least one tween.');
    }

    for (let i = 0; i < tweens.length - 1; i++) {
      const current = tweens[i];
      const next = tweens[i + 1];
      if (current !== undefined && next !== undefined) current.chain(next);
    }

    // Bind only - `Tween.start` does the registering, and every link after the
    // first is started by `_complete()` on its predecessor. Pre-registering
    // them here would be redundant and would pin an unstarted sequence (and
    // its targets) in the application-wide system for good.
    for (const tween of tweens) {
      tween._attachSystem(this);
    }

    return first;
  }

  /**
   * Create a new {@link TweenSequencer} bound to this system and return it.
   * The sequencer registers itself automatically when {@link TweenSequencer.start}
   * is called, so no manual wiring is needed.
   *
   * @example
   * ```ts
   * app.tweens.createSequencer()
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
   * Take ownership of a stand-alone Tween (created via `new Tween(target)`, or
   * previously bound to a different system) so it participates in this update
   * loop: from here on, {@link Tween.start} enters it and completion or
   * {@link Tween.stop} evicts it again.
   *
   * Binding and entering are two separate steps. A tween that is already
   * running or paused is live - nothing will call `start()` on it again to
   * enter it - so it goes into the update list right away. An idle, completed
   * or stopped tween is bound only: retaining it would pin it, and through it
   * its target, in this system for the lifetime of the application while the
   * update loop has nothing to do with it.
   */
  public add(tween: Tween): this {
    tween._attachSystem(this);

    const isLive = tween.state === TweenState.Active || tween.state === TweenState.Paused;

    if (isLive && !this._tweens.includes(tween)) {
      this._tweens.push(tween);
    }

    return this;
  }

  /** Remove a tween from the system. Called automatically on stop/complete. */
  public remove(tween: Tween): this {
    const index = this._tweens.indexOf(tween);

    if (index !== -1) {
      this._tweens.splice(index, 1);
    }

    return this;
  }

  /**
   * Register a custom updatable so it is driven each frame alongside tweens.
   * Idempotent - registering the same ticker twice is a no-op.
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
   * advance all registered tickers. The {@link SystemMethods.preUpdate} phase,
   * at {@link SystemOrder.CoreTweens}. Uses snapshots so callbacks that add or
   * remove tweens/tickers do not corrupt mid-iteration.
   */
  public preUpdate(delta: Seconds): void {
    if (this._destroyed) return;

    const deltaSeconds = delta;
    const tweens = fill(this._tweenCursor, this._tweens);

    for (const tween of tweens) {
      tween.update(deltaSeconds);
    }

    const tickers = fill(this._tickerCursor, this._tickers);

    for (const ticker of tickers) {
      ticker.update(deltaSeconds);
    }

    // Dropped once the walk is done: holding the entries would keep a stopped
    // tween alive until the next frame overwrote its slot.
    tweens.length = 0;
    tickers.length = 0;
  }

  /**
   * Remove all tweens and tickers immediately. No callbacks fire.
   * Each tracked tween is {@link Tween.stop}ped first, and so is every ticker
   * that can be stopped, so their state reflects the eviction instead of
   * staying `Active`/`Paused` on something the system no longer drives - a
   * `Stopped` tween's own system binding survives, so a later
   * {@link Tween.start} re-enters it as usual.
   */
  public clear(): this {
    // Detach the list before stopping anything. `stop()` calls back into
    // `remove()`, which splices the live array - so iterating it directly would
    // skip entries, and iterating a copy would allocate one. Handing the field a
    // fresh array first makes every re-entrant `remove()` a miss on an empty
    // list instead, which is both allocation-free and cheaper than the scan.
    const tweens = this._tweens;
    const tickers = this._tickers;

    this._tweens = [];
    this._tickers = [];

    for (const tween of tweens) {
      tween.stop();
    }

    for (const ticker of tickers) {
      ticker.stop?.();
    }

    return this;
  }

  /** Tear down the system. Clears tweens and tickers and makes subsequent updates no-ops. */
  public destroy(): void {
    this.clear();
    this._destroyed = true;
  }
}
