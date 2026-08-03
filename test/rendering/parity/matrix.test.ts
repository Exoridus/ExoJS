/**
 * Entry point for the table-driven conformance matrix.
 *
 * Adding a feature means adding a scene to a catalog; adding a correctness
 * check means adding a property, which then applies to every existing scene.
 * Neither requires touching this file.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { crossBackendParity } from './properties/crossBackendParity';
import { determinism } from './properties/determinism';
import { runParityMatrix } from './runner';
import { spriteScenes } from './scenes/sprite';
import { spriteCanvasScenes } from './scenes/spriteCanvas';
import type { Property, Scene } from './types';

const scenes: readonly Scene[] = [...spriteScenes, ...spriteCanvasScenes];
const properties: readonly Property[] = [crossBackendParity, determinism];

runParityMatrix(scenes, properties);
