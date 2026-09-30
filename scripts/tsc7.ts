/**
 * CLI entry point for the TypeScript 7 native compiler, so npm scripts can
 * invoke it without relying on which package owns the `tsc` binary. The
 * repository installs a second compiler (TypeScript 6, for the JavaScript
 * Compiler API), and the two packages both ship `tsc`; whichever one the
 * installer links into `node_modules/.bin` is an installation detail, not a
 * decision any script should inherit.
 *
 * Arguments are forwarded verbatim:
 *
 *     tsx scripts/tsc7.ts --noEmit -p tsconfig.json
 */
import { nativeTscVersion, runNativeTsc } from './lib/typescript-cli.ts';

const args = process.argv.slice(2);
if (args.includes('--exojs-tsc7-version')) {
  process.stdout.write(`${nativeTscVersion()}\n`);
} else {
  process.exit(runNativeTsc(args).status);
}
