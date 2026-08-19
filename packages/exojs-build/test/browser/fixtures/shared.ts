/** Shared helper, imported by the worker fixture and by the spec that checks it. */
export const fibonacci = (n: number): number => {
  let previous = 0;
  let current = 1;

  for (let step = 0; step < n; step++) {
    [previous, current] = [current, previous + current];
  }

  return previous;
};
