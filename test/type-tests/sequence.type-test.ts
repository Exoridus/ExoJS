// Sequencer contracts: result inference through yield* waits, start, all and
// race, the waitFor overloads, and what a sequence may yield.

import {
  type Seconds,
  type Sequence,
  type SequenceContext,
  type SequenceGenerator,
  type SequenceHandle,
  type SequenceOperation,
  Sequencer,
  type SequenceSettlement,
  Signal,
  type Tween,
  tweenOperation,
} from '@codexo/exojs';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const pan = function* (context: SequenceContext): SequenceGenerator<number> {
  yield* context.wait(1);

  return 1;
};

const roar: Sequence<string> = function* (context) {
  yield* context.wait(0.5);

  return 'roar';
};

const confirm = new Signal<[button: string, repeat: boolean]>();
declare const operation: SequenceOperation<boolean>;
declare const tween: Tween<{ x: number }>;

const sequencer = new Sequencer();

const run = sequencer.play(function* (context) {
  const panned = yield* pan(context);
  type _Panned = Expect<Equal<typeof panned, number>>;

  const shake = context.start(roar);
  type _Shake = Expect<Equal<typeof shake, SequenceHandle<string>>>;

  const both = yield* context.all([pan, shake]);
  type _Both = Expect<Equal<typeof both, [number, string]>>;

  const first = yield* context.race([pan, roar, c => c.waitFor(confirm)]);
  type _First = Expect<Equal<typeof first, number | string | [button: string, repeat: boolean]>>;

  const args = yield* context.waitFor(confirm);
  type _Args = Expect<Equal<typeof args, [button: string, repeat: boolean]>>;

  const value = yield* context.waitFor(Promise.resolve(7));
  type _Value = Expect<Equal<typeof value, number>>;

  const joined = yield* context.waitFor(shake);
  type _Joined = Expect<Equal<typeof joined, string>>;

  const settled = yield* context.waitFor(operation);
  type _Settled = Expect<Equal<typeof settled, boolean>>;

  yield* context.waitFor(tweenOperation(tween));

  const delta = yield* context.nextFrame();
  type _Delta = Expect<Equal<typeof delta, Seconds>>;

  // @ts-expect-error - a condition returns a boolean.
  yield* context.waitFor(() => 'yes');

  return panned;
});
type _Run = Expect<Equal<typeof run, SequenceHandle<number>>>;

// @ts-expect-error - waits are delegated with yield*, never yielded as values.
sequencer.play(function* () {
  yield 5;
});

const outcome: Promise<SequenceSettlement<number>> = run.done;

export { outcome, run };
