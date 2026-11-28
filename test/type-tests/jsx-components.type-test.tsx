/** @jsxImportSource @codexo/exojs */
// The JSX components prop applies SceneNode.addComponent's host check to every
// element of the list, with or without strictFunctionTypes.

import { BehaviorComponent, Component, type ComponentFor, Container, Panel, type Seconds, Sprite, type Texture } from '@codexo/exojs';

declare const texture: Texture;

class Health extends Component {
  public current = 100;
}

class Tint extends Component<Sprite> {
  public apply(): void {
    this.node.tint.set(255, 0, 0);
  }
}

class Spin extends BehaviorComponent<Sprite> {
  public override update(delta: Seconds): void {
    this.node.rotate(delta);
  }
}

class Torch extends Sprite {
  public lit = true;
}

class Flicker extends Component<Torch> {
  public flick(): void {
    this.node.lit = !this.node.lit;
  }
}

class Padding extends Component<Panel> {
  public apply(): void {
    this.node.width += 8;
  }
}

// --- accepted -----------------------------------------------------------------

export const sprite = <Sprite texture={texture} components={[new Tint(), new Health(), new Spin()]} />;
export const container = <Container components={[new Health()]} />;
export const empty = <Container components={[]} />;
export const torch = <Torch texture={texture} components={[new Tint(), new Flicker()]} />;
export const panel = <Panel components={[new Padding(), new Health()]} />;

const prepared: Array<ComponentFor<Sprite>> = [new Tint(), new Health()];
export const preparedList = <Sprite texture={texture} components={prepared} />;

// --- rejected -----------------------------------------------------------------

// @ts-expect-error a Component<Sprite> cannot be attached to a plain container
export const tintOnContainer = <Container components={[new Tint()]} />;
// @ts-expect-error one rejected element rejects the list
export const mixedOnContainer = <Container components={[new Health(), new Tint()]} />;
// @ts-expect-error a BehaviorComponent<Sprite> needs a sprite as well
export const spinOnContainer = <Container components={[new Spin()]} />;
// @ts-expect-error a Component<Torch> cannot be attached to any sprite
export const flickerOnSprite = <Sprite texture={texture} components={[new Flicker()]} />;
// @ts-expect-error only components can be listed
export const notComponent = <Sprite texture={texture} components={[{ attached: true }]} />;
// @ts-expect-error a single component is not a list
export const single = <Sprite texture={texture} components={new Tint()} />;
// @ts-expect-error a list typed for sprites cannot go on a container
export const preparedOnContainer = <Container components={prepared} />;
// @ts-expect-error a Component<Panel> cannot be attached to its base class Container
export const paddingOnContainer = <Container components={[new Padding()]} />;

const torchList: Array<ComponentFor<Torch>> = [new Flicker(), new Tint()];
// @ts-expect-error a list typed for torches cannot go on any sprite
export const torchListOnSprite = <Sprite texture={texture} components={torchList} />;

// @ts-expect-error ComponentFor applies the same rule outside JSX
export const forContainer: ComponentFor<Container> = new Tint();
export const forTorch: ComponentFor<Torch> = new Tint();
// @ts-expect-error a Component<Torch> is not a component for every sprite
export const forSprite: ComponentFor<Sprite> = new Flicker();

// A ComponentFor value carries no declared host type, so addComponent rejects it.
declare const container1: Container;
declare const sprite1: Sprite;
declare const forSpriteValue: ComponentFor<Sprite>;
// @ts-expect-error addComponent needs the component's own type
container1.addComponent(forSpriteValue);
// @ts-expect-error even on a node the list was typed for
sprite1.addComponent(forSpriteValue);
export const memberAccess: boolean = forSpriteValue.enabled;
export const widerList: ReadonlyArray<ComponentFor<Torch>> = prepared;

// components is reserved, so an option of that name never reaches the constructor.
class Composed extends Container {
  public constructor(public readonly options: { readonly components?: readonly string[] } = {}) {
    super();
  }
}
// @ts-expect-error the guard reports an option named components
export const composed = <Composed />;

// The carrier leaves Component covariant in its host type.
export const widened: Component = new Tint();
export const widenedList: readonly Component[] = [new Tint(), new Flicker()];
// @ts-expect-error a Component<Sprite> is not a Component<Torch>
export const narrowed: Component<Torch> = new Tint();
