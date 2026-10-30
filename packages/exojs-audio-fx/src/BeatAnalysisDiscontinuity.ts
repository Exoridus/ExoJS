/**
 * Why the beat analysis lost continuity. Every reason discards the accumulated
 * evidence and starts a new analysis epoch; `eof` and `explicitPause` also stop
 * analysis until `resume`, `reset` or a source change, which clear that stop.
 */
export type BeatAnalysisDiscontinuity = 'sourceChange' | 'seek' | 'loop' | 'starvation' | 'explicitPause' | 'resume' | 'eof' | 'reset';
