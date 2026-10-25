// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import { SceneNode } from '#core/SceneNode';

const guide = readFileSync('site/src/content/guide/input/mouse-and-pointer.mdx', 'utf8');

describe('executable teaching contracts', () => {
  it.each([Math.PI / 2, -Math.PI / 2])('follows a screen-space gesture of %s radians in the same direction', angleDelta => {
    const callback = /application\.input\.onRotate\.add\(angleDelta => \{([\s\S]*?)\n\}\);/.exec(guide)?.[1];
    expect(callback).toBeDefined();
    const map = new SceneNode();
    runInNewContext(callback!, { angleDelta, map });
    const transform = map.getTransform();
    expect(transform.a).toBeCloseTo(0);
    expect(transform.c).toBeCloseTo(Math.sign(angleDelta));
    map.destroy();
  });

  it('reports completed frame cost after draw and flush, rather than a reset statistic', () => {
    const source = readFileSync('examples/scene-graph/retained-container.js', 'utf8');
    const sceneSource = source.slice(source.indexOf('class RetainedContainerScene'), source.indexOf('const app = new Application'));
    const stats = { frameTimeMs: 0, submittedNodes: 5760 };
    const phases: Array<{ postFrame(): void }> = [];
    const status = vi.fn();
    const panel = { status, dispose: vi.fn() };
    class Scene {
      app = { width: 1280, height: 720, backend: { stats } };
      systems = { add: (system: { postFrame(): void }) => phases.push(system) };
    }
    interface Probe {
      init(): void;
      draw(context: { stats: typeof stats; render(): void }): void;
      buildField(): { setPosition(): void };
    }
    const Target = runInNewContext(`(${sceneSource})`, {
      Scene,
      createAtlasTexture: () => ({}),
      demoPanel: () => panel,
      toggle: () => ({}),
      FIELD_COUNT: 5760,
    }) as new () => Probe;
    const scene = new Target();
    scene.buildField = () => ({ setPosition() {} });
    scene.init();
    scene.draw({ stats, render() {} });
    expect(status).not.toHaveBeenCalled();
    expect(phases).toHaveLength(1);
    stats.frameTimeMs = 20;
    phases[0]!.postFrame();
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('2.00 ms CPU frame'));
    stats.frameTimeMs = 80;
    phases[0]!.postFrame();
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('9.80 ms CPU frame'));
  });
});
