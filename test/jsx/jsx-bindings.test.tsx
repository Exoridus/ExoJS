/** @jsxImportSource @codexo/exojs */
import { Button, Container, Label, live, Observable, ObservableVector, Panel, type ReadonlyObservable, Sprite, Stack } from '@codexo/exojs';
import type { JSX } from '@codexo/exojs/jsx';
import { jsxTransaction } from '@codexo/exojs/jsx';

import { useMockGlyphAtlas } from '../support/mock-glyph-atlas';

useMockGlyphAtlas();

const childrenOf = (node: JSX.Element): readonly JSX.Element[] => (node as Container).children;

class Failing extends Container {
  public constructor(options: { readonly fail?: boolean } = {}) {
    super();

    if (options.fail === true) {
      throw new Error('failed');
    }
  }
}

describe('JSX observable bindings', () => {
  test('binds live text, observable numbers and derived visibility on existing nodes', () => {
    const health = new Observable(100);
    const ammo = new Observable(30);
    const hud = (
      <Stack spacing={8}>
        <Label text={live`Health: ${health}`} />
        <Label text={live`Ammo: ${ammo} / 30`} />
        <Label text={health} />
        <Panel visible={health.map(n => n <= 0)}>
          <Label text="Game Over" />
        </Panel>
      </Stack>
    );
    const [healthLabel, ammoLabel, rawLabel, gameOver] = childrenOf(hud) as [Label, Label, Label, Panel];

    expect([healthLabel.text, ammoLabel.text, rawLabel.text, gameOver.visible]).toEqual(['Health: 100', 'Ammo: 30 / 30', '100', false]);

    health.value = 0;
    ammo.value--;

    expect(childrenOf(hud)[0]).toBe(healthLabel);
    expect([healthLabel.text, ammoLabel.text, rawLabel.text, gameOver.visible]).toEqual(['Health: 0', 'Ammo: 29 / 30', '0', true]);

    hud.destroy();
    expect(health.subscriberCount).toBe(0);
    expect(ammo.subscriberCount).toBe(0);
  });

  test('binds node properties and vectors through the existing setters', () => {
    const x = new Observable(5);
    const target = new ObservableVector(null, 0, 2, 3);
    const sprite = (<Sprite x={x} scale={target} />) as Sprite;

    x.value = 10;
    target.set(4, 4);

    expect(sprite.x).toBe(10);
    expect([sprite.scale.x, sprite.scale.y]).toEqual([4, 4]);
    expect(sprite.scale).not.toBe(target);

    sprite.destroy();
    expect(x.subscriberCount).toBe(0);
  });

  test('binds a construction option that is also a writable property', () => {
    const caption = new Observable('Start');
    const button = (<Button label={caption} />) as Button;

    caption.value = 'Resume';
    expect(button.label).toBe('Resume');

    button.destroy();
    expect(caption.subscriberCount).toBe(0);
  });

  test('passes observable construction arguments without a property setter to the constructor unchanged', () => {
    class Meter extends Container {
      public readonly source: ReadonlyObservable<number>;
      public caption: ReadonlyObservable<string> | string;

      public constructor(options: { readonly source: ReadonlyObservable<number>; readonly caption: ReadonlyObservable<string> | string }) {
        super();
        this.source = options.source;
        this.caption = options.caption;
      }
    }

    const health = new Observable(5);
    const caption = new Observable('HP');
    const meter = (<Meter source={health} caption={caption} />) as Meter;

    expect(meter.source).toBe(health);
    expect(meter.caption).toBe(caption);
    expect(health.subscriberCount).toBe(0);
    expect(caption.subscriberCount).toBe(0);

    meter.destroy();
  });

  test('applies a change the constructor made to a bound source', () => {
    const caption = new Observable('start');

    class Echo extends Container {
      private _label: string;

      public constructor(options: { readonly label: string }) {
        super();
        this._label = options.label;
        caption.value = options.label.toUpperCase();
      }

      public get label(): string {
        return this._label;
      }

      public set label(value: string) {
        this._label = value;
      }
    }

    const echo = (<Echo label={caption} />) as Echo;

    expect(echo.label).toBe('START');

    caption.value = 'next';
    expect(echo.label).toBe('next');

    echo.destroy();
    expect(caption.subscriberCount).toBe(0);
  });

  test('removes bindings when a later step of the element fails', () => {
    const health = new Observable(100);

    expect(() => (
      <Label
        text={health}
        x={health}
        ref={() => {
          throw new Error('ref failed');
        }}
      />
    )).toThrow('ref failed');
    expect(() => <Failing fail visible={health.map(n => n > 0)} />).toThrow('failed');

    expect(health.subscriberCount).toBe(0);
  });

  test('removes the bindings of every node in a failed transaction', () => {
    const health = new Observable(100);

    expect(() =>
      jsxTransaction(() => (
        <Container>
          <Label text={health} />
          <Failing fail />
        </Container>
      )),
    ).toThrow('failed');

    expect(health.subscriberCount).toBe(0);
  });
});
