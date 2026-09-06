import { runScaffolder } from './scaffold.js';

runScaffolder(process.argv.slice(2)).catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
