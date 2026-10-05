// Tween targets: only mutable, continuous numeric properties.

import { BlendModes, type Seconds, type Sprite, Tween, type TweenableKeys } from '@codexo/exojs';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

class GetterOnly {
  public get amount(): number {
    return 1;
  }
}

class AccessorPair {
  private _value = 0;

  public get value(): number {
    return this._value;
  }

  public set value(next: number) {
    this._value = next;
  }
}

interface Mixed {
  x: number;
  readonly fixed: number;
  mode: 0 | 1 | 2;
  blend: BlendModes;
  duration: Seconds;
  label: string;
  optional?: number;
}

type _MixedKeys = Expect<Equal<TweenableKeys<Mixed>, 'x' | 'duration' | 'optional'>>;

// @ts-expect-error a getter-only property is not writable
new Tween(new GetterOnly()).to({ amount: 2 }, 1);
const readonlyTarget: { readonly x: number } = { x: 1 };
// @ts-expect-error a readonly property is not writable
new Tween(readonlyTarget).to({ x: 2 }, 1);
declare const sprite: Sprite;
// @ts-expect-error a numeric enum is discrete: 1.5 is no blend mode
new Tween(sprite).to({ blendMode: BlendModes.Multiply }, 1);
// @ts-expect-error a numeric literal union is discrete as well
new Tween<Mixed>({} as Mixed).to({ mode: 2 }, 1);

new Tween(new AccessorPair()).to({ value: 2 }, 1);
new Tween(sprite).to({ rotation: 1 }, 1);
new Tween(sprite.position).to({ x: 10, y: 20 }, 1);
new Tween<Mixed>({} as Mixed).to({ x: 1, duration: 2 as Seconds, optional: 3 }, 1);
