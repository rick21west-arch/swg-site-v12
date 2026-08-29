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
