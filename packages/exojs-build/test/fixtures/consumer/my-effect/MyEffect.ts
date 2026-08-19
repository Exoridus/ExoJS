// Main-thread half of the effect. The import query yields the processor source
// as a string; turning it into a module URL is the consumer's business, not the
// build plugin's.
import { MY_EFFECT_PROCESSOR } from './dsp';
import processorSource from './my-effect.worklet.ts?worklet';

export { MY_EFFECT_PROCESSOR };

/** The bundled processor source, as a plain string. */
export const myEffectProcessorSource: string = processorSource;

/** Registers the processor on `context` and returns a node running it. */
export const createMyEffectNode = async (context: BaseAudioContext): Promise<AudioWorkletNode> => {
  const url = URL.createObjectURL(new Blob([processorSource], { type: 'text/javascript' }));

  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  return new AudioWorkletNode(context, MY_EFFECT_PROCESSOR);
};
