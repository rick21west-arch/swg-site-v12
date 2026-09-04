import { createClient } from '@sanity/client';
import { isValidPreviewRequest } from './_lib/preview.js';

// Same pattern as api/preview-videos.js, for featuredFiction instead of
// guildVideo. Three views: main and all are the two shared listing pages
// (the-work/featured/ shows the 9 most recent featured;
// the-work/featured/archive/ shows everything), mirroring the literal
// queries fetchFeaturedBooks(9) and fetchFeaturedFiction() in js/sanity.js.
// byslug is the individual book page (the-work/featured/book) — added
// when featuredFiction gained a real slug field and each book its own
// page; kept on this same shared endpoint rather than a new function.
const PROJECT_ID = 'fe6l0kiy';
const DATASET = 'production';
const API_VERSION = '2024-01-01';
const STUDIO_URL = 'https://swg-studio.sanity.studio';

const FIELDS = `title, author, description, status, featuredMonth,
        substackUrl, printUrl, ebookUrl, note, commentary,
        "coverUrl": coverImage.asset->url,
        "slug": slug.current`;

const VIEWS = {
  main: `*[_type == "featuredFiction" && (featured == true || !defined(featured))] | order(_createdAt desc) [0...9] {${FIELDS}}`,
  all: `*[_type == "featuredFiction"] | order(_createdAt desc) {${FIELDS}}`,
};

export default async function handler(req, res) {
  if (req.method !== 'GET' || !isValidPreviewRequest(req)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('Not found');
  }

  const view = req.query && req.query.view;
  const isByslug = view === 'byslug';
  if (typeof view !== 'string' || (!isByslug && !Object.prototype.hasOwnProperty.call(VIEWS, view))) {
    return res.status(400).json({ error: 'Missing or invalid view' });
  }

  let slug;
  if (isByslug) {
    slug = req.query && req.query.slug;
    if (typeof slug !== 'string' || !slug) {
      return res.status(400).json({ error: 'Missing slug' });
    }
  }

  const token = process.env.SANITY_PREVIEW_TOKEN;
  if (!token) {
    console.error('SANITY_PREVIEW_TOKEN is not configured');
    return res.status(500).json({ error: 'Preview unavailable' });
  }

  const client = createClient({
    projectId: PROJECT_ID,
    dataset: DATASET,
    apiVersion: API_VERSION,
    useCdn: false,
    perspective: 'drafts',
    token,
    stega: { enabled: true, studioUrl: STUDIO_URL },
  });

  try {
    const result = isByslug
      ? await client.fetch(`*[_type == "featuredFiction" && slug.current == $slug][0] {${FIELDS}}`, { slug })
      : await client.fetch(VIEWS[view]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ result });
  } catch (err) {
    console.error('Preview draft fetch error:', err);
    return res.status(500).json({ error: 'Preview fetch failed' });
  }
}
