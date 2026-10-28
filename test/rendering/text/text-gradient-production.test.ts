import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';

import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import * as canvasTextState from '#rendering/text/canvasTextState';
import { Text } from '#rendering/text/Text';
import type { TextStyle as Style } from '#rendering/text/TextStyle';

const loadProduction = <T>(file: string, dependencies: Record<string, unknown>): T => {
  const source = readFileSync(resolve(import.meta.dirname!, '../../../src', file), 'utf8');
  const code = ts.transpileModule(source.replaceAll('__DEV__', 'false'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports,
    require: (id: string) => {
      if (!(id in dependencies)) {
        throw new Error(`Unexpected dependency: ${id}`);
      }

      return dependencies[id];
    },
  });

  return exports as T;
};

test('production rejects a ninth gradient stop before a packed neighbor can change', () => {
  const dev = loadProduction<typeof import('#core/dev')>('core/dev.ts', {});
  expect(() => dev.assert(false)).not.toThrow();
  const styles = loadProduction<typeof import('#rendering/text/TextStyle')>('rendering/text/TextStyle.ts', {
    '#core/Color': { Color },
    '#core/Signal': { Signal },
    '#core/dev': dev,
    './canvasTextState': canvasTextState,
  });
  const packer = loadProduction<typeof import('#rendering/text/nodeDataPacker')>('rendering/text/nodeDataPacker.ts', {
    '#rendering/text/Text': { Text },
    './TextStyle': styles,
  });
  const style: Style = new styles.TextStyle();
  const target = new Float32Array(packer.textNodeDataFloats * 2).fill(777);
  const stops = Array.from({ length: 9 }, (_, i) => ({ offset: i / 8, color: Color.white }));
  const node = {
    style,
    pixelSnapMode: 0,
    rasterPixelRatio: 1,
    getGlobalTransform: () => ({ toArray: () => [1, 0, 0, 0, 1, 0, 0, 0, 1] }),
    getLocalBounds: () => ({ x: 0, y: 0, width: 10, height: 10 }),
  };
  expect(() => {
    style.gradient = { stops };
    packer.packTextNodeData(target, 0, node as unknown as Text);
  }).toThrow(/at most 8/);
  expect(Array.from(target.subarray(packer.textNodeDataFloats))).toEqual(Array(80).fill(777));

  style.gradient = { stops: stops.slice(0, 8) };
  packer.packTextNodeData(target, 0, node as unknown as Text);
  expect(target[19]).toBe(8);
  expect(Array.from(target.subarray(80))).toEqual(Array(80).fill(777));
  (style.gradient!.stops as Array<{ offset: number; color: Color }>).push(stops[8]!);
  packer.packTextNodeData(target, 0, node as unknown as Text);
  expect(target[19]).toBe(8);
  expect(Array.from(target.subarray(80))).toEqual(Array(80).fill(777));
});
