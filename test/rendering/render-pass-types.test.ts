import type { RenderNode } from '#rendering/RenderNode';
import { RenderNodePass } from '#rendering/RenderNodePass';
import type { RenderPass } from '#rendering/RenderPass';
import { RenderPipeline } from '#rendering/RenderPipeline';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

// Compile-time contracts. The body is type-checked by tsc; it is never executed.
const contracts = (pipeline: RenderPipeline, node: RenderNode, target: RenderTexture, pass: RenderPass): unknown[] => {
  // RenderPipeline is-a RenderPass.
  const asPass: RenderPass = pipeline;

  return [
    asPass,
    // addPass accepts any RenderPass — a RenderNodePass, a raw pass, a nested pipeline.
    pipeline.addPass(new RenderNodePass(node, { target })),
    pipeline.addPass(pass),
    pipeline.addPass(new RenderPipeline()),
    // @ts-expect-error — a RenderNode is not a RenderPass; wrap it in a RenderNodePass.
    pipeline.addPass(node),
    // @ts-expect-error — RenderNodePass requires a RenderNode, not a RenderPass.
    new RenderNodePass(pass),
    // @ts-expect-error — `target` must be a RenderTexture, not a number.
    new RenderNodePass(node, { target: 5 }),
  ];
};

describe('render pass type contracts', () => {
  test('compile-time only', () => {
    expect(typeof contracts).toBe('function');
  });
});
