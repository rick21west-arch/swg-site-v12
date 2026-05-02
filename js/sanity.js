/* ============================================================
   Southern Writers Guild — Sanity CMS fetch layer
   js/sanity.js

   ONE THING TO SET: paste your Sanity Project ID below.
   Get it from: https://sanity.io/manage → your project → API
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
    const ref   = doc.thumbnail.asset._ref           // e.g. image-abc123-1024x768-png
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
    `*[_type == "featuredFiction"] | order(
      status == "current" desc,
      status == "coming" desc,
      status == "past" desc
    )`
  )
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
