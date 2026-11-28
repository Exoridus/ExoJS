/** @jsxImportSource @codexo/exojs */
import { Component, Container, Label, type SceneNode, Sprite } from '@codexo/exojs';
import type { JSX } from '@codexo/exojs/jsx';
import { jsxTransaction } from '@codexo/exojs/jsx';
import { jsx } from '@codexo/exojs/jsx-runtime';

import { useMockGlyphAtlas } from '../support/mock-glyph-atlas';

useMockGlyphAtlas();

const log: string[] = [];

class Recorder extends Component {
  public constructor(public readonly label: string) {
    super();
  }

  protected override onAttach(): void {
    log.push(`${this.label}:attach`);
  }

  protected override onDetach(): void {
    log.push(`${this.label}:detach`);
  }

  protected override onDestroy(): void {
    log.push(`${this.label}:destroy`);
  }
}

class Health extends Recorder {}
class Armor extends Recorder {}

class Failing extends Component {
  protected override onAttach(): void {
    throw new Error('attach failed');
  }
}

class Inspect extends Component<Container> {
  public seen: { readonly x: number; readonly children: number } | null = null;

  protected override onAttach(): void {
    this.seen = { x: this.node.x, children: this.node.children.length };
  }
}

/** A container recording every instance and the options it was constructed with. */
class Probe extends Container {
  public static readonly created: Probe[] = [];

  public constructor(public readonly options: { readonly tag?: string } = {}) {
    super();
    Probe.created.push(this);
  }
}

const fail = (): never => {
  throw new Error('ref failed');
};

beforeEach(() => {
  log.length = 0;
  Probe.created.length = 0;
});

describe('JSX components prop', () => {
  test('attaches the components in order after the node props and children, before the ref', () => {
    const inspect = new Inspect();
    const health = new Health('health');
    const order: string[] = [];

    const node = (
      <Probe x={7} components={[inspect, health]} ref={probe => order.push(`ref:${probe.components.length}`)}>
        <Label text="a" />
      </Probe>
    ) as Probe;

    expect(node.components).toEqual([inspect, health]);
    expect(node.getComponent(Health)).toBe(health);
    expect(inspect.seen).toEqual({ x: 7, children: 1 });
    expect(order).toEqual(['ref:2']);
    expect(log).toEqual(['health:attach']);
    expect(node.options).not.toHaveProperty('components');

    node.destroy();
    expect(health.destroyed).toBe(true);
  });

  test('accepts an empty or missing list', () => {
    const empty = <Container components={[]} />;
    const missing = jsx(Container, { components: undefined });

    expect(empty.components).toHaveLength(0);
    expect(missing.components).toHaveLength(0);

    empty.destroy();
    missing.destroy();
  });

  test('rejects a list that is not an array of components before constructing anything', () => {
    const health = new Health('health');

    expect(() => <Probe components={health as never} />).toThrow('must be an array of components');
    expect(() => <Probe components={[health, new Sprite() as never]} />).toThrow('is not a component');

    expect(Probe.created).toHaveLength(0);
    expect(health.attached).toBe(false);
  });
});

describe('JSX components prop failures', () => {
  test('detaches the components it attached, without destroying them, when a later one throws in onAttach', () => {
    const health = new Health('health');
    const armor = new Armor('armor');
    const failing = new Failing();
    const child = new Label('mine');

    expect(() => <Probe components={[health, armor, failing]}>{child}</Probe>).toThrow('attach failed');

    const [probe] = Probe.created;

    expect(probe!.destroyed).toBe(true);
    expect(log).toEqual(['health:attach', 'armor:attach', 'armor:detach', 'health:detach']);

    for (const component of [health, armor, failing]) {
      expect(component.attached).toBe(false);
      expect(component.destroyed).toBe(false);
    }

    expect(child.destroyed).toBe(false);
    expect(child.parent).toBeNull();

    // The components stay the caller's and can be attached again.
    const retry = <Container components={[health, armor]} />;

    expect(retry.components).toEqual([health, armor]);
    retry.destroy();
  });

  test('leaves a component attached to another node untouched', () => {
    const health = new Health('health');
    const armor = new Armor('armor');
    const owner = new Container();

    owner.addComponent(health);

    expect(() => <Probe components={[armor, health]} />).toThrow('already attached');

    expect(Probe.created[0]!.destroyed).toBe(true);
    expect(health.node).toBe(owner);
    expect(armor.attached).toBe(false);
    expect(armor.destroyed).toBe(false);

    owner.destroy();
  });

  test('detaches its components when the ref throws', () => {
    const health = new Health('health');

    expect(() => <Probe components={[health]} ref={fail} />).toThrow('ref failed');

    expect(Probe.created[0]!.destroyed).toBe(true);
    expect(health.attached).toBe(false);
    expect(health.destroyed).toBe(false);
    expect(log).toEqual(['health:attach', 'health:detach']);
  });

  test('attaches no component when a child attachment fails', () => {
    const health = new Health('health');
    const child = new Label('twice');

    expect(() => (
      <Probe components={[health]}>
        {child}
        {child}
      </Probe>
    )).toThrow('more than once');

    expect(Probe.created[0]!.destroyed).toBe(true);
    expect(health.attached).toBe(false);
    expect(log).toEqual([]);
    child.destroy();
  });

  test('keeps the components on a finished element that an enclosing element detaches', () => {
    const health = new Health('health');

    expect(() => (
      <Container ref={fail}>
        <Probe components={[health]} />
      </Container>
    )).toThrow('ref failed');

    const [probe] = Probe.created;

    expect(probe!.destroyed).toBe(false);
    expect(probe!.parent).toBeNull();
    expect(health.node).toBe(probe);

    probe!.destroy();
  });
});

describe('JSX components prop in a jsxTransaction', () => {
  test('detaches every component JSX attached in a failed tree, while a component a ref attached is destroyed', () => {
    const health = new Health('health');
    const armor = new Armor('armor');
    const viaRef = new Recorder('ref');

    expect(() =>
      jsxTransaction(() => (
        <Container ref={fail}>
          <Probe components={[health]} />
          <Probe components={[armor]} ref={(probe: SceneNode) => probe.addComponent(viaRef)} />
        </Container>
      )),
    ).toThrow('ref failed');

    expect(Probe.created.every(probe => probe.destroyed)).toBe(true);

    for (const component of [health, armor]) {
      expect(component.attached).toBe(false);
      expect(component.destroyed).toBe(false);
    }

    expect(viaRef.destroyed).toBe(true);
    expect(log).toEqual(['health:attach', 'armor:attach', 'ref:attach', 'armor:detach', 'health:detach', 'ref:detach', 'ref:destroy']);
  });

  test('detaches the components of a completed inner transaction when the outer one fails', () => {
    const health = new Health('health');
    let inner: JSX.Element | null = null;

    expect(() =>
      jsxTransaction(() => {
        inner = jsxTransaction(() => <Probe components={[health]} />);

        return <Container ref={fail}>{inner}</Container>;
      }),
    ).toThrow('ref failed');

    expect(inner!.destroyed).toBe(true);
    expect(health.attached).toBe(false);
    expect(health.destroyed).toBe(false);
  });

  test('destroys nothing when the tree succeeds', () => {
    const health = new Health('health');
    const tree = jsxTransaction(() => (
      <Container>
        <Probe components={[health]} />
      </Container>
    ));

    expect(health.node).toBe(Probe.created[0]);
    tree.destroy();
    expect(health.destroyed).toBe(true);
  });
});
