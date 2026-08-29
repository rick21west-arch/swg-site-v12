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
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/visual-editing-bootstrap.css';
    document.head.appendChild(link);

    import('/assets/visual-editing-bootstrap.js').then(function (mod) {
      mod.bootstrapVisualEditing();
    });
  }
})();