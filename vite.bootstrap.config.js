import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Separate build pass for js/visual-editing-bootstrap.js — kept out of the
// main vite.config.js because that one drives Vite's HTML-page pipeline
// (every entry there must be an .html file; mixing in a plain .js entry
// broke Vite's HTML parsing step for every other page). Library mode
// bundles this one file — with its @sanity/visual-editing import resolved
// — into a single, fixed-name ES module that js/nav.js dynamically
// imports at runtime by that exact path.
export default defineConfig({
  // Vite's normal (non-library) build replaces process.env.NODE_ENV with a
  // literal string automatically — standard for compatibility with
  // packages written assuming a Node/Webpack-style bundler (this is where
  // React's own dev/production branching comes from). Library mode does
  // NOT do this by default, since a published library is meant to be
  // re-bundled by whoever consumes it — but this file is never published,
  // it's built once and served as-is, so nothing else ever gets the
  // chance to define this. Without it, whatever inside
  // @sanity/visual-editing's dependency tree checks process.env.NODE_ENV
  // throws "process is not defined" the instant it runs in a real
  // browser, which is exactly what was happening: the crash happened
  // before enableVisualEditing() could ever attempt its connection.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist/assets',
    emptyOutDir: false, // the main `vite build` pass already populated dist/
    lib: {
      entry: resolve(__dirname, 'js/visual-editing-bootstrap.js'),
      formats: ['es'],
      fileName: () => 'visual-editing-bootstrap.js',
      cssFileName: 'visual-editing-bootstrap',
    },
  },
});
