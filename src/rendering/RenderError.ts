import type { RenderBackendType } from './RenderBackendType';

/**
 * Machine-readable classification of a GPU/render failure. Carried by
 * {@link RenderError.code} so tooling can branch on the failure class without
 * parsing a driver log.
 */
export type RenderErrorCode =
  | 'shader-compile' // GLSL compile failure (WebGL2) or WGSL compilation error (WebGPU)
  | 'shader-link' // WebGL2 program link failure
  | 'pipeline-creation' // WebGPU pipeline/bind-group-layout creation failure
  | 'validation' // WebGPU uncaptured validation error (draw/submit time)
  | 'out-of-memory' // GPUOutOfMemoryError / GL OOM
  | 'internal'; // GPUInternalError / anything unclassifiable

/** Construction options for a {@link RenderError}. */
export interface RenderErrorOptions {
  /** Machine-readable failure class. */
  readonly code: RenderErrorCode;
  /** Backend that produced the failure. */
  readonly backendType: RenderBackendType;
  /** One-line, actionable summary (becomes the {@link Error.message}). */
  readonly message: string;
  /** Raw driver log and/or a numbered source excerpt. */
  readonly detail?: string;
  /** Shader/material/pipeline label when known. */
  readonly resource?: string;
  /** Original error object, if any (passed through as {@link Error.cause}). */
  readonly cause?: unknown;
}

/**
 * Structured GPU/render failure. Thrown by synchronous failure paths (WebGL2
 * shader compile/link, from `flush()`) and dispatched by
 * {@link RenderBackend.onRenderError} for asynchronous ones (WebGPU
 * compilation info, uncaptured validation/OOM/internal errors).
 *
 * Extends {@link Error}, so `app.onError` subscribers can narrow with
 * `error instanceof RenderError` and read the structured {@link RenderError.code},
 * {@link RenderError.backendType}, {@link RenderError.resource} and
 * {@link RenderError.detail} fields instead of parsing the raw driver log.
 */
export class RenderError extends Error {
  /** Machine-readable failure class. */
  public readonly code: RenderErrorCode;
  /** Backend that produced the failure. */
  public readonly backendType: RenderBackendType;
  /** Raw driver log and/or numbered source excerpt, or `null` when unavailable. */
  public readonly detail: string | null;
  /** Shader/material/pipeline label, or `null` when unknown. */
  public readonly resource: string | null;

  public constructor(options: RenderErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);

    this.name = 'RenderError';
    this.code = options.code;
    this.backendType = options.backendType;
    this.detail = options.detail ?? null;
    this.resource = options.resource ?? null;
  }
}

/** Number of source lines shown on either side of a failing line in an excerpt. */
const excerptRadius = 2;

/**
 * Extract 1-based source line numbers referenced by a shader driver log.
 * Handles ANGLE/Mesa GLSL (`ERROR: 0:<line>:` / `WARNING: 0:<line>:`) first and,
 * when none match, WGSL-style `:<line>:<col>` positions.
 */
function parseErrorLineNumbers(log: string): number[] {
  const numbers = new Set<number>();

  // GLSL info logs: `ERROR: 0:12: 'foo' : syntax error`. The first integer is
  // the (near-always-0) source-string index; the second is the line number.
  const glslPattern = /(?:ERROR|WARNING):\s*\d+:(\d+)/gi;
  let match: RegExpExecArray | null = glslPattern.exec(log);

  while (match !== null) {
    numbers.add(Number.parseInt(match[1]!, 10));
    match = glslPattern.exec(log);
  }

  if (numbers.size === 0) {
    // WGSL positions: `:12:5` (line:column). Used by the WebGPU compilation-info
    // path, which synthesizes `:${lineNum}:${linePos} ${message}` lines.
    const wgslPattern = /:(\d+):\d+/g;

    match = wgslPattern.exec(log);

    while (match !== null) {
      numbers.add(Number.parseInt(match[1]!, 10));
      match = wgslPattern.exec(log);
    }
  }

  return [...numbers].filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
}

/** Build a numbered `±excerptRadius` source excerpt around a 1-based failing line. */
function buildExcerpt(sourceLines: readonly string[], lineNumber: number): string | null {
  const index = lineNumber - 1;

  if (index < 0 || index >= sourceLines.length) {
    return null;
  }

  const start = Math.max(0, index - excerptRadius);
  const end = Math.min(sourceLines.length - 1, index + excerptRadius);
  const gutterWidth = String(end + 1).length;
  const rows: string[] = [];

  for (let i = start; i <= end; i++) {
    const marker = i === index ? '>' : ' ';
    const numbered = String(i + 1).padStart(gutterWidth, ' ');

    // In-bounds: start/end are clamped to the sourceLines range above.
    rows.push(`${marker} ${numbered} | ${sourceLines[i]!}`);
  }

  return rows.join('\n');
}

/**
 * Format a driver info log against its shader source: parses `ERROR: 0:<line>:`
 * (ANGLE/Mesa GLSL) and WGSL `:<line>:<col>` positions, and returns the raw log
 * plus a numbered source excerpt (`±2` lines, `>` marker on each failing line).
 * Falls back to the raw log verbatim when no line references parse (or none of
 * them land inside `source`).
 */
export function formatShaderError(source: string, infoLog: string): string {
  const log = infoLog.trim();
  const lineNumbers = parseErrorLineNumbers(log);

  if (lineNumbers.length === 0) {
    return log;
  }

  const sourceLines = source.split('\n');
  const excerpts: string[] = [];

  for (const lineNumber of lineNumbers) {
    const excerpt = buildExcerpt(sourceLines, lineNumber);

    if (excerpt !== null) {
      excerpts.push(excerpt);
    }
  }

  if (excerpts.length === 0) {
    return log;
  }

  return `${log}\n\n${excerpts.join('\n\n')}`;
}
