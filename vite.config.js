import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Multi-page build: every real page on the site becomes a Rollup entry so
// Vite processes its <script type="module"> tags and can resolve npm
// imports (like @sanity/client) inside them. Everything else about each
// page — markup, styling, routing — is untouched; this only gives the
// existing scripts a way to import real npm packages.
//
// index-backup2.html and index-original-backup.html are dead files, never
// linked or served on any real route — deliberately excluded.
const pages = [
  'index.html',
  '404.html',
  'events/index.html',
  'events/archive/index.html',
  'events/event/index.html',
  'join/index.html',
  'shop/index.html',
  'tarot/index.html',
  'the-house/index.html',
  'the-house/guidelines/index.html',
  'the-porch/index.html',
  'the-porch/archive/index.html',
  'the-porch/story/index.html',
  'the-work/index.html',
  'the-work/books/index.html',
  'the-work/featured/index.html',
  'the-work/featured/archive/index.html',
  'the-work/featured/book/index.html',
  'the-work/interviews/index.html',
  'the-work/videos/index.html',
  'the-work/videos/video/index.html',
  'welcome/index.html',
  'writers/index.html',
  'writers/writer/index.html',
];

export default defineConfig({
  plugins: [
    // Some pages reference css/js/images with a root-absolute path
    // (e.g. "/js/nav.js", "/css/swg.css", "/assets/images/foo.jpg")
    // instead of a relative one. Vite only rewrites relative references
    // during its HTML build, so those absolute ones need the real files
    // to exist verbatim at that same path in dist/ — this copies them
    // there unmodified, alongside Vite's normal hashed/bundled output for
    // the pages that already use relative paths. Belt and suspenders,
    // not a rewrite of either style.
    viteStaticCopy({
      targets: [
        { src: 'css/*', dest: '.' },
        { src: 'js/nav.js', dest: '.' },
        { src: 'assets/images/*', dest: '.' },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: Object.fromEntries(
        pages.map((p) => [p.replace(/\//g, '_').replace(/\.html$/, ''), resolve(__dirname, p)])
      ),
    },
  },
});
