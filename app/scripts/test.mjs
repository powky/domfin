// Runs the unit tests, the `*.test.ts` next to the code they check, with
// Node's own test runner: `npm test`. They test what has no screen, so they
// don't load React Native.
import { globSync } from 'node:fs';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';

import './typescript.mjs';

const files = globSync('src/**/*.test.ts', { cwd: new URL('..', import.meta.url) }).map(
  (file) => new URL(`../${file}`, import.meta.url).pathname,
);

// In this process, so the TypeScript hooks reach them.
run({ files, isolation: 'none' })
  .on('test:fail', () => {
    process.exitCode = 1;
  })
  .compose(spec)
  .pipe(process.stdout);
