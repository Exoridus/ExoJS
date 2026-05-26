/**
 * Compile-time type contracts for key public APIs.
 *
 * Uses Vitest's built-in `expectTypeOf` to assert parameter types, return
 * types, and generic constraints — things that are invisible at runtime and
 * therefore not covered by the snapshot tests.  These assertions are checked
 * by the TypeScript compiler during `vitest run` / `tsc --noEmit`.
 *
 * Design note: type-only imports are used where instantiation would require
 * complex mock setup, letting us validate the shape without executing code.
 */

import type { Application } from '@/core/Application';
import { Signal } from '@/core/Signal';
import type { Texture } from '@/rendering/texture/Texture';

// ---------------------------------------------------------------------------
// Application — cursor API
// ---------------------------------------------------------------------------

describe('Application type contracts', () => {
  it('cursor getter returns string', () => {
    expectTypeOf<Application['cursor']>().toBeString();
  });

  it('setCursor accepts the documented cursor source union', () => {
    expectTypeOf<Application['setCursor']>().parameter(0)
      .toMatchTypeOf<string | Texture | HTMLImageElement | HTMLCanvasElement>();
  });

  it('setCursor returns Application for chaining', () => {
    expectTypeOf<Application['setCursor']>().returns
      .toEqualTypeOf<Application>();
  });

  it('onResize signal carries (width, height, app) tuple', () => {
    expectTypeOf<Application['onResize']>()
      .toEqualTypeOf<Signal<[number, number, Application]>>();
  });

  it('onFrame signal carries a Time argument', () => {
    type TimeArg = Parameters<Application['onFrame']['dispatch']>[0];
    expectTypeOf<TimeArg>().not.toBeNever();
  });

  it('onBackendLost and onBackendRestored are no-arg Signals', () => {
    expectTypeOf<Application['onBackendLost']>().toEqualTypeOf<Signal<[]>>();
    expectTypeOf<Application['onBackendRestored']>().toEqualTypeOf<Signal<[]>>();
  });

  it('pauseOnHidden is a boolean property', () => {
    expectTypeOf<Application['pauseOnHidden']>().toBeBoolean();
  });
});

// ---------------------------------------------------------------------------
// Signal — generic type safety for all public methods
// ---------------------------------------------------------------------------

describe('Signal<Args> generic type safety', () => {
  it('add handler parameter matches Args', () => {
    type Handler = Parameters<Signal<[number, string]>['add']>[0];
    expectTypeOf<Handler>().toMatchTypeOf<(n: number, s: string) => void | boolean>();
  });

  it('once has the same handler signature as add', () => {
    type AddHandler = Parameters<Signal<[boolean]>['add']>[0];
    type OnceHandler = Parameters<Signal<[boolean]>['once']>[0];
    expectTypeOf<AddHandler>().toEqualTypeOf<OnceHandler>();
  });

  it('dispatch returns the signal for chaining', () => {
    const sig = new Signal<[number]>();
    expectTypeOf(sig.dispatch).returns.toEqualTypeOf(sig);
  });

  it('Signal<[]> is not assignable to Signal<[number]>', () => {
    expectTypeOf<Signal<[]>>().not.toMatchTypeOf<Signal<[number]>>();
  });
});
