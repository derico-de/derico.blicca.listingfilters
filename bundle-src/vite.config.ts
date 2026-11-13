// The canonical block add-on library build (block add-on contract §1.2).
// The output is committed into the Python package's static/.
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { scopeWrap } from './build-plugins/scope-wrap';

// The promised singleton-critical modules (contract §2.1).
const SHARED_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'jotai',
  'platejs',
  '@plone/registry',
  '@plone/helpers',
  'react-i18next',
];

function assertNoSharedInBundle(): Plugin {
  const banned =
    /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(react|react-dom|jotai|platejs|@plone\/registry|@plone\/helpers|react-i18next)\//;
  return {
    name: 'assert-no-shared-in-bundle',
    generateBundle() {
      for (const id of this.getModuleIds()) {
        if (banned.test(id)) {
          throw new Error(
            `Promised shared module bundled: ${id} — it must stay external ` +
              '(block add-on contract §2.1).',
          );
        }
      }
    },
  };
}

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    minifySyntax: false,
  },
  plugins: [
    {
      // enforce post: Vite's css-post plugin emits the CSS asset late in
      // generateBundle, and the wrap must run after it.
      ...scopeWrap({
        scopeRoots: [
          '.aurora-editor',
          '.aurora-editor-portal',
          '.aurora-blocks-view',
        ],
        scopeLimit: '.aurora-pattern-island',
      }),
      enforce: 'post',
    },
    assertNoSharedInBundle(),
  ],
  build: {
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/index.tsx'),
      formats: ['es'],
      fileName: () => 'listing-filters.js',
    },
    outDir: path.resolve(
      import.meta.dirname,
      '../src/derico/blicca/listingfilters/static',
    ),
    emptyOutDir: false,
    target: 'es2022',
    minify: false,
    cssMinify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      external: SHARED_MODULES,
      output: {
        assetFileNames: 'listing-filters.[ext]',
      },
    },
  },
});
