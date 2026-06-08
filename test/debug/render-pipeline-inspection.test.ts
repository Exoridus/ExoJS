import { RenderPassInspectorLayer } from '@/debug/RenderPassInspectorLayer';
import type { RenderingContext } from '@/rendering/RenderingContext';
import { RenderPass } from '@/rendering/RenderPass';
import { RenderPipeline } from '@/rendering/RenderPipeline';

class TestPass extends RenderPass {
  public override execute(_context: RenderingContext): void {
    // no-op — inspection tests never run the pass.
  }
}

describe('RenderPassInspectorLayer.describePipeline', () => {
  test('lists a flat pipeline with default and custom labels', () => {
    const world = new TestPass({ label: 'world' });
    const hud = new TestPass();
    const pipeline = new RenderPipeline().addPass(world).addPass(hud);

    expect(RenderPassInspectorLayer.describePipeline(pipeline)).toEqual([
      { depth: 0, label: 'world', enabled: true, isPipeline: false },
      { depth: 0, label: 'TestPass', enabled: true, isPipeline: false },
    ]);
  });

  test('recurses into nested pipelines and flags disabled passes', () => {
    const inner = new RenderPipeline({ label: 'world' }).addPass(new TestPass({ label: 'terrain' })).addPass(new TestPass({ label: 'units', enabled: false }));
    const outer = new RenderPipeline({ label: 'frame' }).addPass(inner).addPass(new TestPass({ label: 'hud' }));

    expect(RenderPassInspectorLayer.describePipeline(outer)).toEqual([
      { depth: 0, label: 'world', enabled: true, isPipeline: true },
      { depth: 1, label: 'terrain', enabled: true, isPipeline: false },
      { depth: 1, label: 'units', enabled: false, isPipeline: false },
      { depth: 0, label: 'hud', enabled: true, isPipeline: false },
    ]);
  });

  test('the walk always terminates because cycles cannot be built', () => {
    const a = new RenderPipeline();
    const b = new RenderPipeline();
    a.addPass(b);

    expect(() => b.addPass(a)).toThrow(/cycle/);
    expect(RenderPassInspectorLayer.describePipeline(a)).toEqual([{ depth: 0, label: 'RenderPipeline', enabled: true, isPipeline: true }]);
  });
});
