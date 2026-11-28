/** @jsxImportSource @codexo/exojs */
import {
  AnimatedSprite,
  Button,
  Container,
  Graphics,
  Label,
  Panel,
  type RenderNode,
  Sprite,
  Stack,
  Text,
  type Texture,
  Video,
} from '@codexo/exojs';
import type { JSX, JsxAdapterProps, JsxChildren } from '@codexo/exojs/jsx';
import { jsxConstruct } from '@codexo/exojs/jsx';
import { PointLight } from '@codexo/exojs/lighting';

declare const texture: Texture;
declare const onAny: () => void;

// Every JSX expression has the common element type, not the concrete class.
const menu = (
  <Panel width={400} height={240}>
    <Stack spacing={12}>
      <Label text="Pause" />
      <Button label="Continue" onClick={button => void button.label} />
      {null}
      {false}
      {[<Label text="a" />, <Label text="b" />]}
    </Stack>
  </Panel>
);
export const element: RenderNode = menu;
export const common: JSX.Element = menu;
// @ts-expect-error a JSX expression is not typed as its concrete class
export const concrete: Panel = menu;

export const torch = (
  <Container>
    <Sprite texture={texture} anchor={0.5} tint={undefined as never} />
    <PointLight radius={300} intensity={1.2} x={4} />
  </Container>
);

// Typed refs receive the concrete instance.
export const withRef = <Button label="x" ref={button => void button.onClick} />;
// @ts-expect-error the ref receives a Button, not a Sprite
export const wrongRef = <Button ref={(sprite: Sprite) => void sprite.texture} />;

// Invalid properties are rejected.
// @ts-expect-error unknown prop
export const unknownProp = <Panel widht={400} />;
// @ts-expect-error wrong option type
export const wrongType = <Stack spacing="12" />;
// @ts-expect-error tint belongs to drawables, and a Panel is a container
export const containerTint = <Panel tint={undefined as never} />;
// @ts-expect-error React's key has no meaning without reconciliation
export const keyed = <Label key="a" text="a" />;
// @ts-expect-error Text needs its text
export const textless = <Text />;

// Invalid callback signatures are rejected.
// @ts-expect-error onClick passes the Button, not a number
export const badHandler = <Button onClick={(count: number) => void count} />;
// @ts-expect-error no such signal
export const noSignal = <Button onHover={onAny} />;

// Unsupported children are rejected.
const caption = <Label text="x" />;
// @ts-expect-error a Sprite is not a container
export const spriteChild = <Sprite texture={texture}>{caption}</Sprite>;
// @ts-expect-error text is not a scene node
export const textChild = <Container>Pause</Container>;
// @ts-expect-error numbers are not scene nodes
export const numberChild = <Container>{42}</Container>;

// Lowercase intrinsic elements do not exist.
// @ts-expect-error no intrinsic elements
export const intrinsic = <div />;

// Classes that need an adapter say so instead of guessing.
// @ts-expect-error Video takes an element first and has no adapter; construct it and pass the instance
export const video = <Video />;
class Hero extends Sprite {
  public constructor(public readonly hp: number) {
    super();
  }
}
// @ts-expect-error Hero no longer fits Sprite's adapter
export const hero = <Hero hp={3} />;
class Torch extends Sprite {}
export const inherited = <Torch texture={texture} />;
export const animated = <AnimatedSprite texture={texture} clips={{}} />;

// Custom classes extend the contract with options or an adapter.
class Meter extends Container {
  public constructor(public readonly options: { readonly max: number }) {
    super();
  }
}
export const meter = <Meter max={10} />;
// @ts-expect-error max is required
export const meterless = <Meter />;

class Badge extends Container {
  public constructor(public readonly rank: number) {
    super();
  }

  public static [jsxConstruct](props: JsxAdapterProps<{ readonly rank: number }>): Badge {
    return new this(props.rank);
  }
}
export const badge = <Badge rank={2} />;
// @ts-expect-error rank must be a number
export const badBadge = <Badge rank="2" />;

// Element functions take their first parameter as props.
interface MainMenuOptions {
  readonly title: string;
  readonly onStart: () => void;
  readonly children?: JsxChildren;
}
const MainMenu = (options: MainMenuOptions): JSX.Element => (
  <Panel>
    <Label text={options.title} />
    <Button label="Start" onClick={options.onStart} />
    {options.children}
  </Panel>
);
export const main = (
  <MainMenu title="Paused" onStart={onAny}>
    <Graphics />
  </MainMenu>
);
// @ts-expect-error title is required
export const untitled = <MainMenu onStart={onAny} />;
const Caption = (): string => 'caption';
// @ts-expect-error element functions must return a node
export const stringFunction = <Caption />;
