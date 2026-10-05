// Lets Node load the app's TypeScript as Metro does, for the scripts that
// import it (`npm run contrast`, `npm test`): Node reads TypeScript itself
// from 22.18 on, and this finds the files the imports leave the extension
// out of, and the ones behind "@/".
import module from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.features.typescript || typeof module.registerHooks !== 'function') {
  console.error(`Este script necesita Node 22.18 o más nuevo, que lee TypeScript; este es ${process.version}.`);
  process.exit(1);
}

const src = pathToFileURL(fileURLToPath(new URL('../src/', import.meta.url))).href;

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    const path = specifier.startsWith('@/') ? new URL(specifier.slice(2), src).href : specifier;
    const local = path.startsWith('.') || path.startsWith('file:');
    const candidates = local ? [path, `${path}.ts`, `${path}/index.ts`] : [path];
    for (const [index, candidate] of candidates.entries()) {
      try {
        const resolved = nextResolve(candidate, context);
        return resolved.url.endsWith('.ts') ? { ...resolved, format: 'module-typescript' } : resolved;
      } catch (error) {
        if (index === candidates.length - 1) throw error;
      }
    }
  },
});
