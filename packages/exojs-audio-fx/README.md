# @codexo/exojs-audio-fx

Audio effects, spectrum analysis, worklet-backed processing, and beat detection for ExoJS. Core already provides audio assets, voices, buses, and basic routing. Add this package when a project needs analysis or the additional effect processors.

## Install

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-audio-fx
```

Core is a peer dependency. Construct the required objects directly; there is no application extension descriptor to install for ordinary audio analysis.

## Inspect a live music bus

This helper expects an initialized application with audio already playing on its music bus. It does not load or start a track:

```ts
import type { Application } from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs-audio-fx';

export const inspectMusic = (app: Application): { read: () => Uint8Array; destroy: () => void } => {
  const analyser = new AudioAnalyser({ source: app.audio.music, fftSize: 1024 });

  return {
    read: () => analyser.getSpectrumLog(undefined, { bands: 16 }),
    destroy: () => analyser.destroy(),
  };
};
```

Call `read` from the owner's update path and destroy the helper when that owner ends. An analyser taps a live bus or voice, not an unloaded asset descriptor. A silent or muted routing path is not repaired by repeatedly creating analysers.

## Important boundaries

Browser audio needs a real user-gesture path. Worklet-backed processors can have asynchronous initialization and capability requirements; handle failure and teardown rather than assuming construction means readiness.

Effects, analyser nodes, detectors, and playing voices have distinct lifetimes. Track caller-created resources with their scene or dispose them at their own boundary. Do not leave a detector connected merely because its visual widget was removed.

Beat detection estimates tempo and phase. Polling windows such as `justBeat` are not one-shot events, and asynchronous messages are not hard real-time delivery. A rhythm-game scoring timeline needs an explicit authoritative timing design. Analysis values are not a calibrated acoustic loudness measurement.

## Documentation

[Audio basics](https://exoridus.github.io/ExoJS/en/guide/audio/audio-basics/) · [Effects and routing](https://exoridus.github.io/ExoJS/en/guide/audio/audio-effects/) · [Beat detection](https://exoridus.github.io/ExoJS/en/guide/audio/beat-detection/) · [Audio-reactive visuals](https://exoridus.github.io/ExoJS/en/guide/audio/audio-reactive-visualization/) · [AudioAnalyser API](https://exoridus.github.io/ExoJS/en/api/audio-analyser/)

## License

MIT
