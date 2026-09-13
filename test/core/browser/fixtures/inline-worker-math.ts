/** Ordinary module imported by the worker fixture, never by the worker's caller. */
export const double = (value: number): number => value * 2;
