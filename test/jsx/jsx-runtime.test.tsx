/** @jsxImportSource @codexo/exojs */
import { Button, Color, Container, Graphics, Label, Panel, Prefab, Sprite, Stack, Text } from '@codexo/exojs';
import type { JSX, JsxAdapterProps } from '@codexo/exojs/jsx';
import { Fragment, jsxConstruct, JsxFragment, jsxTransaction } from '@codexo/exojs/jsx';
import { jsx } from '@codexo/exojs/jsx-runtime';

import { useMockGlyphAtlas } from '../support/mock-glyph-atlas';

useMockGlyphAtlas();

interface MenuOptions {
  readonly title: string;
  readonly onStart: () => void;
  readonly children?: JSX.Element | readonly JSX.Element[];
}

const MainMenu = (options: MenuOptions): JSX.Element => (
  <Panel width={400} height={240}>
    <Stack spacing={12}>
      <Label text={options.title} />
      <Button label="Start" onClick={options.onStart} />
      {options.children}
    </Stack>
  </Panel>
);

/** A node class whose construction can be made to fail, recording every instance it creates. */
class Probe extends Container {
  public static readonly created: Probe[] = [];

  public constructor(options: { readonly fail?: boolean } = {}) {
    super();

    if (options.fail === true) {
      throw new Error('probe failed');
    }

    Probe.created.push(this);
  }
}

class Badge extends Sprite {
  public constructor(
    texture: null,
    public readonly rank: number,
  ) {
    super(texture);
  }

  public static override [jsxConstruct](props: JsxAdapterProps<{ readonly rank: number }>): Badge {
    return new this(null, props.rank);
  }
}

const childrenOf = (node: JSX.Element): readonly JSX.Element[] => (node as Container).children;

beforeEach(() => {
  Probe.created.length = 0;
});

describe('JSX construction', () => {
  test('builds the native hierarchy through the existing constructors and options', () => {
    const onContinue = vi.fn();
    const menu = (
      <Panel width={400} height={240}>
        <Stack spacing={12}>
          <Label text="Pause" />
          <Button label="Continue" onClick={onContinue} />
          <Button label="Settings" />
        </Stack>
      </Panel>
    );

    expect(menu).toBeInstanceOf(Panel);
    expect((menu as Panel).uiWidth).toBe(400);

    const stack = childrenOf(menu).find(child => child instanceof Stack)!;
    const items = stack.children;

    expect(stack.spacing).toBe(12);
    expect(items.map(item => item.constructor)).toEqual([Label, Button, Button]);
    expect((items[0] as Label).text).toBe('Pause');
    expect((items[1] as Button).label).toBe('Continue');

    const button = items[1] as Button;
    button.onClick.dispatch(button);

    expect(onContinue).toHaveBeenCalledWith(button);
    expect((items[2] as Button).onClick.count).toBe(0);

    menu.destroy();
  });

  test('adopts existing instances without reconstructing them', () => {
    const onResume = vi.fn();
    const resume = new Button({ label: 'Continue' });
    resume.onClick.add(onResume);

    const menu = (
      <Panel>
        <Stack spacing={12}>
          {resume}
          <Button label="Settings" />
        </Stack>
      </Panel>
    );

    const stack = childrenOf(menu).find(child => child instanceof Stack)!;

    expect(stack.children[0]).toBe(resume);
    expect(resume.parent).toBe(stack);
    expect(resume.onClick.count).toBe(1);

    menu.destroy();
  });

  test('flattens arrays, conditionals and fragments into the parent', () => {
    const labels = ['a', 'b'];
    const show = false;
    const node = (
      <Container>
        {labels.map(text => (
          <Label text={text} />
        ))}
        {show && <Label text="hidden" />}
        {null}
        <>
          <Label text="c" />
          <Label text="d" />
        </>
      </Container>
    );

    expect(childrenOf(node).map(child => (child as Label).text)).toEqual(['a', 'b', 'c', 'd']);
    expect(childrenOf(node).every(child => child.parent === node)).toBe(true);

    node.destroy();
  });

  test('keeps a top-level fragment as a plain container', () => {
    const group = (
      <>
        <Label text="a" />
        <Label text="b" />
      </>
    );

    expect(group).toBeInstanceOf(JsxFragment);
    expect(group).toBeInstanceOf(Container);
    expect(childrenOf(group)).toHaveLength(2);
    expect(jsx(Fragment, {})).toBeInstanceOf(JsxFragment);

    group.destroy();
  });

  test('assigns node properties through the existing setters', () => {
    const tint = new Color(255, 128, 0);
    const sprite = (
      <Sprite name="torch" x={10} y={20} rotation={45} scale={2} anchor={{ x: 0.5, y: 1 }} tint={tint} visible={false} zIndex={3} />
    );

    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.name).toBe('torch');
    expect([sprite.x, sprite.y, sprite.rotation]).toEqual([10, 20, 45]);
    expect([sprite.scale.x, sprite.scale.y]).toEqual([2, 2]);
    expect([(sprite as Sprite).anchor.x, (sprite as Sprite).anchor.y]).toEqual([0.5, 1]);
    expect((sprite as Sprite).tint.equals(tint)).toBe(true);
    expect(sprite.visible).toBe(false);
    expect(sprite.zIndex).toBe(3);

    sprite.destroy();
  });

  test('constructs positional classes through their adapters', () => {
    const text = <Text text="Score" fontSize={24} />;
    const badge = <Badge rank={3} />;

    expect((text as Text).text).toBe('Score');
    expect((badge as Badge).rank).toBe(3);

    text.destroy();
    badge.destroy();
  });

  test('adds handlers to lazily created interaction signals', () => {
    const onDown = vi.fn();
    const node = <Graphics onPointerDown={onDown} />;

    expect(node.onPointerDown.count).toBe(1);

    node.destroy();
  });

  test('calls ref once with the finished instance', () => {
    let seen: Panel | null = null;
    let childCount = -1;
    const node = (
      <Panel
        ref={panel => {
          seen = panel;
          childCount = panel.children.filter(child => child instanceof Label).length;
        }}
      >
        <Label text="x" />
      </Panel>
    );

    expect(seen).toBe(node);
    expect(childCount).toBe(1);

    node.destroy();
  });

  test('calls element functions with their props and children', () => {
    const onStart = vi.fn();
    const extra = new Label('extra');
    const menu = (
      <MainMenu title="Paused" onStart={onStart}>
        {extra}
      </MainMenu>
    );
    const stack = childrenOf(menu).find(child => child instanceof Stack)!;

    expect((stack.children[0] as Label).text).toBe('Paused');
    expect(stack.children[2]).toBe(extra);

    (stack.children[1] as Button).onClick.dispatch(stack.children[1] as Button);
    expect(onStart).toHaveBeenCalledOnce();

    menu.destroy();
  });

  test('produces data the existing serializers capture like an imperative tree', () => {
    const imperative = new Container();
    imperative.name = 'hud';
    const label = new Label('Score');
    label.setPosition(8, 4);
    imperative.addChild(label);

    const declared = (
      <Container name="hud">
        <Label text="Score" x={8} y={4} />
      </Container>
    );

    expect(JSON.stringify(Prefab.from(declared))).toBe(JSON.stringify(Prefab.from(imperative)));

    imperative.destroy();
    declared.destroy();
  });
});

describe('JSX construction failures', () => {
  test('rejects an unsupported child without destroying the children it was given', () => {
    const borrowed = new Label('mine');
    let created: JSX.Element | null = null;

    expect(() => (
      <Container>
        <Probe ref={probe => (created = probe)} />
        {borrowed}
        {'text' as unknown as JSX.Element}
      </Container>
    )).toThrow(TypeError);

    expect(created!.destroyed).toBe(false);
    expect(created!.parent).toBeNull();
    expect(borrowed.destroyed).toBe(false);
    expect(borrowed.parent).toBeNull();

    created!.destroy();
  });

  test('leaves the children untouched when a constructor throws', () => {
    const borrowed = new Label('mine');

    expect(() => (
      <Probe fail>
        <Probe />
        {borrowed}
      </Probe>
    )).toThrow('probe failed');

    expect(Probe.created).toHaveLength(1);
    expect(Probe.created[0]!.destroyed).toBe(false);
    expect(Probe.created[0]!.parent).toBeNull();
    expect(borrowed.destroyed).toBe(false);

    Probe.created[0]!.destroy();
  });

  test('destroys only the failing element and detaches every child it attached', () => {
    const borrowed = new Label('mine');
    const onClick = vi.fn();

    expect(() => (
      <Probe
        ref={() => {
          throw new Error('ref failed');
        }}
      >
        <Probe>
          <Button label="x" onClick={onClick} />
          {borrowed}
        </Probe>
      </Probe>
    )).toThrow('ref failed');

    const [inner, outer] = Probe.created;

    expect(outer!.destroyed).toBe(true);
    expect(inner!.destroyed).toBe(false);
    expect(inner!.parent).toBeNull();
    expect(inner!.children).toHaveLength(2);
    expect(borrowed.parent).toBe(inner);

    inner!.destroy();
  });

  test('treats a JSX-built instance created earlier exactly like one created with new', () => {
    const existing = <Button label="Continue" />;
    const imperative = new Button({ label: 'Continue' });
    const elsewhere = new Container();

    elsewhere.addChild(existing);
    elsewhere.removeChild(existing);

    expect(() => (
      <Panel
        ref={() => {
          throw new Error('ref failed');
        }}
      >
        {existing}
        {imperative}
      </Panel>
    )).toThrow('ref failed');

    expect(() => (
      <Probe fail>
        {existing}
        {imperative}
      </Probe>
    )).toThrow('probe failed');

    for (const node of [existing, imperative]) {
      expect(node.destroyed).toBe(false);
      expect(node.parent).toBeNull();
    }

    const panel = (
      <Panel>
        {existing}
        {imperative}
      </Panel>
    );

    expect(existing.parent).toBe(panel);
    panel.destroy();
    elsewhere.destroy();
  });

  test('rejects children that already have a parent or appear twice', () => {
    const owner = new Container();
    const owned = new Label('owned');
    owner.addChild(owned);
    const loose = new Label('loose');

    expect(() => <Container>{owned}</Container>).toThrow(/already has a parent/);
    expect(owned.parent).toBe(owner);
    expect(() => (
      <Container>
        {loose}
        {loose}
      </Container>
    )).toThrow(/more than once/);
    expect(loose.destroyed).toBe(false);
    expect(loose.parent).toBeNull();

    owner.destroy();
    loose.destroy();
  });

  test('detaches a child the parent rejected while attaching', () => {
    const constructed: JSX.Element[] = [];

    expect(() => (
      <Graphics>
        <Sprite ref={sprite => constructed.push(sprite)} />
        <Sprite ref={sprite => constructed.push(sprite)} />
      </Graphics>
    )).toThrow();

    expect(constructed).toHaveLength(2);
    expect(constructed.every(node => !node.destroyed && node.parent === null)).toBe(true);

    constructed.forEach(node => node.destroy());
  });

  test('keeps the original error and finishes cleanup when a teardown throws', () => {
    class Fragile extends Container {
      public override destroy(): void {
        super.destroy();

        throw new Error('teardown failed');
      }
    }

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => jsx(Fragile, { onMissing: () => undefined, children: jsx(Probe, {}) })).toThrow(/no signal named "onMissing"/);
    expect(Probe.created[0]!.parent).toBeNull();
    expect(error).toHaveBeenCalled();

    error.mockRestore();
    Probe.created[0]!.destroy();
  });

  test('rejects a fragment placed a second time', () => {
    const pair = (
      <>
        <Label text="a" />
        <Label text="b" />
      </>
    );
    const first = <Container>{pair}</Container>;

    expect(childrenOf(first)).toHaveLength(2);
    expect(() => <Container>{pair}</Container>).toThrow(/already placed/);

    first.destroy();
    pair.destroy();
  });

  test('rejects children on a node that is not a container', () => {
    const label = new Label('x');

    expect(() => jsx(Sprite, { children: label })).toThrow(/not a Container/);
    expect(label.destroyed).toBe(false);

    label.destroy();
  });

  test('rejects an element function that returns no node and an unknown signal', () => {
    const Broken = (_props: { readonly children?: JSX.Element }): JSX.Element => null as unknown as JSX.Element;

    expect(() => (
      <Broken>
        <Probe />
      </Broken>
    )).toThrow(/must return a scene node/);
    expect(Probe.created[0]!.destroyed).toBe(false);
    expect(() => jsx(Container, { onMissing: () => undefined })).toThrow(/no signal named "onMissing"/);

    Probe.created[0]!.destroy();
  });
});

describe('jsxTransaction', () => {
  test('returns the result and destroys nothing when construction succeeds', () => {
    const tree = jsxTransaction(() => (
      <Probe>
        <Probe />
      </Probe>
    ));

    expect(Probe.created.every(probe => !probe.destroyed)).toBe(true);
    expect(childrenOf(tree)).toHaveLength(1);

    tree.destroy();
  });

  test('destroys every node JSX built inside a failed tree and only detaches caller nodes', () => {
    const borrowed = new Label('mine');
    const existing = <Button label="kept" />;
    const button: Button[] = [];

    expect(() =>
      jsxTransaction(() => (
        <Probe
          ref={() => {
            throw new Error('ref failed');
          }}
        >
          <Probe>
            <Button label="x" ref={instance => button.push(instance)} />
            {borrowed}
            {existing}
          </Probe>
        </Probe>
      )),
    ).toThrow('ref failed');

    expect(Probe.created.every(probe => probe.destroyed)).toBe(true);
    expect(button[0]!.destroyed).toBe(true);

    for (const node of [borrowed, existing]) {
      expect(node.destroyed).toBe(false);
      expect(node.parent).toBeNull();
    }

    borrowed.destroy();
    existing.destroy();
  });

  test('destroys siblings built before a failing sibling and children of a failed constructor', () => {
    expect(() =>
      jsxTransaction(() => (
        <Container>
          <Probe />
          <Probe fail />
        </Container>
      )),
    ).toThrow('probe failed');
    expect(() =>
      jsxTransaction(() => (
        <Probe fail>
          <Probe />
        </Probe>
      )),
    ).toThrow('probe failed');

    expect(Probe.created).toHaveLength(2);
    expect(Probe.created.every(probe => probe.destroyed)).toBe(true);
  });

  test('removes a constructed node that a ref attached to a caller-owned container', () => {
    const ui = new Container();

    expect(() =>
      jsxTransaction(() => (
        <Container>
          <Probe ref={probe => ui.addChild(probe)} />
          {'text' as unknown as JSX.Element}
        </Container>
      )),
    ).toThrow(TypeError);

    expect(Probe.created[0]!.destroyed).toBe(true);
    expect(ui.children).toHaveLength(0);

    ui.destroy();
  });

  test('destroys a caller-owned node that a ref attached imperatively, unless the caller detaches it', () => {
    const attachedInRef = new Label('mine');
    const rescued = new Label('rescued');
    let host: Probe | null = null;

    const build = (child: Label): JSX.Element => (
      <Container>
        <Probe
          ref={probe => {
            host = probe;
            probe.addChild(child);
          }}
        />
        {'text' as unknown as JSX.Element}
      </Container>
    );

    expect(() => jsxTransaction(() => build(attachedInRef))).toThrow(TypeError);
    expect(attachedInRef.destroyed).toBe(true);

    expect(() =>
      jsxTransaction(() => {
        try {
          return build(rescued);
        } catch (error) {
          host!.removeChild(rescued);

          throw error;
        }
      }),
    ).toThrow(TypeError);
    expect(rescued.destroyed).toBe(false);
    expect(rescued.parent).toBeNull();

    rescued.destroy();
  });

  test('hands the nodes of a completed inner transaction to the enclosing one', () => {
    let rescued: JSX.Element | null = null;

    expect(() =>
      jsxTransaction(() => {
        const inner = jsxTransaction(() => <Probe />);

        try {
          jsxTransaction(() => <Probe fail />);
        } catch {
          rescued = inner;
        }

        throw new Error('outer failed');
      }),
    ).toThrow('outer failed');

    expect(rescued).not.toBeNull();
    expect(rescued!.destroyed).toBe(true);
  });

  test('covers element functions and nested fragments', () => {
    const Row = (props: { readonly children?: JSX.Element | readonly JSX.Element[] }): JSX.Element => <Probe>{props.children}</Probe>;

    expect(() =>
      jsxTransaction(() => (
        <Probe fail>
          <Row>
            <>
              <Probe />
            </>
          </Row>
        </Probe>
      )),
    ).toThrow('probe failed');

    expect(Probe.created).toHaveLength(2);
    expect(Probe.created.every(probe => probe.destroyed)).toBe(true);
  });
});
