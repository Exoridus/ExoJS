// An ordinary TypeScript module imported by both the worker and its caller.

/** Tag every reply carries, so the caller can recognise this worker's protocol. */
export const GENERATOR_TAG = 'exojs-build-generator';

export interface GeneratorReply {
  tag: typeof GENERATOR_TAG;
  value: number;
}

export const fibonacci = (n: number): number => {
  let previous = 0;
  let current = 1;

  for (let step = 0; step < n; step++) {
    [previous, current] = [current, previous + current];
  }

  return previous;
};
