import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { Filter } from '#rendering/filters/Filter';
import type { RenderNode } from '#rendering/RenderNode';
import { BlendModes } from '#rendering/types';

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
// mutator to SceneNode/RenderNode/Drawable/Container without a row here is a
// review error; a row whose bump assertion fails is an engine bug.
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

describe('revision invariants: every public visual mutator bumps the right revision', () => {
  for (const mutatorCase of cases) {
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
