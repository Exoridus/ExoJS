import { derive, ObservableBase, observableData, type ObservableListener, type ReadonlyObservable } from './Observable';

/** Change notifications of one {@link ObservableObject}, kept outside the instance so no data property name is reserved. */
class ObjectObservation<T extends object> extends ObservableBase<T> {
  public constructor(private readonly _target: T) {
    super();
  }

  public get value(): T {
    return this._target;
  }

  public changed(): void {
    this._notify();
  }
}

const observations = new WeakMap<object, ObjectObservation<object>>();

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const observationOf = <T extends object>(source: T, caller: string): ObjectObservation<T> => {
  const observation = observations.get(source);

  if (observation === undefined) {
    throw new TypeError(`ObservableObject.${caller}(): the source is not an ObservableObject.`);
  }

  return observation as ObjectObservation<T>;
};

/**
 * Constructor and static helpers of {@link ObservableObject}. The helpers are
 * statics so that no property name of the data is reserved for observation.
 */
export interface ObservableObjectConstructor {
  /**
   * Copies the own enumerable properties of `initial` into a new, sealed
   * object whose properties notify on change. `initial` itself is not
   * modified or observed afterwards. To copy another observable object, spread
   * it first: `new ObservableObject({ ...stats })`.
   *
   * @throws {TypeError} If `initial` is not a plain object.
   */
  new <T extends object>(initial: T): ObservableObject<T>;

  /**
   * A read-only value computed from `source` by `project`, with the
   * semantics of {@link ReadonlyObservable.map}.
   *
   * @throws {TypeError} If `source` is not an ObservableObject.
   */
  map<T extends object, U>(source: ObservableObject<T>, project: (value: Readonly<T>) => U): ReadonlyObservable<U>;

  /**
   * Calls `listener` with `source` after any of its properties changed, until
   * the returned function is called. Ordering and reentrancy follow
   * {@link ReadonlyObservable.subscribe}.
   *
   * @throws {TypeError} If `source` is not an ObservableObject.
   */
  subscribe<T extends object>(source: ObservableObject<T>, listener: ObservableListener<Readonly<T>>): () => void;

  /**
   * Notifies the subscribers of `source` without assigning a property, for a
   * nested object or array that was changed in place.
   *
   * @throws {TypeError} If `source` is not an ObservableObject.
   */
  markChanged(source: ObservableObject<object>): void;

  readonly prototype: object;
}

/**
 * A fixed-shape object whose properties notify on assignment:
 *
 * ```ts
 * const stats = new ObservableObject({ health: 100, ammo: 30 });
 * const hud = ObservableObject.map(stats, s => `${s.health} HP | ${s.ammo} Ammo`);
 *
 * stats.health -= 10;
 * stats.ammo--;
 * ```
 *
 * Each property is a native getter and setter on the instance; assigning a
 * value that is equal by `Object.is` notifies nothing. Observation is shallow
 * and the shape is fixed: the object is sealed, so adding a property throws
 * in strict mode and deleting one fails. Objects and arrays can be stored as
 * property values, but changes inside them are not observed; reassign the
 * property or call {@link ObservableObjectConstructor.markChanged}. Spreading,
 * `Object.keys` and `JSON.stringify` see the current values.
 */
export type ObservableObject<T extends object> = T;

// The class body cannot declare a shape that depends on T, so the constructor is
// exported through the typed ObservableObjectConstructor signature instead.
class ObservableObjectImpl {
  public constructor(initial: object) {
    if (!isPlainObject(initial)) {
      throw new TypeError('ObservableObject: the initial value must be a plain object.');
    }

    const observation = new ObjectObservation<object>(this);

    for (const key of Object.keys(initial)) {
      let current = initial[key];

      Object.defineProperty(this, key, {
        configurable: false,
        enumerable: true,
        get: () => current,
        set: (value: unknown) => {
          if (!Object.is(current, value)) {
            current = value;
            observation.changed();
          }
        },
      });
    }

    Object.seal(this);
    observations.set(this, observation);
    observableData.add(this);
  }

  public static map<T extends object, U>(source: T, project: (value: Readonly<T>) => U): ReadonlyObservable<U> {
    return derive([observationOf(source, 'map')], () => project(source));
  }

  public static subscribe<T extends object>(source: T, listener: ObservableListener<Readonly<T>>): () => void {
    return observationOf(source, 'subscribe').subscribe(listener);
  }

  public static markChanged(source: object): void {
    observationOf(source, 'markChanged').changed();
  }
}

export const ObservableObject = ObservableObjectImpl as unknown as ObservableObjectConstructor;
