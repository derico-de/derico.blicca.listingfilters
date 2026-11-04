// What a visitor's page loads: separate from the editor's bundle, and with
// nothing to share with it at runtime.
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/live/index.ts'),
      formats: ['es'],
      fileName: () => 'listing-filters-live.js',
    },
    outDir: path.resolve(
      import.meta.dirname,
      '../src/derico/blicca/listingfilters/static',
    ),
    emptyOutDir: false,
    target: 'es2022',
    minify: false,
    sourcemap: true,
  },
});
