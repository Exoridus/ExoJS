// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import * as Tilemap from '@codexo/exojs/tilemap';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('uses full terrain cells for the ownership room floor', () => {
  const map = JSON.parse(readFileSync('examples/assets/maps/ownership-workshop-map.tmj', 'utf8'));
  const ground = map.layers.find((layer: { name: string }) => layer.name === 'Ground');
  expect([...new Set(ground.data)]).toEqual(expect.arrayContaining([19, 24]));
  expect(ground.data.every((gid: number) => gid === 19 || gid === 24)).toBe(true);
});

it('reports the real atlas claim count using the current catalog URL', () => {
  const source = readFileSync('examples/tilemap/level-loading-and-ownership.ts', 'utf8');
  const body = source.slice(0, source.indexOf('const app = new Application(')).replace(/^import[\s\S]*?from '[^']+';\s*/gm, '');
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const scene = runInNewContext(`${compiled}\nObject.create(LevelOwnershipScene.prototype)`, { ...Exo, ...Tilemap, assets });
  Object.defineProperty(scene, 'app', { value: { loader: { inspect: () => [{ aliases: [assets.mapPackTilesheet.source], claims: 2 }] } } });
  scene.ownership = { text: '' };
  scene.roomLabel = { text: '' };
  scene.runtime = { levels: [{}, {}] };
  scene.activeId = 'harbor';
  scene.pending = null;
  scene.panel = { actions: { 'Cancel pending': {}, 'Unload room': {} } };
  expect(scene.describeResidency()).toContain('shared atlas 2 claim(s)');
  expect(scene.ownership.text).toContain('Shared atlas: 2 claim(s)');
});
