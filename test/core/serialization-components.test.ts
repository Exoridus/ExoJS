import { Component } from '#core/Component';
import { Scene } from '#core/scene/Scene';
import { Prefab } from '#core/serialization/Prefab';
import { serializeTree } from '#core/serialization/serialize';
import { Container } from '#rendering/Container';

class Health extends Component {}

class Armor extends Component {}

const tree = (): { root: Container; hero: Container } => {
  const root = new Container();
  const hero = new Container();

  hero.name = 'hero';
  hero.x = 12;
  root.addChild(hero);

  return { root, hero };
};

describe('serialization boundary for components (CMP-07)', () => {
  test('a tree without components round-trips unchanged', () => {
    const { root } = tree();
    const copy = Prefab.from(root).instantiate() as Container;

    expect(copy.children).toHaveLength(1);
    expect(copy.children[0]!.name).toBe('hero');
    expect(copy.children[0]!.x).toBe(12);
  });

  test('serializing a tree with components throws, naming the node and the component class', () => {
    const { root, hero } = tree();

    hero.addComponent(new Health());
    hero.addComponent(new Armor());

    expect(() => serializeTree(root)).toThrow(/Container "hero" carries a Health component \(and 1 more component in the tree\)/);
    expect(() => Prefab.from(root)).toThrow(/omitComponents/);
  });

  test('a component on the serialized node itself is found as well', () => {
    const root = new Container();

    root.addComponent(new Health());

    expect(() => serializeTree(root)).toThrow(/Cannot serialize Container: Container carries a Health component/);
  });

  test('Scene.serialize refuses components under the root and under the UI layer', () => {
    const rootScene = new Scene();

    rootScene.addChild(tree().root);
    (rootScene.root.children[0] as Container).addComponent(new Health());
    expect(() => rootScene.serialize()).toThrow(/Health/);

    const uiScene = new Scene();
    const widget = new Container();

    widget.addComponent(new Armor());
    uiScene.ui.addChild(widget);
    expect(() => uiScene.serialize()).toThrow(/Armor/);
  });

  test('omitComponents writes the visual data alone; restoring yields nodes without components', () => {
    const { root, hero } = tree();

    hero.addComponent(new Health());

    const copy = Prefab.from(root, null, undefined, { omitComponents: true }).instantiate() as Container;
    const restoredHero = copy.children[0]!;

    expect(restoredHero.x).toBe(12);
    expect(restoredHero.components).toEqual([]);

    const scene = new Scene();

    scene.addChild(root);
    expect(scene.serialize({ omitComponents: true }).root.children).toHaveLength(1);
  });

  test('removing the components makes the tree serializable again', () => {
    const { root, hero } = tree();

    hero.addComponent(new Health());
    hero.removeComponent(Health);

    expect(() => serializeTree(root)).not.toThrow();
  });
});
