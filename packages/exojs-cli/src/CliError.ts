/** Additional detail a {@link CliError} can carry. */
export interface CliErrorOptions {
  /** A concrete next step, printed under the message. */
  readonly hint?: string;
  /** Process exit code; defaults to 1. */
  readonly exitCode?: number;
  readonly cause?: unknown;
}

/**
 * A failure the caller can act on, reported as the command's own message rather
 * than as a stack trace.
 *
 * Anything else that escapes a command is a defect in the tool and is printed
 * with its stack, so the distinction is what separates "you typed something the
 * tool does not accept" from "the tool broke".
 */
export class CliError extends Error {
  public override readonly name = 'CliError';

  public readonly hint: string | undefined;

  public readonly exitCode: number;

  public constructor(message: string, options: CliErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });

    this.hint = options.hint;
    this.exitCode = options.exitCode ?? 1;
  }
}
