import { derive, isObservable, type ReadonlyObservable } from './Observable';

type LiveKind<V> = 0 extends 1 & V
  ? 'maybe'
  : [V] extends [ReadonlyObservable<unknown>]
    ? 'live'
    : unknown extends V
      ? 'maybe'
      : [Extract<V, ReadonlyObservable<unknown>>] extends [never]
        ? 'static'
        : 'maybe';

/**
 * The result of {@link live}: a derived observable string when a substitution
 * is always observable, a plain `string` when none can be, and the union of
 * both when a substitution is only sometimes observable (`any`, `unknown` or a
 * union with an observable).
 */
export type LiveResult<Values extends readonly unknown[]> = 'live' extends { [I in keyof Values]: LiveKind<Values[I]> }[number]
  ? ReadonlyObservable<string>
  : 'maybe' extends { [I in keyof Values]: LiveKind<Values[I]> }[number]
    ? string | ReadonlyObservable<string>
    : string;

const isThenable = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';

/**
 * Tagged template that keeps observable substitutions live:
 *
 * ```ts
 * const title = live`Health: ${health}`;          // ReadonlyObservable<string>
 * const position = live`Position: ${node.position}`; // "120, 80", updated on every move
 * ```
 *
 * Observable substitutions are read through `value` and converted with
 * `String` each time the text is computed; a source used several times is
 * subscribed once. Every other substitution is converted once, when the
 * template is evaluated, exactly like an ordinary template literal. Without
 * observable substitutions the result is a plain string and nothing is
 * subscribed. The derived string subscribes to its sources only while it has
 * subscribers itself.
 *
 * @throws {TypeError} If a substitution is a function or a promise. Neither is
 * re-read: pass an observable, or a value computed with `map`.
 */
export function live<const Values extends readonly unknown[]>(strings: TemplateStringsArray, ...values: Values): LiveResult<Values>;

export function live(strings: TemplateStringsArray, ...values: readonly unknown[]): string | ReadonlyObservable<string> {
  const sources: Array<ReadonlyObservable<unknown>> = [];
  const slots: number[] = [];
  const texts: string[] = [strings[0]!];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    if (typeof value === 'function' || isThenable(value)) {
      throw new TypeError(
        `live: substitution ${i + 1} is a ${typeof value === 'function' ? 'function' : 'promise'}, which is never re-read. Pass an observable or a mapped value instead.`,
      );
    }

    if (isObservable(value)) {
      let slot = sources.indexOf(value);

      if (slot === -1) {
        slot = sources.push(value) - 1;
      }

      slots.push(slot);
      texts.push(strings[i + 1]!);
    } else {
      texts[texts.length - 1] += String(value) + strings[i + 1]!;
    }
  }

  if (slots.length === 0) {
    return texts[0]!;
  }

  return derive(sources, () => {
    let text = texts[0]!;

    for (let i = 0; i < slots.length; i++) {
      text += String(sources[slots[i]!]!.value) + texts[i + 1]!;
    }

    return text;
  });
}
