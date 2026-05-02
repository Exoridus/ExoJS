import { Tween } from './Tween';

export class TweenManager {
    private _tweens: Array<Tween> = [];
    private _destroyed = false;

    /**
     * Create a new Tween targeting `target`, register it with this manager, and
     * return it. Call .to(...).start() on the result to begin animating.
     */
    public create<T extends object>(target: T): Tween<T> {
        const tween = new Tween(target);
        tween._attachManager(this);
        this._tweens.push(tween as Tween);

        return tween;
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
     * Advance all active tweens by deltaSeconds. Called once per frame by
     * Application.update(). Uses a snapshot of the list so that callbacks that
     * add or remove tweens do not corrupt mid-iteration.
     */
    public update(deltaSeconds: number): this {
        if (this._destroyed) return this;

        const snapshot = this._tweens.slice();

        for (const tween of snapshot) {
            tween.update(deltaSeconds);
        }

        return this;
    }

    /**
     * Remove all tweens immediately. No callbacks (onComplete etc.) fire.
     * The tweens' states are left as-is; they are simply evicted from the list.
     */
    public clear(): this {
        this._tweens = [];

        return this;
    }

    /** Tear down the manager. Clears tweens and makes subsequent updates no-ops. */
    public destroy(): void {
        this.clear();
        this._destroyed = true;
    }
}
