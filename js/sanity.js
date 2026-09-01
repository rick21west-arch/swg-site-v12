/* ============================================================
   Southern Writers Guild — Sanity CMS fetch layer
   js/sanity.js
   ============================================================ */

   import { createClient } from '@sanity/client'

   // Re-exported so pages never need their own @sanity/client/stega import —
   // strips stega's invisible edit-metadata characters before a value goes
   // anywhere other than a visible text node (document.title, alt text,
   // date parsing, URL building). No-op on a string that was never
   // stega-encoded, so it's safe to call unconditionally on any fetched
   // value regardless of whether the page is in preview mode.
   //
   // Deliberately NOT called anywhere else in this file (e.g. inside
   // renderBookCard/renderVideoCard below): this module is a single shared
   // chunk loaded by every page on the site, so any real usage here (not
   // just a re-export) pulls the stega decode runtime (~5KB gzipped) into
   // that shared chunk for every page, including ones with nothing to do
   // with preview mode. Confirmed by a build-diff before this comment was
   // written — the-house/ and other pages that never touch preview data
   // started loading an extra chunk the moment stegaClean was invoked at
   // module scope here. Pages that render preview data instead call
   // stegaClean themselves, in their own inline <script type="module">
   // (see the-porch/story, events/event, the-work/featured,
   // the-work/videos) — each of those becomes its own chunk, so only pages
   // that actually preview pay for the runtime.
   export { stegaClean } from '@sanity/client/stega'

   const SANITY_PROJECT_ID = 'fe6l0kiy'
   const SANITY_DATASET    = 'production'
   const SANITY_API_VER    = '2024-01-01'

   /* The real Sanity client, not a hand-rolled fetch() — this is what lets
      the site adopt stega encoding and click-to-edit later, since those
      depend on the client library's query/response pipeline. useCdn matches
      the previous .apicdn.sanity.io behavior (cached, public, read-only). */
   const client = createClient({
     projectId: SANITY_PROJECT_ID,
     dataset: SANITY_DATASET,
     apiVersion: SANITY_API_VER,
     useCdn: true,
   })

   /* Resolve thumbnail — prefers a manually uploaded Sanity image, then a manual
      thumbnailUrl string, then (for YouTube videos with neither) YouTube's own
      thumbnail, pulled automatically so nobody has to upload one by hand. */
   export function thumbSrc(doc, width = 800) {
     if (doc.thumbnail?.asset?._ref) {
       const ref   = doc.thumbnail.asset._ref
       const parts = ref.replace('image-', '').split('-')
       const ext   = parts.pop()
       const id    = parts.join('-')
       return `https://cdn.sanity.io/images/${SANITY_PROJECT_ID}/${SANITY_DATASET}/${id}.${ext}?w=${width}&auto=format`
     }
     if (doc.thumbnailUrl) return doc.thumbnailUrl
     const yt = (doc.substackUrl || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)
     if (yt) return `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`
     return null
   }

   /* Where to center a cropped thumbnail. Sanity stores an editor-set hotspot
      (x/y as 0–1 fractions of the image) when the "hotspot" option is on for
      an image field. object-fit:cover normally crops dead-center, which can
      cut off the actual subject of a photo — this reads the hotspot, if one
      was set in Studio, and points the crop there instead. Falls back to a
      plain center crop when no hotspot exists. */
   export function thumbPosition(doc) {
     const hs = doc.thumbnail?.hotspot
     if (hs && typeof hs.x === 'number' && typeof hs.y === 'number') {
       return `${(hs.x * 100).toFixed(1)}% ${(hs.y * 100).toFixed(1)}%`
     }
     return '50% 50%'
   }
    
   /* Generic fetch helper — same signature and behavior as before (resolves
      to the query result, throws on failure), now backed by the real client. */
   export async function sanityFetch(query) {
     return client.fetch(query)
   }
    
   /* ── Porch stories ─────────────────────────────────────────── */
    
   export async function fetchPorchStories(limit = 9) {
     return sanityFetch(
       `*[_type == "porchStory" && featured == true] | order(publishedAt desc) [0...${limit}]`
     )
   }
    
   export async function fetchAllPorchStories() {
     return sanityFetch(
       `*[_type == "porchStory"] | order(publishedAt desc)`
     )
   }

   export async function fetchPorchStoryBySlug(slug) {
     const safe = String(slug).replace(/"/g, '\\"')
     return sanityFetch(
       `*[_type == "porchStory" && slug.current == "${safe}"][0]`
     )
   }

   /* ── Essays (curated Porch pieces, surfaced on The Work) ─────── */

   export async function fetchEssays(limit = 9) {
     return sanityFetch(
       `*[_type == "porchStory" && essayFeatured == true] | order(publishedAt desc) [0...${limit}]`
     )
   }

   /* ── Interviews (guildVideo, type == "conversation") ─────────── */

   export async function fetchInterviews(limit = 9) {
     return sanityFetch(
       `*[_type == "guildVideo" && type == "conversation" && (featured == true || !defined(featured))] | order(publishedAt desc) [0...${limit}] {title, description, participants, publishedAt, duration, thumbnail, substackUrl, slug}`
     )
   }

   export async function fetchAllInterviews() {
     return sanityFetch(
       `*[_type == "guildVideo" && type == "conversation"] | order(publishedAt desc) {title, description, participants, publishedAt, duration, thumbnail, substackUrl}`
     )
   }

   /* ── Music (ambient tracks, hosted on YouTube) ───────────────── */
   /* Lives on the shared guildVideo type, filtered to type == "music".
      substackUrl holds the YouTube link despite the field's old name. */

   export async function fetchMusicVideos() {
     return sanityFetch(
       `*[_type == "guildVideo" && type == "music"] | order(publishedAt desc) {title, thumbnail, substackUrl, slug}`
     )
   }

   /* ── Just the Three of Us (guildVideo, type == "guild") ───────── */
   /* The founders talking to each other, no outside guest. Home page
      shows only the most recent few; the rest lives on YouTube. */

   export async function fetchGuildTalks(limit = 2) {
     return sanityFetch(
       `*[_type == "guildVideo" && type == "guild"] | order(publishedAt desc) [0...${limit}] {title, thumbnail, substackUrl, slug}`
     )
   }

   export function renderSmallThumb(video, { linkToPage = false, size = '' } = {}) {
     const thumb = thumbSrc(video, 300)
     const pageHref = linkToPage && video.slug && video.slug.current
       ? `/the-work/videos/${video.slug.current}/`
       : null
     const href = pageHref || video.substackUrl
     const sizeClass = size ? ` small-thumb--${size}` : ''
     return `
       <a href="${esc(href)}"${pageHref ? '' : ' target="_blank" rel="noopener"'} class="small-thumb${sizeClass}">
         ${thumb
           ? `<img src="${esc(thumb)}" alt="${esc(video.title)}">`
           : `<div class="small-thumb-fallback"></div>`}
         <span class="small-thumb-title">${esc(video.title)}</span>
       </a>`
   }

   /* ── Events ─────────────────────────────────────────────────── */
   /* Forward-looking, so sorted soonest-first rather than newest-first
      like everything else on the site. */

   export async function fetchEvents(limit = 9) {
     return sanityFetch(
       `*[_type == "event" && (featured == true || !defined(featured))] | order(eventDate asc) [0...${limit}]`
     )
   }

   export async function fetchAllEvents() {
     return sanityFetch(
       `*[_type == "event"] | order(eventDate asc)`
     )
   }

   export async function fetchEventBySlug(slug) {
     const safe = String(slug).replace(/"/g, '\\"')
     return sanityFetch(
       `*[_type == "event" && slug.current == "${safe}"][0]`
     )
   }

   export function renderEventCard(event) {
     const thumb = thumbSrc(event, 800)
     const img = thumb
       ? `<img src="${esc(thumb)}" alt="${esc(event.title)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;margin-bottom:0.75rem;">`
       : `<div style="aspect-ratio:16/9;background:var(--bg-3);margin-bottom:0.75rem;"></div>`
     const hasSlug = Boolean(event.slug && event.slug.current)
     const href = hasSlug ? `/events/${event.slug.current}/` : '#'
     return `
       <a href="${esc(href)}" class="card" style="display:block;text-decoration:none;">
         ${img}
         <span class="card-label">${esc(formatEventDate(event.eventDate))}${event.venue ? ` &nbsp;·&nbsp; ${esc(event.venue)}` : ''}</span>
         <h2 class="card-title card-title--sm">${esc(event.title)}</h2>
         ${event.subtitle ? `<p class="card-body" style="font-size:0.9rem;">${esc(event.subtitle)}</p>` : ''}
       </a>`
   }

   function formatEventDate(dateStr) {
     if (!dateStr) return ''
     const d = new Date(dateStr + 'T12:00:00Z')
     return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
   }

   /* ── Homepage Highlights ───────────────────────────────────── */
   /* Sanity-managed, toggle-controlled. Editors flip "Show on homepage"
      on/off on any Porch Story or Guild Video in Studio — no code or
      deploy needed to change what's featured. Stories and videos are
      pulled together, newest first, so either kind can fill any of the
      slots. Render with renderPorchCard or renderVideoCard depending
      on each item's _type — see homepage script. */

   export async function fetchHomepageHighlights(limit = 3) {
     return sanityFetch(
       `*[(_type == "porchStory" || _type == "guildVideo") && showOnHomepage == true] | order(publishedAt desc) [0...${limit}]`
     )
   }

   /* ── Site Settings ─────────────────────────────────────────── */

   export async function fetchSiteSettings() {
     return sanityFetch(
       `*[_type == "siteSettings"][0]`
     )
   }

   /* ── House Content ──────────────────────────────────────────── */
   /* Singleton, same convention as siteSettings — one document feeds two
      pages (The House, its Submission Guidelines page), each pulling only
      the fields it needs from the same fetch. */

   export async function fetchHouseContent() {
     return sanityFetch(
       `*[_type == "houseContent"][0]`
     )
   }

   /* ── Home Content ───────────────────────────────────────────── */
   /* Singleton, same convention as siteSettings/houseContent — the
      homepage hero (headline, subhead, mission blurb). */

   export async function fetchHomeContent() {
     return sanityFetch(
       `*[_type == "homeContent"][0]`
     )
   }

   /* ── Writers ────────────────────────────────────────────────── */
   /* Every writer document, in Studio-set display order — not four fixed
      slots, so a fifth entry (real writer or character-only, like
      Jean-Paul) needs no code change here or on either page that uses
      this. realName is the signal the listing/individual pages use to
      pick a layout: present means a paired character/real-person
      treatment, blank means a character-only one. */

   const WRITER_FIELDS = `_id, characterName, characterDescriptor, realName,
        writerBio, characterBio, displayOrder, "slug": slug.current,
        "characterPhotoUrl": characterPhoto.asset->url,
        "characterPhotoHotspot": characterPhoto.hotspot,
        "avatarPhotoUrl": avatarPhoto.asset->url,
        links`

   export async function fetchWriters() {
     return sanityFetch(
       `*[_type == "writer"] | order(displayOrder asc) {${WRITER_FIELDS}}`
     )
   }

   export async function fetchWriterBySlug(slug) {
     const safe = String(slug).replace(/"/g, '\\"')
     return sanityFetch(
       `*[_type == "writer" && slug.current == "${safe}"][0] {${WRITER_FIELDS}}`
     )
   }

   /* ── Bookshelf (featuredFiction) ───────────────────────────── */
    
   export async function fetchFeaturedFiction() {
     return sanityFetch(
       `*[_type == "featuredFiction"] | order(_createdAt desc) {
         title, author, description, status, featuredMonth,
         substackUrl, printUrl, ebookUrl, note, commentary,
         "coverUrl": coverImage.asset->url
       }`
     )
   }
    
   export function renderFeaturedFiction(items) {
     const current = items.find(i => i.status === 'current')
     const past = items.filter(i => i.status === 'past')
     const recent = past.slice(0, 2)
    
     const currentCard = current ? `
       <div class="card card--highlight">
         <span class="card-badge">Current</span>
         ${current.coverUrl
           ? `<div style="margin-bottom:1.25rem;">
                <img src="${esc(current.coverUrl)}" alt="${esc(current.title)}" style="width:100%;max-height:320px;object-fit:contain;object-position:top;display:block;">
              </div>`
           : ''}
         <span class="card-label">${esc(current.author || '')} &nbsp;·&nbsp; Fiction</span>
         <h2 class="card-title">${esc(current.title)}</h2>
         ${current.description ? `<p class="card-body">${esc(current.description)}</p>` : ''}
         ${current.note ? `<p class="card-note">${esc(current.note)}</p>` : ''}
         ${current.substackUrl ? `<a href="${esc(current.substackUrl)}" target="_blank" rel="noopener" class="btn btn--primary" style="margin-top:1rem;">Read it</a>` : ''}
         ${current.ebookUrl ? `<a href="${esc(current.ebookUrl)}" target="_blank" rel="noopener" class="btn btn--ghost" style="margin-top:0.6rem;">Buy on Amazon →</a>` : ''}
       </div>` : ''
    
     const recentCards = recent.map(item => `
       <div class="card card--dim">
         <div style="display:grid;grid-template-columns:90px 1fr;gap:1rem;align-items:start;">
           ${item.coverUrl
             ? `<img src="${esc(item.coverUrl)}" alt="${esc(item.title)}" style="width:90px;height:auto;display:block;">`
             : '<div style="width:90px;height:130px;background:var(--bg-3);"></div>'}
           <div>
             <span class="card-label">Previously featured</span>
             <h3 class="card-title card-title--sm">${esc(item.title)}</h3>
             <p class="card-body" style="font-size:0.85rem;margin-top:0.25rem;">${esc(item.author || '')}</p>
             ${item.description ? `<p class="card-body" style="font-size:0.82rem;margin-top:0.5rem;color:var(--text-faint);">${esc(item.description.slice(0, 120))}${item.description.length > 120 ? '…' : ''}</p>` : ''}
             ${item.featuredMonth ? `<p class="card-note" style="margin-top:0.5rem;">${esc(item.featuredMonth)}</p>` : ''}
             ${item.substackUrl ? `<a href="${esc(item.substackUrl)}" target="_blank" rel="noopener" class="btn btn--ghost" style="margin-top:0.75rem;font-size:0.58rem;">Read →</a>` : ''}
           </div>
         </div>
       </div>`).join('')
    
     return `
       <div class="grid grid--featured" style="margin-bottom:1rem;">
         ${currentCard}
         <div style="display:flex;flex-direction:column;gap:1rem;">
           ${recentCards}
         </div>
       </div>`
   }
    
   export function renderFeaturedArchive(items) {
     const archive = items.filter(i => i.status === 'past').slice(2)
     if (!archive.length) return ''
    
     return `
       <div id="archive" style="margin-top:var(--sp-lg);padding-top:var(--sp-md);border-top:0.5px solid var(--border);">
         <div class="section-header" style="margin-bottom:1rem;">
           <span class="section-header-title">Archive</span>
           <span class="card-label" style="color:var(--text-faint);margin:0;">All Bookshelf picks</span>
         </div>
         <div class="grid grid--3">
           ${archive.map(item => `
             <a href="${esc(item.substackUrl || '#')}" target="_blank" rel="noopener" class="card" style="text-decoration:none;">
               ${item.coverUrl
                 ? `<div style="margin-bottom:0.75rem;">
                      <img src="${esc(item.coverUrl)}" alt="${esc(item.title)}" style="width:100%;height:auto;display:block;">
                    </div>`
                 : '<div style="height:140px;background:var(--bg-3);margin-bottom:0.75rem;"></div>'}
               <span class="card-label">${esc(item.author || '')} &nbsp;·&nbsp; ${esc(item.status === 'current' ? 'Current' : item.featuredMonth || '')}</span>
               <h3 class="card-title card-title--sm">${esc(item.title)}</h3>
               ${item.note ? `<p class="card-note">${esc(item.note)}</p>` : ''}
             </a>`).join('')}
           <div class="card card--dim" style="border-style:dashed;display:flex;align-items:center;justify-content:center;min-height:200px;">
             <span class="card-body" style="text-align:center;font-size:0.9rem;font-style:italic;">
               Future features<br>added here
             </span>
           </div>
         </div>
       </div>`
   }
    
   /* ── Guild videos ──────────────────────────────────────────── */
    
   export async function fetchVideos(limit = 3) {
     return sanityFetch(
       `*[_type == "guildVideo"] | order(publishedAt desc) [0...${limit}]`
     )
   }
    
   export async function fetchAllVideos() {
     return sanityFetch(
       `*[_type == "guildVideo"] | order(publishedAt desc)`
     )
   }
    
   export async function fetchConversations(limit = 6) {
    return sanityFetch(
      `*[_type == "guildVideo" && type == "conversation"] | order(publishedAt desc) [0...${limit}]`
    )
  }

   // Isolated test of a single-document, single-fetch individual page for
   // guildVideo — same pattern as fetchPorchStoryBySlug/fetchEventBySlug
   // above, deliberately not touched by or wired into the existing
   // three-section listing page (the-work/videos/index.html) or
   // renderVideoCard. Only documents with a slug set resolve here; the
   // other 11 videos have none and are unaffected.
   export async function fetchVideoBySlug(slug) {
     const safe = String(slug).replace(/"/g, '\\"')
     return sanityFetch(
       `*[_type == "guildVideo" && slug.current == "${safe}"][0]`
     )
   }

  /* ── Card renderers ─────────────────────────────────────────── /* ── Card renderers ─────────────────────────────────────────── */
    
   export function renderPorchCard(story) {
     const thumb = thumbSrc(story)
     const pos = thumbPosition(story)
     // Thumbnails vary — some are wide photos, some are tall poster-style
     // covers (like a magazine cover). Cropping to a fixed landscape box
     // cuts the top/bottom off tall images, so the whole image is shown
     // inside the box instead of cropped to fill it.
     const img = thumb
       ? `<div style="aspect-ratio:16/9;background:var(--bg-3);margin-bottom:0.75rem;overflow:hidden;">
            <img src="${thumb}" alt="${esc(story.title)}" style="width:100%;height:100%;object-fit:contain;object-position:${pos};display:block;">
          </div>`
       : `<div style="aspect-ratio:16/9;background:var(--bg-3);display:flex;align-items:center;justify-content:center;margin-bottom:0.75rem;">
            <span style="font-family:var(--font-serif);font-style:italic;color:var(--text-faint);font-size:0.95rem;text-align:center;padding:1rem;">${esc(story.excerpt || story.title)}</span>
          </div>`
     // Stories with a slug now have their own page on this site. Older stories
     // without one still fall back to the original Substack post.
     const hasSlug = Boolean(story.slug && story.slug.current)
     const href = hasSlug ? `/the-porch/${story.slug.current}/` : story.substackUrl
     const external = hasSlug ? '' : 'target="_blank" rel="noopener"'
     return `
       <a href="${esc(href)}" ${external} class="card" style="display:block;text-decoration:none;">
         ${img}
         <span class="card-label">${esc(formatDate(story.publishedAt))} &nbsp;·&nbsp; ${esc(story.authors || '')}</span>
         <h2 class="card-title card-title--sm">${esc(story.title)}</h2>
         ${story.excerpt ? `<p class="card-body" style="font-size:0.9rem;">${esc(story.excerpt)}</p>` : ''}
       </a>`
   }
    
   export async function fetchFeaturedBooks(limit = 9) {
     return sanityFetch(
       `*[_type == "featuredFiction" && (featured == true || !defined(featured))] | order(_createdAt desc) [0...${limit}] {
         title, author, description, status, featuredMonth,
         substackUrl, printUrl, ebookUrl, note, commentary,
         "coverUrl": coverImage.asset->url
       }`
     )
   }

   // linkToPage wraps the whole card in a real internal link to the shared
   // Bookshelf page (featuredFiction has no individual page — see
   // the-work/featured), same pattern as renderPorchCard's whole-card link.
   // Off by default so every existing caller (the-work/books,
   // the-work/featured itself) renders exactly as before; only
   // the-work/index.html's Books section opts in. The overlay link is
   // absolutely positioned behind the card content and the outbound
   // Buy print/Ebook buttons are raised above it (position:relative +
   // z-index), so those keep working as their own separate links — an <a>
   // can't validly nest inside another <a>, so this stacks two siblings
   // instead of nesting.
   export function renderBookCard(book, { linkToPage = false } = {}) {
     const overlay = linkToPage
       ? `<a href="/the-work/featured/" aria-label="${esc(book.title)}" style="position:absolute;inset:0;"></a>`
       : ''
     return `
       <div class="card"${linkToPage ? ' style="position:relative;"' : ''}>
         ${overlay}
         ${book.coverUrl
           ? `<img src="${esc(book.coverUrl)}" alt="${esc(book.title)}" style="width:100%;aspect-ratio:2/3;object-fit:cover;display:block;margin-bottom:0.75rem;">`
           : `<div style="aspect-ratio:2/3;background:var(--bg-3);margin-bottom:0.75rem;"></div>`}
         <span class="card-label">${esc(book.author || '')}</span>
         <h2 class="card-title">${esc(book.title)}</h2>
         ${book.note ? `<p class="card-body" style="font-size:0.9rem;">${esc(book.note)}</p>` : ''}
         ${book.commentary ? `<p class="card-body" style="font-size:0.9rem;font-style:italic;">${esc(book.commentary)}</p>` : ''}
         <div style="display:flex;gap:0.5rem;margin-top:1rem;flex-wrap:wrap;${linkToPage ? 'position:relative;z-index:1;' : ''}">
           ${book.printUrl ? `<a href="${esc(book.printUrl)}" target="_blank" rel="noopener" class="btn btn--primary" style="font-size:0.6rem;">Buy print</a>` : ''}
           ${book.ebookUrl ? `<a href="${esc(book.ebookUrl)}" target="_blank" rel="noopener" class="btn btn--ghost" style="font-size:0.6rem;">Ebook →</a>` : ''}
         </div>
       </div>`
   }

   // Images carry no stega — text is tagged automatically by the query
   // pipeline, but an <img> needs this built by hand, in the exact
   // semicolon-delimited format Sanity's own docs specify, or it's never a
   // click-to-edit target at all (confirmed directly, independent of
   // everything else about this card: img.hasAttribute('data-sanity') was
   // false before this existed). Ships on every visitor's page, previewing
   // or not — inert to a normal browser, meaningful only to Sanity's own
   // overlay scanner. A plain string template rather than importing
   // createDataAttribute() from @sanity/visual-editing, which would bundle
   // that package into this always-loaded shared chunk for every visitor.
   function thumbnailDataAttr(doc, type) {
     if (!doc._id) return ''
     const base = encodeURIComponent('https://swg-studio.sanity.studio')
     return `id=${doc._id};type=${type};path=thumbnail;base=${base}`
   }

   // Same mechanism as thumbnailDataAttr above, generalized with a path
   // argument — writer documents have two separate image fields
   // (characterPhoto, avatarPhoto), not the one guildVideo has. Exported
   // since writer pages build their markup directly rather than through a
   // shared render*Card function.
   export function sanityImageDataAttr(doc, type, path) {
     if (!doc._id) return ''
     const base = encodeURIComponent('https://swg-studio.sanity.studio')
     return `id=${doc._id};type=${type};path=${path};base=${base}`
   }

   // Structured the same way renderBookCard is, deliberately: a plain
   // div.card, an unlinked image, a bare heading, and the actual action
   // (Watch, here; Buy print / Ebook there) as its own small link at the
   // bottom — never the whole card, never the title, wrapped in a link.
   // renderBookCard is the one card renderer already confirmed end-to-end
   // by a real click in Presentation Tool; this mirrors its shape field
   // for field rather than reproducing the old whole-card-is-a-link
   // design this file used to have (and the divergent preview-only variant
   // that grew up next to it in the-work/videos/index.html to work around
   // that design) — one function, used identically whether previewing or
   // not, same as featured fiction.
   // linkToPage wraps the whole card in a real internal link to the
   // video's own individual page (only exists for documents with a slug —
   // see api/preview-video.js / the-work/videos/video). Off by default so
   // every existing caller (the crowded the-work/videos listing, the
   // homepage, the-work/interviews) renders exactly as before — that
   // whole-card-links-out design was the confirmed root cause of an
   // earlier bug (see PROJECT_LOG), so this must stay opt-in, never the
   // default. Only the-work/index.html's Interviews section opts in. Same
   // overlay-behind-content stacking trick as renderBookCard's
   // linkToPage, so the outbound Watch button keeps working as its own
   // separate link instead of nesting inside the internal one.
   export function renderVideoCard(video, size = 'large', { linkToPage = false } = {}) {
     const thumb = thumbSrc(video)
     const pageHref = linkToPage && video.slug && video.slug.current
       ? `/the-work/videos/${video.slug.current}/`
       : null
     const overlay = pageHref
       ? `<a href="${esc(pageHref)}" aria-label="${esc(video.title)}" style="position:absolute;inset:0;z-index:1;"></a>`
       : ''
     const btnSize = size === 'large' ? 56 : 38
     const borderTop = size === 'large' ? 11 : 8
     const borderSide = size === 'large' ? 20 : 14
     const ml = size === 'large' ? 4 : 3
     const playBtn = `
       <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">
         <div style="width:${btnSize}px;height:${btnSize}px;border-radius:50%;background:rgba(184,92,56,0.9);display:flex;align-items:center;justify-content:center;">
           <div style="width:0;height:0;border-top:${borderTop}px solid transparent;border-bottom:${borderTop}px solid transparent;border-left:${borderSide}px solid #EDE5D0;margin-left:${ml}px;"></div>
         </div>
       </div>`
     // Thumbnails vary — some are wide stills, some are tall portrait crops
     // (phone-shot video, vertical posters). Cropping to a fixed landscape
     // box cuts the top/bottom off tall images, so the whole image is shown
     // inside the box instead of cropped to fill it — same fix as the Porch
     // cards use for the same reason.
     const imgHtml = thumb
       ? `<div style="position:relative;margin-bottom:0.75rem;aspect-ratio:16/9;background:var(--bg-3);overflow:hidden;"><img src="${esc(thumb)}" alt="${esc(video.title)}" data-sanity="${esc(thumbnailDataAttr(video, 'guildVideo'))}" style="width:100%;height:100%;object-fit:contain;display:block;">${playBtn}</div>`
       : `<div style="position:relative;margin-bottom:0.75rem;aspect-ratio:16/9;background:var(--bg-3);display:flex;align-items:center;justify-content:center;">${playBtn}</div>`
     const cardClass = size === 'large' ? 'card card--highlight' : 'card card--dim'
     const titleClass = size === 'large' ? 'card-title' : 'card-title card-title--sm'
     return `
       <div class="${cardClass}"${pageHref ? ' style="position:relative;"' : ''}>
         ${overlay}
         ${imgHtml}
         <span class="card-label">${esc(formatDate(video.publishedAt))} &nbsp;·&nbsp; ${esc(video.participants || '')}</span>
         <h2 class="${titleClass}">${esc(video.title)}</h2>
         ${video.description ? `<p class="card-body">${esc(video.description)}</p>` : ''}
         <div style="display:flex;gap:0.5rem;margin-top:1rem;flex-wrap:wrap;${pageHref ? 'position:relative;z-index:2;' : ''}">
           <a href="${esc(video.substackUrl)}" target="_blank" rel="noopener" class="btn btn--primary" style="font-size:0.6rem;">${video.duration ? esc(video.duration) + ' &nbsp;·&nbsp; ' : ''}Watch →</a>
         </div>
       </div>`
   }
    
   /* ── Utilities ─────────────────────────────────────────────── */
    
   // Exported (not just used internally) so a page can build its own
   // preview-only card markup with the same escaping/date formatting —
   // see the-work/videos/index.html's renderVideoCardPreview. Pure
   // functions already defined in this file either way, so exporting them
   // adds no bundle weight.
   export function esc(str) {
     if (!str) return ''
     return String(str)
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
   }

   export function formatDate(dateStr) {
     if (!dateStr) return ''
     const d = new Date(dateStr + 'T12:00:00Z')
     return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
   }
    
   /* ── Portable Text → HTML ──────────────────────────────────── */
   /* Minimal renderer for Sanity's rich-text format. No build step on
      this site, so this is hand-written rather than a package import.
      Handles paragraphs, headings, blockquotes, bullet/numbered lists,
      bold, italic, and links — the set the Studio's Story Text field
      offers. */

   /* Turns a YouTube or Vimeo link into an embedded player. Falls back to a
      plain "Watch the video" link if the URL doesn't match either pattern. */
   function renderVideoBlock(block) {
     const url = block.url || ''
     const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)
     const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)

     let embedSrc = null
     if (yt) embedSrc = `https://www.youtube.com/embed/${yt[1]}`
     else if (vimeo) embedSrc = `https://player.vimeo.com/video/${vimeo[1]}`

     if (!embedSrc) {
       return url
         ? `<p><a href="${esc(url)}" target="_blank" rel="noopener">Watch the video →</a></p>`
         : ''
     }

     const caption = block.caption
       ? `<p style="font-family:var(--font-ui);font-size:0.8rem;color:var(--text-faint);margin-top:0.5rem;">${esc(block.caption)}</p>`
       : ''

     return `
       <div style="position:relative;width:100%;aspect-ratio:16/9;margin:1.5rem 0;background:var(--bg-3);">
         <iframe src="${esc(embedSrc)}" style="position:absolute;inset:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
       </div>
       ${caption}`
   }

   /* Turns a Spotify or SoundCloud link into an embedded player. Falls back to a
      plain "Listen" link for anything else (Substack podcast pages, YouTube audio, etc.).
      If an uploaded audio file is present, it takes priority and renders as a
      native <audio> player instead of any URL embed. */
   function renderAudioBlock(block) {
     const caption = block.caption
       ? `<p style="font-family:var(--font-ui);font-size:0.8rem;color:var(--text-faint);margin-top:0.5rem;">${esc(block.caption)}</p>`
       : ''

     const fileRef = block.file && block.file.asset && block.file.asset._ref
     if (fileRef) {
       const parts = fileRef.replace('file-', '').split('-')
       const ext = parts.pop()
       const id = parts.join('-')
       const src = `https://cdn.sanity.io/files/${SANITY_PROJECT_ID}/${SANITY_DATASET}/${id}.${ext}`
       return `
         <div style="margin:1.5rem 0;">
           ${block.caption ? `<p style="font-family:var(--font-ui);font-size:0.8rem;color:var(--text-faint);margin-bottom:0.5rem;">${esc(block.caption)}</p>` : ''}
           <audio src="${esc(src)}" controls style="width:100%;"></audio>
         </div>`
     }

     const url = block.url || ''
     const spotify = url.match(/open\.spotify\.com\/(track|episode|show|album)\/([\w]+)/)
     const soundcloud = url.match(/soundcloud\.com\/[\w-]+\/[\w-]+/)

     if (spotify) {
       const embedSrc = `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}`
       return `
         <div style="margin:1.5rem 0;">
           <iframe src="${esc(embedSrc)}" style="width:100%;height:152px;border:0;border-radius:12px;" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
         </div>
         ${caption}`
     }

     if (soundcloud) {
       const embedSrc = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23df8d52&auto_play=false&show_user=true`
       return `
         <div style="margin:1.5rem 0;">
           <iframe src="${esc(embedSrc)}" style="width:100%;height:166px;border:0;" allow="autoplay" loading="lazy"></iframe>
         </div>
         ${caption}`
     }

     return url
       ? `<p><a href="${esc(url)}" target="_blank" rel="noopener">Listen →</a></p>${caption}`
       : ''
   }

   /* Turns an inline image block into an <img>, with an optional caption.
      Width is controlled by the editor's "Image size" choice in Studio. */
   const IMAGE_SIZE_WIDTH = { small: '320px', medium: '600px', large: '900px', full: '100%' }

   function renderImageBlock(block) {
     const ref = block.asset && block.asset._ref
     if (!ref) return ''
     const parts = ref.replace('image-', '').split('-')
     const ext = parts.pop()
     const id = parts.join('-')
     const src = `https://cdn.sanity.io/images/${SANITY_PROJECT_ID}/${SANITY_DATASET}/${id}.${ext}?w=1200&auto=format`
     const caption = block.caption
       ? `<p style="font-family:var(--font-ui, inherit);font-size:0.8rem;color:var(--text-faint);margin-top:0.5rem;text-align:center;">${esc(block.caption)}</p>`
       : ''
     const maxWidth = IMAGE_SIZE_WIDTH[block.size] || IMAGE_SIZE_WIDTH.full
     return `
       <figure style="margin:1.5rem auto;max-width:${maxWidth};">
         <img src="${esc(src)}" alt="${esc(block.caption || '')}" style="width:100%;height:auto;display:block;">
         ${caption}
       </figure>`
   }

   /* Renders a manual section break inside a story. */
   function renderDividerBlock() {
     return '<hr style="border:none;border-top:1px solid var(--border);margin:2.5rem 0;">'
   }

   export function renderPortableText(blocks) {
     if (!Array.isArray(blocks) || !blocks.length) return ''

     const out = []
     let listBuffer = []
     let listTag = null

     function flushList() {
       if (listBuffer.length) {
         out.push(`<${listTag}>${listBuffer.join('')}</${listTag}>`)
         listBuffer = []
         listTag = null
       }
     }

     function renderSpans(block) {
       const markDefs = block.markDefs || []
       return (block.children || []).map(span => {
         let text = esc(span.text || '')
         ;(span.marks || []).forEach(mark => {
           const def = markDefs.find(m => m._key === mark)
           if (def && def._type === 'link' && def.href) {
             text = `<a href="${esc(def.href)}" target="_blank" rel="noopener">${text}</a>`
           } else if (mark === 'strong') {
             text = `<strong>${text}</strong>`
           } else if (mark === 'em') {
             text = `<em>${text}</em>`
           }
         })
         return text
       }).join('')
     }

     blocks.forEach(block => {
       if (block._type === 'videoEmbed') {
         flushList()
         out.push(renderVideoBlock(block))
         return
       }
       if (block._type === 'image') {
         flushList()
         out.push(renderImageBlock(block))
         return
       }
       if (block._type === 'audioEmbed') {
         flushList()
         out.push(renderAudioBlock(block))
         return
       }
       if (block._type === 'divider') {
         flushList()
         out.push(renderDividerBlock())
         return
       }
       if (block._type !== 'block') { flushList(); return }

       const isListItem = block.listItem === 'bullet' || block.listItem === 'number'
       if (isListItem) {
         const tag = block.listItem === 'number' ? 'ol' : 'ul'
         if (listTag && listTag !== tag) flushList()
         listTag = tag
         listBuffer.push(`<li>${renderSpans(block)}</li>`)
         return
       }
       flushList()

       const inner = renderSpans(block)
       if (!inner.trim()) { out.push('<p>&nbsp;</p>'); return }

       const style = block.style || 'normal'
       if (style === 'h2') out.push(`<h2>${inner}</h2>`)
       else if (style === 'h3') out.push(`<h3>${inner}</h3>`)
       else if (style === 'h4') out.push(`<h4>${inner}</h4>`)
       else if (style === 'blockquote') out.push(`<blockquote>${inner}</blockquote>`)
       else out.push(`<p>${inner}</p>`)
     })

     flushList()
     return out.join('\n')
   }

   export function showLoading(el, msg = 'Loading...') {
     el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-faint);font-family:var(--font-ui);font-size:0.75rem;letter-spacing:0.1em;">${msg}</div>`
   }
    
   export function showError(el, msg = 'Content unavailable.') {
     el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-faint);font-family:var(--font-ui);font-size:0.75rem;">${msg}</div>`
   }