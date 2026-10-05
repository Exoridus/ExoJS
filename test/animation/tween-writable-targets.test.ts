import { Tween } from '#animation/Tween';

describe('tween targets must be writable', () => {
  test('a getter-only property throws a readable error when configured, before any frame', () => {
    const target = {
      get amount(): number {
        return 1;
      },
    };
    const untyped = new Tween(target) as unknown as Tween<{ amount: number }>;

    expect(() => untyped.to({ amount: 2 }, 1)).toThrow('Tween: property "amount" has a getter but no setter on the target, so it cannot be tweened.');
  });

  test('a getter-only property inherited from a class prototype is detected too', () => {
    class GetterOnly {
      public get amount(): number {
        return 1;
      }
    }
    const untyped = new Tween(new GetterOnly()) as unknown as Tween<{ amount: number }>;

    expect(() => untyped.to({ amount: 2 }, 1)).toThrow(/"amount" has a getter but no setter/);
  });

  test('a non-writable data property and a frozen target are rejected', () => {
    const readOnly = Object.defineProperty({}, 'x', { value: 1, writable: false, enumerable: true });
    const frozen = Object.freeze({ x: 1 });

    expect(() => (new Tween(readOnly) as unknown as Tween<{ x: number }>).to({ x: 2 }, 1)).toThrow(/"x" is read-only/);
    expect(() => (new Tween(frozen) as unknown as Tween<{ x: number }>).to({ x: 2 }, 1)).toThrow(/"x" is read-only/);
  });

  test('accessor pairs, plain fields and branded units keep working', () => {
    class Node {
      public x = 0;
      private _alpha = 1;

      public get alpha(): number {
        return this._alpha;
      }

      public set alpha(value: number) {
        this._alpha = value;
      }
    }
    const node = new Node();
    const tween = new Tween(node).to({ x: 10, alpha: 0 }, 1).start();

    tween.update(0.5);

    expect(node.x).toBe(5);
    expect(node.alpha).toBe(0.5);
  });

  test('a rejected configuration leaves the previous one in place', () => {
    const target = { x: 0 };
    const tween = new Tween(target).to({ x: 10 }, 1);

    Object.defineProperty(target, 'y', { value: 0, writable: false });

    expect(() => (tween as unknown as Tween<{ x: number; y: number }>).to({ x: 5, y: 1 }, 1)).toThrow(/"y" is read-only/);

    tween.start().update(1);

    expect(target.x).toBe(10);
  });
});
