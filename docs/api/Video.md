# Video

`Video` is a dynamic texture-backed sprite around an `HTMLVideoElement`.

## Current model

- the video element provides the source frames
- the source updates the underlying texture over time
- rendering goes through the normal sprite path

## Notes

- WebGPU video support uses the built-in sprite path
- play/pause/loop behavior stays on the normal `Video` API
- no backend-specific video renderer is required for normal use

## Practical implication

Treat `Video` as a normal drawable whose texture content changes as playback advances.
