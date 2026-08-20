import type { AnyActionMap } from './ActionMap';

/**
 * One input context: the action maps that are in charge while it is the
 * topmost scope on a {@link SceneInputs} stack.
 *
 * A scope claims exactly the controls its maps currently bind. While it is
 * pushed, no scope below it - and no map attached outside the stack with
 * `scene.inputs.attach` - observes those controls at all, through neither live
 * values nor this frame's event history. Controls nothing in the scope binds
 * fall through untouched, so a pause menu that binds only Escape and the D-pad
 * leaves the gameplay below it fully playable if that is what the game wants.
 *
 * Maps within one scope are peers: they never mask each other, and two of them
 * binding the same control both see it.
 *
 * A scope groups MAPS, not actions. There is deliberately no `addAction` - an
 * action belongs to exactly one map for its lifetime, and a lone hotkey is a
 * one-action map rather than a second ownership path.
 *
 * @example
 * ```ts
 * const menu = new InputScope(new ActionMap({
 *   close: new ButtonAction(Keyboard.Escape),
 *   move: new VectorAction({ up: Keyboard.Up, down: Keyboard.Down }),
 * }));
 *
 * this.inputs.pushScope(menu);
 * // ... later
 * this.inputs.popScope(menu);
 * ```
 */
export class InputScope {
  private readonly _maps: AnyActionMap[] = [];

  public constructor(maps?: AnyActionMap | readonly AnyActionMap[]) {
    if (maps === undefined) {
      return;
    }

    // `Array.isArray` widens a `readonly T[] | T` narrowing to `any[]`;
    // annotating restores the element type for the loop below.
    const list: readonly AnyActionMap[] = Array.isArray(maps) ? maps : [maps];

    for (const map of list) {
      this.add(map);
    }
  }

  /** The maps in this scope, in the order they were added. */
  public get maps(): readonly AnyActionMap[] {
    return this._maps;
  }

  /**
   * Put `map` in this scope. A map already in it is not added twice.
   *
   * A map may only be in one scope at a time - it is sampled once per frame by
   * whichever level it sits on, and being on two levels would both double-sample
   * it and make its claim ambiguous.
   *
   * @throws {Error} If `map` already belongs to a different scope.
   */
  public add(map: AnyActionMap): this {
    const scope = scopeByMap.get(map);

    if (scope === this) {
      return this;
    }

    if (scope !== undefined) {
      throw new Error('InputScope: this ActionMap already belongs to another InputScope. Remove it there first.');
    }

    scopeByMap.set(map, this);
    this._maps.push(map);

    return this;
  }

  /** Take `map` out of this scope. A map that is not in it is ignored. */
  public remove(map: AnyActionMap): this {
    const index = this._maps.indexOf(map);

    if (index !== -1) {
      this._maps.splice(index, 1);
      scopeByMap.delete(map);
    }

    return this;
  }

  /** Collect every channel this scope currently claims. @internal */
  public _claimChannels(into: Set<number>): void {
    for (const map of this._maps) {
      if (map._isAvailable()) {
        map._claimChannels(into);
      }
    }
  }
}

/**
 * Which scope owns a given map.
 *
 * Membership is tracked here rather than on the map so that `ActionMap` stays
 * unaware of the scope layer: a map is perfectly usable without one, and the
 * only thing the map itself must guarantee is single ownership of its actions.
 */
const scopeByMap = new WeakMap<AnyActionMap, InputScope>();
