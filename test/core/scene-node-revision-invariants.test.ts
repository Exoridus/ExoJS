import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { Filter } from '#rendering/filters/Filter';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

// Minimal fake texture (no GPU): enough for the visual-source mutators below.
const makeTexture = (w = 64, h = 64): Texture => ({ width: w, height: h, flipY: false, updateSource: () => undefined }) as unknown as Texture;

// Mirror the existing NoopFilter in test/rendering/render-plan.test.ts exactly
// (check its constructor/apply signature there before finalizing this class).
class NoopFilter extends Filter {
  public override apply(): void {
    // no-op
  }
}

type DirtyKind = 'content' | 'structure';

interface MutatorCase {
  readonly name: string;
  readonly expects: DirtyKind;
  readonly create: () => RenderNode;
  readonly mutate: (node: RenderNode) => void;
}

const drawableCase = (name: string, expects: DirtyKind, mutate: (node: Drawable) => void, create: () => Drawable = () => new Drawable()): MutatorCase => ({
  name,
  expects,
  create,
  mutate: node => mutate(node as Drawable),
});

const containerCase = (name: string, expects: DirtyKind, mutate: (node: Container) => void, create: () => Container = () => new Container()): MutatorCase => ({
  name,
  expects,
  create,
  mutate: node => mutate(node as Container),
});

// Bare Drawable()/Container() instances have zero-size local bounds, so
// mutators whose effect is derived from local bounds (setAnchor, width,
// height) would be no-ops against the default fixture. Give those cases a
// node with non-empty local bounds so the mutation actually changes a value.
const withLocalBounds = <T extends Drawable | Container>(node: T): T => {
  node.getLocalBounds().set(0, 0, 16, 16);

  return node;
};

const containerWithSizedChild = (): Container => {
  const container = new Container();

  container.addChild(withLocalBounds(new Drawable()));

  return container;
};

// THE TABLE. One row per public member that changes visual output. Adding a
// mutator to SceneNode/RenderNode/Drawable/Container — OR to a Drawable
// SUBCLASS (Sprite/NineSliceSprite/Mesh/Text/…, see `subclassCases` below) —
// without a row here is a review error; a row whose bump assertion fails is an
// engine bug.
const cases: readonly MutatorCase[] = [
  // SceneNode transform family — content-dirty.
  drawableCase('setPosition', 'content', n => n.setPosition(10, 20)),
  // A same-value assignment (cloning the current, default (0,0) position) is
  // correctly a no-op under the equality-guarded vector setter, so the clone
  // is mutated to a different value first to exercise a real change.
  drawableCase('position setter', 'content', n => {
    const next = n.position.clone();

    next.set(next.x + 10, next.y + 20);
    n.position = next;
  }),
  drawableCase('x setter', 'content', n => (n.x = 5)),
  drawableCase('y setter', 'content', n => (n.y = 5)),
  drawableCase('setRotation', 'content', n => n.setRotation(45)),
  drawableCase('rotation setter', 'content', n => (n.rotation = 45)),
  drawableCase('setScale', 'content', n => n.setScale(2, 2)),
  drawableCase('setOrigin', 'content', n => n.setOrigin(4, 4)),
  // setAnchor derives origin from local bounds (origin = boundsSize *
  // anchor), so it is a no-op against the default zero-size Drawable bounds.
  drawableCase(
    'setAnchor',
    'content',
    n => n.setAnchor(0.5, 0.5),
    () => withLocalBounds(new Drawable()),
  ),
  drawableCase('setSkew', 'content', n => n.setSkew(10, 0)),
  drawableCase('skewX setter', 'content', n => (n.skewX = 10)),
  drawableCase('skewY setter', 'content', n => (n.skewY = 10)),
  drawableCase('move', 'content', n => n.move(1, 1)),
  drawableCase('rotate', 'content', n => n.rotate(5)),
  drawableCase('zIndex setter', 'content', n => (n.zIndex = 3)),
  // SceneNode cull family — structure-dirty (same class as `visible`: changes
  // WHICH draws a collect emits). These are two of the five audit gaps.
  drawableCase('cullable setter', 'structure', n => (n.cullable = false)),
  drawableCase('cullArea setter', 'structure', n => (n.cullArea = new Rectangle(0, 0, 8, 8))),
  // SceneNode visibility — structure-dirty (D6, already wired in Slice 1).
  drawableCase('visible setter', 'structure', n => (n.visible = false)),
  // RenderNode effect/plan-shape family. First three are audit gaps.
  drawableCase('preserveDrawOrder setter', 'structure', n => (n.preserveDrawOrder = true)),
  drawableCase('clip setter', 'structure', n => (n.clip = true)),
  drawableCase('clipShape setter', 'structure', n => (n.clipShape = new Rectangle(0, 0, 8, 8))),
  drawableCase('filters setter', 'content', n => (n.filters = [new NoopFilter()])),
  drawableCase('addFilter', 'content', n => n.addFilter(new NoopFilter())),
  drawableCase('mask setter', 'content', n => (n.mask = new Rectangle(0, 0, 8, 8))),
  drawableCase('cacheAsBitmap setter', 'content', n => (n.cacheAsBitmap = true)),
  drawableCase('invalidateCache', 'content', n => n.invalidateCache()),
  drawableCase('invalidateContent', 'content', n => n.invalidateContent()),
  // Drawable visual-source family — content-dirty.
  drawableCase('setTint', 'content', n => n.setTint(new Color(10, 20, 30))),
  drawableCase('setBlendMode', 'content', n => n.setBlendMode(BlendModes.Add)),
  drawableCase('pixelSnapMode setter', 'content', n => (n.pixelSnapMode = 'geometry')),
  // Container structural mutators — structure-dirty (wired in Slice 1).
  containerCase('addChild', 'structure', n => n.addChild(new Drawable())),
  // addChild is itself a structure-dirty mutator (tested above), so the
  // sized child needed to make the width/height division non-trivial must be
  // added during `create` — before the "before" revisions are captured —
  // not inside `mutate`, or the structure-dirty assertion below would be
  // polluted by the addChild call rather than reflecting the width/height
  // setter alone.
  containerCase('width setter', 'content', n => (n.width = 128), containerWithSizedChild),
  containerCase('height setter', 'content', n => (n.height = 128), containerWithSizedChild),
];

// SUBCLASS mutator table (C1, expert review 2026-07-11). The base table above
// only guards SceneNode/RenderNode/Drawable/Container; a Drawable subclass that
// mutates a transform-relevant / visual-source field (texture, frame, geometry,
// nine-slice metrics) routes through `invalidateCache`/`_markContentDirty` just
// like a base mutator and must obey the SAME revision contract. Every row here
// is content-dirty: these change WHAT is drawn, not WHICH draws are emitted.
// RetainedContainer's deliberately-divergent transform mutator is asserted
// separately below (it is the one subclass that reroutes away from content).
const subclassCases: readonly MutatorCase[] = [
  // Sprite visual-source family.
  drawableCase(
    'Sprite.setTexture',
    'content',
    n => (n as unknown as Sprite).setTexture(makeTexture(32, 16)),
    () => new Sprite(null),
  ),
  drawableCase(
    'Sprite.texture setter',
    'content',
    n => ((n as unknown as Sprite).texture = makeTexture(32, 16)),
    () => new Sprite(null),
  ),
  drawableCase(
    'Sprite.setTextureFrame',
    'content',
    n => (n as unknown as Sprite).setTextureFrame(new Rectangle(0, 0, 10, 10)),
    () => new Sprite(makeTexture(64, 32)),
  ),
  // Mesh visual-source: swapping the texture.
  drawableCase(
    'Mesh.texture setter',
    'content',
    n => ((n as unknown as Mesh).texture = makeTexture(16, 16)),
    () => new Mesh({ vertices: new Float32Array([0, 0, 16, 0, 8, 16]) }),
  ),
  // NineSliceSprite metric mutators — all re-tessellate the quad geometry.
  drawableCase(
    'NineSliceSprite.setSize',
    'content',
    n => (n as unknown as NineSliceSprite).setSize(50, 40),
    () => new NineSliceSprite(makeTexture(64, 64), { slices: 10 }),
  ),
  drawableCase(
    'NineSliceSprite.setBorder',
    'content',
    n => (n as unknown as NineSliceSprite).setBorder(12),
    () => new NineSliceSprite(makeTexture(64, 64), { slices: 10 }),
  ),
  drawableCase(
    'NineSliceSprite.setSlices',
    'content',
    n => (n as unknown as NineSliceSprite).setSlices(8),
    () => new NineSliceSprite(makeTexture(64, 64), { slices: 10 }),
  ),
];

describe('revision invariants: every public visual mutator bumps the right revision', () => {
  for (const mutatorCase of [...cases, ...subclassCases]) {
    test(`${mutatorCase.name} is ${mutatorCase.expects}-dirty and propagates to the parent`, () => {
      const parent = new Container();
      const node = mutatorCase.create();

      parent.addChild(node);

      const nodeContentBefore = node._contentRevision;
      const nodeStructureBefore = node._structureRevision;
      const parentContentBefore = parent._contentRevision;
      const parentStructureBefore = parent._structureRevision;

      mutatorCase.mutate(node);

      // Structure implies content (NodeRevision.touchStructure), so content
      // must advance for BOTH kinds.
      expect(node._contentRevision).toBeGreaterThan(nodeContentBefore);
      expect(parent._contentRevision).toBeGreaterThan(parentContentBefore);

      if (mutatorCase.expects === 'structure') {
        expect(node._structureRevision).toBeGreaterThan(nodeStructureBefore);
        expect(parent._structureRevision).toBeGreaterThan(parentStructureBefore);
      } else {
        expect(node._structureRevision).toBe(nodeStructureBefore);
        expect(parent._structureRevision).toBe(parentStructureBefore);
      }

      parent.destroy();
    });

    test(`${mutatorCase.name} does not touch an unrelated sibling subtree`, () => {
      const root = new Container();
      const parent = new Container();
      const sibling = new Container();
      const node = mutatorCase.create();

      root.addChild(parent);
      root.addChild(sibling);
      parent.addChild(node);

      const siblingContentBefore = sibling._contentRevision;

      mutatorCase.mutate(node);

      expect(sibling._contentRevision).toBe(siblingContentBefore);

      root.destroy();
    });
  }

  test('same-value writes to the five gap members are no-ops (no spurious bump)', () => {
    const node = new Drawable();

    node.cullable = false;
    node.clip = true;
    node.preserveDrawOrder = true;

    const before = node._structureRevision;

    node.cullable = false;
    node.clip = true;
    node.preserveDrawOrder = true;

    // Read-then-write (rather than the literal `node.cullArea = node.cullArea`)
    // to dodge eslint's no-self-assign rule while keeping the same runtime
    // effect: writing the current value back must stay a no-op.
    const cullArea = node.cullArea;
    const clipShape = node.clipShape;

    node.cullArea = cullArea;
    node.clipShape = clipShape;

    expect(node._structureRevision).toBe(before);

    node.destroy();
  });
});

// C1: RetainedContainer is the one Drawable subclass whose transform-relevant
// mutator deliberately DIVERGES from the base contract — an own-transform move
// reroutes to the group-matrix version instead of content-dirtying the
// retained fragment (spec §4.3). The base table cannot express this (it asserts
// content propagation on every transform mutator), so the divergence is pinned
// here explicitly. This is the reason the base-table rule must carry the "OR a
// subclass" clause: a subclass author extending RetainedContainer, or adding a
// new boundary subclass, must consciously choose one contract or the other.
describe('revision invariants: RetainedContainer reroutes its OWN transform mutators (subclass exception)', () => {
  test('own-transform mutators bump the group-matrix version, NOT content or structure', () => {
    const group = new RetainedContainer();

    group.addChild(new Drawable());

    const contentBefore = group._contentRevision;
    const structureBefore = group._structureRevision;
    const versionBefore = group._groupMatrixVersion;

    group.setPosition(10, 20);
    group.setRotation(45);
    group.setScale(2);
    group.setSkew(5, 0);
    group.setOrigin(1, 1);

    expect(group._groupMatrixVersion).toBeGreaterThan(versionBefore);
    expect(group._contentRevision).toBe(contentBefore);
    expect(group._structureRevision).toBe(structureBefore);

    group.destroy();
  });

  test("a mutation INSIDE the subtree still content-dirties the group (decoupling is scoped to the group's own transform)", () => {
    const group = new RetainedContainer();
    const leaf = new Drawable();

    group.addChild(leaf);

    const before = group._contentRevision;

    leaf.setPosition(3, 3);

    expect(group._contentRevision).toBeGreaterThan(before);

    group.destroy();
  });

  test('a moving RetainedContainer does not content-dirty its ancestors', () => {
    const root = new Container();
    const group = new RetainedContainer();

    root.addChild(group);
    group.addChild(new Drawable());

    const rootContentBefore = root._contentRevision;

    group.setPosition(500, 500);

    expect(root._contentRevision).toBe(rootContentBefore);

    root.destroy();
  });
});
