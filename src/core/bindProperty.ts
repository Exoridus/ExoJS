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
 * and for a property of type `string` also observables of numbers, which the
 * binding converts with `String`.
 */
export type BindableSource<V> = ReadonlyObservable<V> | ([V] extends [string] ? ReadonlyObservable<number> : never);

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
 * again; the binding does not watch the property. When the property currently
 * holds a string, numbers from the source are converted with `String`. A
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

  return bindWith(target, source, true, value => {
    record[key] = toText && typeof value !== 'string' ? String(value) : value;
  });
};

/**
 * Calls `write` with every change of `source`, and with its current value
 * first when `writeNow` is set, until the returned function is called or
 * `target` is destroyed when it is a {@link SceneNode}.
 * @internal
 */
export const bindWith = (
  target: object,
  source: ReadonlyObservable<unknown>,
  writeNow: boolean,
  write: (value: unknown) => void,
): (() => void) => {
  if (writeNow) {
    write(source.value);
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
    } else {
      addNodeTeardown(node, unbind);
    }
  }

  return unbind;
};
