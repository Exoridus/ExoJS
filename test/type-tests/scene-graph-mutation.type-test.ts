import { Container } from '#rendering/Container';
import { RenderNode } from '#rendering/RenderNode';

declare const container: Container;
declare const node: RenderNode;
declare const otherContainer: Container;

// `Container.children` is `readonly RenderNode[]` — mutating array methods
// are not on the type, so calling them must be rejected at compile time
// (they also throw at runtime against the frozen snapshot; see
// Container.test.ts for the runtime guard).
// @ts-expect-error — children is readonly RenderNode[]; push() does not exist on it
container.children.push(node);
// @ts-expect-error — children is readonly RenderNode[]; splice() does not exist on it
container.children.splice(0, 1);

// `SceneNode.parent` (inherited by RenderNode/Container) has no public
// setter anymore — reparenting goes exclusively through Container's
// addChild/removeChild, which route through the internal _setParent().
// @ts-expect-error — parent has no public setter
node.parent = otherContainer;

export {};
