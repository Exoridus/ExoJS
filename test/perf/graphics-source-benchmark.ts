import assert from 'node:assert/strict';

import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Graphics } from '#rendering/primitives/Graphics';

const results: object[] = [];

for (const count of [100, 1000]) {
  for (const mode of ['static', 'fill', 'geometry-10', 'geometry-100', 'shared', 'rebuild'] as const) {
    const sources = Array.from({ length: count }, (_, i) => new Rectangle(i * 12, 0, 10, 10));
    const graphics = new Graphics({ fill: Color.red });
    const second = new Graphics({ fill: Color.blue });
    const handles = sources.map(source => graphics.addShape(source));

    if (mode === 'shared') {
      sources.forEach(source => second.addShape(source));
    }

    const meshes = Array.from({ length: count }, (_, i) => graphics.getChildAt(i));
    const arrays = meshes.map(mesh => mesh.vertices);
    let geometryUpdates = 0;

    const secondMeshes = Array.from({ length: second.children.length }, (_, i) => second.getChildAt(i));

    for (const mesh of [...meshes, ...secondMeshes]) {
      const original = mesh.recomputeLocalBounds.bind(mesh);

      mesh.recomputeLocalBounds = () => {
        geometryUpdates++;

        return original();
      };
    }

    const samples: number[] = [];

    const update = (frame: number): void => {
      if (mode === 'fill') {
        handles.forEach(handle => handle.setStyle({ fill: frame % 2 ? Color.red : Color.blue }));
      } else if (mode === 'geometry-10' || mode === 'geometry-100' || mode === 'shared') {
        const changed = mode === 'geometry-10' ? count / 10 : count;

        for (let i = 0; i < changed; i++) {
          sources[i]!.width = 10 + (frame % 2);
        }
      } else if (mode === 'rebuild') {
        graphics.clear();
        graphics.fillColor = frame % 2 ? Color.red : Color.blue;
        sources.forEach(source => graphics.drawRectangle(source.x, source.y, source.width, source.height));
      }
    };

    for (let frame = 0; frame < 300; frame++) {
      const start = performance.now();
      update(frame);

      if (frame >= 100) {
        samples.push(performance.now() - start);
      }
    }

    if (mode !== 'rebuild') {
      meshes.forEach((mesh, i) => {
        assert.equal(graphics.getChildAt(i), mesh);
        assert.equal(mesh.vertices, arrays[i]);
      });
    }

    if (mode === 'static' || mode === 'fill') {
      assert.equal(geometryUpdates, 0);
    }

    samples.sort((a, b) => a - b);
    results.push({
      count,
      mode,
      samples: samples.length,
      minMs: samples[0],
      medianMs: samples[100],
      p95Ms: samples[190],
      maxMs: samples.at(-1),
      geometryUpdates,
    });
    graphics.destroy();
    second.destroy();
    sources.forEach(source => source.destroy());
  }
}

console.log(
  JSON.stringify(
    {
      runtime: process.version,
      platform: process.platform,
      measurement: 'CPU update only; 100 warmup + 200 measured frames; no render, GPU or heap measurement',
      results,
    },
    null,
    2,
  ),
);
