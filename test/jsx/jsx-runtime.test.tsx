/** @jsxImportSource @codexo/exojs */
import { Button, Color, Container, Graphics, Label, Panel, Prefab, Sprite, Stack, Text } from '@codexo/exojs';
import type { JSX, JsxAdapterProps } from '@codexo/exojs/jsx';
import { Fragment, jsxConstruct, JsxFragment } from '@codexo/exojs/jsx';
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
    const sprite = <Sprite name="torch" x={10} y={20} rotation={45} scale={2} anchor={{ x: 0.5, y: 1 }} tint={tint} visible={false} zIndex={3} />;

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
    const menu = <MainMenu title="Paused" onStart={onStart}>{extra}</MainMenu>;
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
  test('rejects an unsupported child, destroying constructed siblings but not caller nodes', () => {
    const borrowed = new Label('mine');
    let created: JSX.Element | null = null;

    expect(() => (
      <Container>
        <Probe ref={probe => (created = probe)} />
        {borrowed}
        {'text' as unknown as JSX.Element}
      </Container>
    )).toThrow(TypeError);

    expect(created).not.toBeNull();
    expect(created!.destroyed).toBe(true);
    expect(borrowed.destroyed).toBe(false);
    expect(borrowed.parent).toBeNull();
  });

  test('rolls back when a constructor throws', () => {
    const borrowed = new Label('mine');

    expect(() => (
      <Probe fail>
        <Probe />
        {borrowed}
      </Probe>
    )).toThrow('probe failed');

    expect(Probe.created).toHaveLength(1);
    expect(Probe.created[0]!.destroyed).toBe(true);
    expect(borrowed.destroyed).toBe(false);
    expect(borrowed.parent).toBeNull();
  });

  test('rolls back an attached tree when a later step throws, detaching nested caller nodes first', () => {
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

    expect(Probe.created).toHaveLength(2);
    expect(Probe.created.every(probe => probe.destroyed)).toBe(true);
    expect(borrowed.destroyed).toBe(false);
    expect(borrowed.parent).toBeNull();
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
  });

  test('rejects children on a node that is not a container', () => {
    expect(() => jsx(Sprite, { children: new Label('x') })).toThrow(/not a Container/);
  });

  test('rejects an element function that returns no node and an unknown signal', () => {
    const constructed: JSX.Element[] = [];
    const Broken = (_props: { readonly children?: JSX.Element }): JSX.Element => null as unknown as JSX.Element;

    expect(() => (
      <Broken>
        <Probe ref={probe => constructed.push(probe)} />
      </Broken>
    )).toThrow(/must return a scene node/);
    expect(constructed[0]!.destroyed).toBe(true);
    expect(() => jsx(Container, { onMissing: () => undefined })).toThrow(/no signal named "onMissing"/);
  });
});
