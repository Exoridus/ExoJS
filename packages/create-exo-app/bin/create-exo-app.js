#!/usr/bin/env node

await import(new URL('../dist/index.js', import.meta.url).href);
