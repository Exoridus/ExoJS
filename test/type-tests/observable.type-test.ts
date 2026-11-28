import {
  live,
  type LiveResult,
  Observable,
  type ObservableSize,
  type ObservableStruct,
  type ObservableVector,
  type ObservedValue,
  type ReadonlyObservable,
} from '@codexo/exojs';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <T extends true>(): T => true as T;

declare const position: ObservableVector;
declare const size: ObservableSize;

// Inference widens literals; explicit generics are honoured.
const health = new Observable(100);
const name = new Observable('Hero');
const target = new Observable<{ readonly id: number } | null>(null);
assertType<Equal<typeof health.value, number>>();
assertType<Equal<typeof name.value, string>>();
assertType<Equal<typeof target.value, { readonly id: number } | null>>();
health.value -= 10;
// @ts-expect-error the value keeps its type
health.value = 'full';

// map derives a read-only value of the projected type.
const status = health.map(hp => (hp > 50 ? 'Healthy' : 'Wounded'));
assertType<Equal<typeof status, ReadonlyObservable<'Healthy' | 'Wounded'>>>();
// @ts-expect-error derived values are read-only
status.value = 'Healthy';
assertType<Equal<ObservedValue<typeof status>, 'Healthy' | 'Wounded'>>();

// Vectors and sizes satisfy the shared contract with their own type as value.
export const observedPosition: ReadonlyObservable<ObservableVector> = position;
export const observedSize: ReadonlyObservable<ObservableSize> = size;
export const formatted: ReadonlyObservable<string> = position.map(p => `${p.x.toFixed(1)} | ${p.y.toFixed(1)}`);
position.x += 10;
position.set(100, 200);

// Structs keep exact member types and preserve existing observables.
const shared = new Observable(5);
const player = Observable.struct({
  name: 'Hero',
  health: 100,
  alive: true,
  inventory: ['sword'],
  position,
  status,
  shared,
  stats: Observable.struct({ ammo: 30, level: 1 }),
});
assertType<Equal<typeof player.name, Observable<string>>>();
assertType<Equal<typeof player.health, Observable<number>>>();
assertType<Equal<typeof player.alive, Observable<boolean>>>();
assertType<Equal<typeof player.inventory, Observable<string[]>>>();
assertType<Equal<typeof player.position, ObservableVector>>();
assertType<Equal<typeof player.status, ReadonlyObservable<'Healthy' | 'Wounded'>>>();
assertType<Equal<typeof player.shared, Observable<number>>>();
assertType<Equal<typeof player.stats.ammo, Observable<number>>>();
export const nested: ObservableStruct<{ ammo: number; level: number }> = player.stats;
player.health.value -= 10;
player.stats.ammo.value--;
// @ts-expect-error members are read-only; write through .value
player.health = new Observable(1);
// @ts-expect-error a member keeps its value type
player.name.value = 3;
declare const sometimes: number | Observable<number>;
const mixedStruct = Observable.struct({ sometimes });
export const mixedMember: Observable<number> = mixedStruct.sometimes;
// @ts-expect-error the members must be an object
export const primitiveStruct = Observable.struct(5);

// Batches take synchronous callbacks only.
Observable.batch(() => {
  player.health.value = 100;
  player.stats.level.value++;
});
// @ts-expect-error a batch callback must not return a promise
Observable.batch(async () => {
  player.health.value = 1;
});

// live returns a string without observable substitutions, a derived string otherwise.
const plain = live`Hello ${'Hero'} ${3}`;
const dynamic = live`Health: ${health} | ${position}`;
assertType<Equal<typeof plain, string>>();
assertType<Equal<typeof dynamic, ReadonlyObservable<string>>>();
declare const unknownValue: unknown;
assertType<Equal<LiveResult<[unknown]>, string | ReadonlyObservable<string>>>();
export const unknownResult: string | ReadonlyObservable<string> = live`${unknownValue}`;
declare const maybeObserved: Observable<number> | number;
const mixed = live`n ${maybeObserved} ${3}`;
assertType<Equal<typeof mixed, string | ReadonlyObservable<string>>>();
const anyResult = live`${JSON.parse('1') as any}`;
assertType<Equal<typeof anyResult, string | ReadonlyObservable<string>>>();
const sure = live`${maybeObserved} ${health}`;
assertType<Equal<typeof sure, ReadonlyObservable<string>>>();
