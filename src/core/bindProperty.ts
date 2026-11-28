import { addNodeTeardown, removeNodeTeardown } from './nodeTeardown';
import type { ReadonlyObservable } from './Observable';
import { SceneNode } from './SceneNode';

type IfEqual<X, Y, Then, Else> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? Then : Else;

/**
 * The keys of `T` that name writable, non-function properties: fields and
 * accessors with a setter. Read-only fields, getter-only accessors and methods
 * are excluded.
 */
export type WritableKeys<T> = {
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? never : IfEqual<Pick<T, K>, { -readonly [Q in K]: T[Q] }, K, never>;
}[keyof T];

/**
 * The observables a property of type `V` can be bound to: observables of `V`,
 * and for a property of exactly type `string` also observables of numbers,
 * which the binding converts with `String`. Nullable strings and restricted
 * string types such as `'left' | 'right'` accept observables of `V` only;
 * convert numbers for them explicitly with `map`.
 */
export type BindableSource<V> =
  | ReadonlyObservable<V>
  | (string extends V ? ([V] extends [string] ? ReadonlyObservable<number> : never) : never);

/**
 * Writes `source.value` to `target[key]` now and after every change of
 * `source`, through the property's own setter, until the returned function is
 * called. The property keeps its ordinary type and value; nothing about it
 * becomes observable.
 *
 * ```ts
 * const unbind = bindProperty(label, 'text', live`Health: ${health}`);
 * ```
 *
 * A value assigned to the property directly stays until the source changes
 * again; the binding does not watch the property. When the property holds a
 * string at bind time, numbers from the source are converted with `String`;
 * every other value, such as `null`, is written unchanged. When the initial
 * write itself changes the source, for example through a setter that clamps
 * the value back into it, the property receives the changed value too. A
 * binding on a {@link SceneNode} ends when the node is destroyed; a binding on
 * any other object lasts until it is unbound or the source is destroyed.
 * Unbinding more than once is safe.
 *
 * @throws If the initial write throws, for example because the property has no
 * setter; nothing stays subscribed then.
 */
export const bindProperty = <T extends object, K extends WritableKeys<T>>(
  target: T,
  key: K,
  source: BindableSource<T[K]>,
): (() => void) => {
  const record = target as Record<PropertyKey, unknown>;
  const toText = typeof record[key] === 'string';

  return bindWith(target, source, value => {
    record[key] = toText && typeof value === 'number' ? String(value) : value;
  });
};

/**
 * Calls `write` with the current value of `source` and with every change,
 * until the returned function is called or `target` is destroyed when it is a
 * {@link SceneNode}. Pass `applied` when the target already received
 * `applied.value`, for example through its constructor; it is then written
 * again only if the source changed meanwhile.
 * @internal
 */
export const bindWith = (
  target: object,
  source: ReadonlyObservable<unknown>,
  write: (value: unknown) => void,
  applied?: { readonly value: unknown },
): (() => void) => {
  let written: unknown;

  if (applied === undefined) {
    written = source.value;
    write(written);
  } else {
    written = applied.value;
  }

  const node = target instanceof SceneNode ? target : null;
  // A listener notified earlier in the same delivery may have destroyed the node; its unbind only takes effect afterwards.
  const unsubscribe = source.subscribe(
    node === null
      ? write
      : value => {
          if (!node.destroyed) {
            write(value);
          }
        },
  );

  const unbind = (): void => {
    unsubscribe();

    if (node !== null) {
      removeNodeTeardown(node, unbind);
    }
  };

  if (node !== null) {
    if (node.destroyed) {
      unsubscribe();

      return unbind;
    }

    addNodeTeardown(node, unbind);
  }

  // A write or constructor that changed the source before the subscription existed produced no notification.
  const latest = source.value;

  if (!Object.is(latest, written)) {
    try {
      write(latest);
    } catch (error) {
      unbind();

      throw error;
    }
  }

  return unbind;
};
