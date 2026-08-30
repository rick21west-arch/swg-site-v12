(function () {
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', function () {
    var open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  links.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
})();

(function () {
  // swg_preview_active is the same non-secret hint cookie the Porch story
  // page already checks — its only job is telling any page whether to
  // attempt this. Loaded on every page (this file is) so Presentation
  // Tool's connection can establish on whichever page it lands on first
  // (its own initial default, before any document is selected, is the
  // site root — which never had this wired up before, hence "Unable to
  // connect" even after picking a story afterward).
  var isPreviewing = document.cookie.split('; ').some(function (c) {
    return c.indexOf('swg_preview_active=') === 0;
  });
  if (isPreviewing) {
    // Belt and suspenders, site-wide: while previewing, nothing should be
    // able to navigate an editor away to an outside site — not just the
    // specific cards this has been patched on already, but anything with a
    // real external href (a "Buy print" button, a ticket link, a "Read on
    // Substack" fallback, a future card nobody's thought to check yet).
    // Sanity's own overlay is supposed to catch clicks on the fields it
    // knows about and route them to Studio instead; this catches
    // everything else, in the capture phase, before a normal link click
    // ever gets the chance to leave the page. Cross-origin only — internal
    // links (the nav, "back to Events") still work normally so an editor
    // can browse the rest of the site while previewing.
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var url;
      try {
        url = new URL(a.href, location.href);
      } catch (err) {
        return;
      }
      if (url.origin !== location.origin) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/visual-editing-bootstrap.css';
    document.head.appendChild(link);

    import('/assets/visual-editing-bootstrap.js').then(function (mod) {
      mod.bootstrapVisualEditing();
    });
  }
})();