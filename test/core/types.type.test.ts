import { describe, expectTypeOf, it } from 'vitest';

import type { DeepReadonly } from '#core/types';

interface Theme {
  name: string;
  spacing: { pad: number; gap: number };
  insets: number[];
  origin: [number, number];
  slots: Map<string, { fill: string }>;
  tags: Set<string>;
  format: (value: number) => string;
}

describe('DeepReadonly', () => {
  it('makes nested properties read-only at every level', () => {
    expectTypeOf<DeepReadonly<Theme>['name']>().toEqualTypeOf<string>();
    expectTypeOf<DeepReadonly<Theme>>().toEqualTypeOf<{
      readonly name: string;
      readonly spacing: { readonly pad: number; readonly gap: number };
      readonly insets: readonly number[];
      readonly origin: readonly [number, number];
      readonly slots: ReadonlyMap<string, { readonly fill: string }>;
      readonly tags: ReadonlySet<string>;
      readonly format: (value: number) => string;
    }>();
  });

  it('rejects a write through any level', () => {
    // Type-only: the body is never invoked, the `@ts-expect-error` comments are
    // the assertions. Running it would fail on the empty placeholder object.
    const writeEverywhere = (theme: DeepReadonly<Theme>) => {
      // @ts-expect-error top-level property is read-only
      theme.name = 'dark';
      // @ts-expect-error nested property is read-only
      theme.spacing.pad = 1;
      // @ts-expect-error an array loses its mutating methods
      theme.insets.push(2);
      // @ts-expect-error an array index is read-only
      theme.insets[0] = 3;
      // @ts-expect-error a tuple keeps its arity and loses its writes
      theme.origin[1] = 4;
      // @ts-expect-error a Map loses `set`
      theme.slots.set('a', { fill: 'red' });
      // @ts-expect-error a Set loses `add`
      theme.tags.add('b');
    };

    expectTypeOf(writeEverywhere).toBeFunction();
  });

  it('leaves primitives and call signatures alone', () => {
    expectTypeOf<DeepReadonly<number>>().toEqualTypeOf<number>();
    expectTypeOf<DeepReadonly<string | undefined>>().toEqualTypeOf<string | undefined>();
    expectTypeOf<DeepReadonly<Theme>['format']>().toBeCallableWith(1);
  });
});
