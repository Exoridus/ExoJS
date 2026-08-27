/**
 * Raised when serialized binding data cannot be read: a profile whose shape or
 * version this build does not understand, a binding whose kind does not match
 * the action it is applied to, or a token no control carries.
 *
 * Rebindings are persisted by the game and come back as untrusted input, so
 * this is the one input failure a caller acts on at runtime rather than fixes
 * in source: catch it, discard the saved profile, fall back to the declared
 * defaults. Programmer errors - an action claimed by two maps, a reserved
 * action name, a malformed pattern string written in code - stay a plain
 * `Error` so a `catch` around a profile load does not swallow them.
 */
export class InputBindingError extends Error {
  public constructor(message: string) {
    super(message);

    this.name = 'InputBindingError';
  }
}
