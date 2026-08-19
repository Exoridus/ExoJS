// Entry point of the external consumer. Re-exporting the two source strings is
// what keeps them in the bundle: a build that dropped them would tree-shake the
// whole point of the plugins away.
export { createMyEffectNode, MY_EFFECT_PROCESSOR, myEffectProcessorSource } from './my-effect/MyEffect';
export { glslProgram, wgslModule } from './shader-example/main';
export { generatorWorkerSource, runGenerator } from './worker-example/main';
