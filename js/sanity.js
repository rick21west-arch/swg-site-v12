/* ============================================================
   Southern Writers Guild — Sanity CMS fetch layer
   js/sanity.js
   ============================================================ */
 
   const SANITY_PROJECT_ID = 'fe6l0kiy'
   const SANITY_DATASET    = 'production'
   const SANITY_API_VER    = '2024-01-01'
    
   /* Build the CDN fetch URL for a GROQ query */
   function sanityUrl(query) {
     const base = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v${SANITY_API_VER}/data/query/${SANITY_DATASET}`
     return `${base}?query=${encodeURIComponent(query)}`
   }
    
   /* Resolve thumbnail — prefers Sanity-hosted image, falls back to URL string */
   export function thumbSrc(doc, width = 800) {
     if (doc.thumbnail?.asset?._ref) {
       const ref   = doc.thumbnail.asset._ref
       const parts = ref.replace('image-', '').split('-')
       const ext   = parts.pop()
       const id    = parts.join('-')
       return `https://cdn.sanity.io/images/${SANITY_PROJECT_ID}/${SANITY_DATASET}/${id}.${ext}?w=${width}&auto=format`
     }
     return doc.thumbnailUrl || null
   }
    
   /* Generic fetch helper */
   export async function sanityFetch(query) {
     const res = await fetch(sanityUrl(query))
     if (!res.ok) throw new Error(`Sanity fetch failed: ${res.status}`)
     const { result } = await res.json()
     return result
   }
    
   /* ── Porch stories ─────────────────────────────────────────── */
    
   export async function fetchPorchStories(limit = 9) {
     return sanityFetch(
       `*[_type == "porchStory"] | order(publishedAt desc) [0...${limit}]`
     )
   }
    
   export async function fetchAllPorchStories() {
     return sanityFetch(
       `*[_type == "porchStory"] | order(publishedAt desc)`
     )
   }
    
   /* ── Featured fiction ──────────────────────────────────────── */
    
   export async function fetchFeaturedFiction() {
     return sanityFetch(
       `*[_type == "featuredFiction"] | order(_createdAt desc) {
         title, author, description, status, featuredMonth,
         substackUrl, printUrl, ebookUrl, note,
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
           <span class="card-label" style="color:var(--text-faint);margin:0;">All featured works</span>
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
    
   /* ── Card renderers ─────────────────────────────────────────── */
    
   export function renderPorchCard(story) {
     const thumb = thumbSrc(story)
     const img = thumb
       ? `<img src="${thumb}" alt="${esc(story.title)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;margin-bottom:0.75rem;">`
       : `<div style="aspect-ratio:16/9;background:var(--bg-3);display:flex;align-items:center;justify-content:center;margin-bottom:0.75rem;">
            <span style="font-family:var(--font-serif);font-style:italic;color:var(--text-faint);font-size:0.95rem;text-align:center;padding:1rem;">${esc(story.excerpt || story.title)}</span>
          </div>`
     return `
       <a href="${esc(story.substackUrl)}" target="_blank" rel="noopener" class="card" style="display:block;text-decoration:none;">
         ${img}
         <span class="card-label">${esc(formatDate(story.publishedAt))} &nbsp;·&nbsp; ${esc(story.authors || '')}</span>
         <h2 class="card-title card-title--sm">${esc(story.title)}</h2>
         ${story.excerpt ? `<p class="card-body" style="font-size:0.9rem;">${esc(story.excerpt)}</p>` : ''}
       </a>`
   }
    
   export function renderVideoCard(video, size = 'large') {
     const thumb = thumbSrc(video)
     const btnSize = size === 'large' ? 56 : 38
     const borderTop = size === 'large' ? 11 : 8
     const borderSide = size === 'large' ? 20 : 14
     const ml = size === 'large' ? 4 : 3
     const playBtn = `
       <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
         <div style="width:${btnSize}px;height:${btnSize}px;border-radius:50%;background:rgba(184,92,56,0.9);display:flex;align-items:center;justify-content:center;">
           <div style="width:0;height:0;border-top:${borderTop}px solid transparent;border-bottom:${borderTop}px solid transparent;border-left:${borderSide}px solid #EDE5D0;margin-left:${ml}px;"></div>
         </div>
       </div>`
     const imgHtml = thumb
       ? `<div style="position:relative;margin-bottom:0.75rem;"><img src="${esc(thumb)}" alt="${esc(video.title)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;">${playBtn}</div>`
       : `<div style="position:relative;margin-bottom:0.75rem;aspect-ratio:16/9;background:var(--bg-3);display:flex;align-items:center;justify-content:center;">${playBtn}</div>`
     const cardClass = size === 'large' ? 'card card--highlight' : 'card card--dim'
     const titleClass = size === 'large' ? 'card-title' : 'card-title card-title--sm'
     return `
       <a href="${esc(video.substackUrl)}" target="_blank" rel="noopener" class="${cardClass}" style="display:block;text-decoration:none;">
         ${imgHtml}
         <span class="card-label">${esc(formatDate(video.publishedAt))} &nbsp;·&nbsp; ${esc(video.participants || '')}</span>
         <h2 class="${titleClass}">${esc(video.title)}</h2>
         ${video.description ? `<p class="card-body">${esc(video.description)}</p>` : ''}
         <p class="card-note" style="margin-top:0.5rem;">${video.duration ? video.duration + ' &nbsp;·&nbsp; ' : ''}Watch on Substack →</p>
       </a>`
   }
    
   /* ── Utilities ─────────────────────────────────────────────── */
    
   function esc(str) {
     if (!str) return ''
     return String(str)
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
   }
    
   function formatDate(dateStr) {
     if (!dateStr) return ''
     const d = new Date(dateStr + 'T12:00:00Z')
     return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
   }
    
   export function showLoading(el, msg = 'Loading...') {
     el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-faint);font-family:var(--font-ui);font-size:0.75rem;letter-spacing:0.1em;">${msg}</div>`
   }
    
   export function showError(el, msg = 'Content unavailable.') {
     el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-faint);font-family:var(--font-ui);font-size:0.75rem;">${msg}</div>`
   }
    