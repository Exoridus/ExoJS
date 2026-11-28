// Sequence contracts: result inference through run/start/all/race, and the
// signal and promise forms of waitFor.

import { type Scene, Sequence, type SequenceContext, type SequenceHandle, Signal } from '@codexo/exojs';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const pan = async (context: SequenceContext): Promise<number> => {
  await context.wait(1);

  return 1;
};

const roar = {
  run: (context: SequenceContext): Promise<string> => context.wait(0.5).then(() => 'roar'),
};

const confirm = new Signal<[button: string, repeat: boolean]>();

const intro = new Sequence(async context => {
  const panned = await context.run(pan);
  type _Panned = Expect<Equal<typeof panned, number>>;

  const shake = context.start(roar);
  type _Shake = Expect<Equal<typeof shake, SequenceHandle<string>>>;

  const both = await context.all([pan, shake]);
  type _Both = Expect<Equal<typeof both, [number, string]>>;

  const first = await context.race([pan, roar]);
  type _First = Expect<Equal<typeof first, number | string>>;

  const args = await context.waitFor(confirm);
  type _Args = Expect<Equal<typeof args, [button: string, repeat: boolean]>>;

  const value = await context.waitFor(Promise.resolve(7));
  type _Value = Expect<Equal<typeof value, number>>;

  // @ts-expect-error - waitUntil takes a boolean condition.
  await context.waitUntil(() => 'yes');

  return panned;
});

declare const scene: Scene;

const run = intro.start(scene);
type _Run = Expect<Equal<typeof run, SequenceHandle<number>>>;

export { run };
