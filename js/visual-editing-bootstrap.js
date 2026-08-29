/* ============================================================
   Southern Writers Guild — visual editing connection bootstrap
   js/visual-editing-bootstrap.js
   ============================================================

   A real ES module (unlike js/nav.js) so Vite can resolve the
   @sanity/visual-editing import — nav.js dynamically imports the built
   output of this file by its fixed path (see vite.config.js, which keeps
   this one entry's output filename stable/unhashed for exactly that
   reason).

   Why this exists as its own thing, called from nav.js (loaded on every
   page) rather than only from the-porch/story/index.html: Presentation
   Tool's very first connection attempt in any session lands on whatever
   page the Studio's previewUrl.initial points at — the site root, not a
   Porch story — since no document is selected yet. That first page never
   had this wired up, so Presentation Tool's Comlink handshake had nothing
   to connect to and reported "Unable to connect" before an editor ever
   reached a story. Calling enableVisualEditing() from nav.js means the
   connection can establish on whatever page loads first; its overlay
   scanner then picks up each page's own content as it renders (including
   a story's stega-encoded text, added to the DOM after this already
   started watching), so nothing further is needed per-page. */

import { enableVisualEditing } from '@sanity/visual-editing'

export function bootstrapVisualEditing() {
  return enableVisualEditing({
    history: {
      subscribe: (navigate) => {
        const handler = () => navigate({ type: 'pop', url: location.href })
        addEventListener('popstate', handler)
        return () => removeEventListener('popstate', handler)
      },
      update: (update) => {
        if (update.type === 'push') history.pushState(null, '', update.url)
        if (update.type === 'replace') history.replaceState(null, '', update.url)
      },
    },
  })
}
