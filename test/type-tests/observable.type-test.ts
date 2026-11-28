import {
  live,
  type LiveResult,
  Observable,
  ObservableObject,
  type ObservableSize,
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

// Observable objects expose the data type directly, without casts.
interface PlayerStats {
  health: number;
  ammo: number;
  readonly level: number;
}
const stats = new ObservableObject<PlayerStats>({ health: 100, ammo: 30, level: 1 });
stats.health -= 10;
stats.ammo--;
// @ts-expect-error readonly properties stay readonly
stats.level++;
// @ts-expect-error the shape is fixed
stats.mana = 3;
const inferred = new ObservableObject({ health: 100, label: 'Hero' });
assertType<Equal<typeof inferred.label, string>>();
const summary = ObservableObject.map(stats, s => `${s.health} HP | ${s.ammo} Ammo`);
assertType<Equal<typeof summary, ReadonlyObservable<string>>>();
// @ts-expect-error a projection receives a read-only view
ObservableObject.map(stats, s => (s.health = 0));
// @ts-expect-error the initial value must be an object
export const primitive = new ObservableObject(5);

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
