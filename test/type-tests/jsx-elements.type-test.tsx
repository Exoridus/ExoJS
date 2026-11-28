/** @jsxImportSource @codexo/exojs */
import {
  AnimatedSprite,
  type BitmapText,
  Button,
  type Checkbox,
  Container,
  type DockContainer,
  type Dropdown,
  Graphics,
  type HTMLText,
  Label,
  type Mesh,
  type NineSliceSprite,
  Panel,
  type ProgressBar,
  type RenderNode,
  type RepeatingSprite,
  type ScrollContainer,
  type Slider,
  Sprite,
  Stack,
  Text,
  type TextArea,
  type TextInput,
  type Texture,
  type Toggle,
  Video,
} from '@codexo/exojs';
import type {
  JSX,
  JsxAdapterProps,
  JsxChildren,
  JsxConstructionProps,
  JsxDrawableProps,
  JsxNodeClass,
  JsxNodeProps,
} from '@codexo/exojs/jsx';
import { jsxConstruct } from '@codexo/exojs/jsx';
import { type LineLight, PointLight, type SpotLight, type SunLight } from '@codexo/exojs/lighting';

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

// No construction prop of a core class shares a name with a node property or a
// name the compiler and runtime consume: the runtime assigns node properties
// through setters and keeps children, ref and key, so a shared name would never
// reach the constructor.
type Shared<C extends JsxNodeClass> = keyof JsxConstructionProps<C> &
  (keyof JsxNodeProps | keyof JsxDrawableProps | 'children' | 'ref' | 'key');
type NoneShared<Names extends never> = Names;
export type CoreClassesShareNoNames = [
  NoneShared<Shared<typeof Sprite>>,
  NoneShared<Shared<typeof AnimatedSprite>>,
  NoneShared<Shared<typeof NineSliceSprite>>,
  NoneShared<Shared<typeof RepeatingSprite>>,
  NoneShared<Shared<typeof Text>>,
  NoneShared<Shared<typeof BitmapText>>,
  NoneShared<Shared<typeof HTMLText>>,
  NoneShared<Shared<typeof Graphics>>,
  NoneShared<Shared<typeof Mesh>>,
  NoneShared<Shared<typeof Label>>,
  NoneShared<Shared<typeof Button>>,
  NoneShared<Shared<typeof Panel>>,
  NoneShared<Shared<typeof Stack>>,
  NoneShared<Shared<typeof Slider>>,
  NoneShared<Shared<typeof Toggle>>,
  NoneShared<Shared<typeof Checkbox>>,
  NoneShared<Shared<typeof ProgressBar>>,
  NoneShared<Shared<typeof TextInput>>,
  NoneShared<Shared<typeof TextArea>>,
  NoneShared<Shared<typeof ScrollContainer>>,
  NoneShared<Shared<typeof DockContainer>>,
  NoneShared<Shared<typeof Dropdown>>,
  NoneShared<Shared<typeof PointLight>>,
  NoneShared<Shared<typeof SpotLight>>,
  NoneShared<Shared<typeof LineLight>>,
  NoneShared<Shared<typeof SunLight>>,
];
class Positioned extends Container {
  public constructor(public readonly options: { readonly x?: number } = {}) {
    super();
  }
}
// @ts-expect-error the guard reports an option named like a node property
export type GuardReports = NoneShared<Shared<typeof Positioned>>;
// @ts-expect-error a user class whose option shares a node property's name is rejected at the element
export const positioned = <Positioned x={1} />;
class Reporting extends Container {
  public constructor(public readonly options: { readonly onReady?: () => void } = {}) {
    super();
  }
}
// @ts-expect-error on* names are signal handlers, so a callback option of that name never reaches the constructor
export const reporting = <Reporting onReady={onAny} />;
class Referencing extends Container {
  public constructor(public readonly options: { readonly ref?: string; readonly key?: string } = {}) {
    super();
  }
}
// @ts-expect-error ref and key are consumed by JSX and the compiler, so options of those names never reach the constructor
export const referencing = <Referencing />;
class Listing extends Container {
  public constructor(public readonly options: { readonly children?: readonly string[] } = {}) {
    super();
  }
}
// @ts-expect-error children is the JSX children prop, so an option of that name never reaches the constructor
export const listing = <Listing />;

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

// Option shapes whose keys `keyof` alone would not show cannot hide a reserved name.
class IndexOptions extends Container {
  public constructor(_options: Record<string, number> = {}) {
    super();
  }
}

type KindOptions = { readonly kind: 'a'; readonly x: number } | { readonly kind: 'b'; readonly depth: number };

class UnionOptions extends Container {
  public constructor(_options: KindOptions) {
    super();
  }
}

type SafeKindOptions = { readonly kind: 'a'; readonly width: number } | { readonly kind: 'b'; readonly depth: number };

class SafeUnionOptions extends Container {
  public constructor(_options: SafeKindOptions) {
    super();
  }
}

// @ts-expect-error an index signature collides with every node property
export const indexOptions = <IndexOptions foo={1} />;
// @ts-expect-error one member of the union uses the node property x
export const unionOptions = <UnionOptions kind="a" x={1} />;
export const safeUnionOptions = <SafeUnionOptions kind="b" depth={2} />;
