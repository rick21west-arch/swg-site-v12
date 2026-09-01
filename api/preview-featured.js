import { createClient } from '@sanity/client';
import { isValidPreviewRequest } from './_lib/preview.js';

// Same pattern as api/preview-videos.js, for featuredFiction instead of
// guildVideo. featuredFiction has no slug and no individual page — every
// document resolves to one of two shared listing pages
// (the-work/featured/ shows the 9 most recent featured;
// the-work/featured/archive/ shows everything), so a fixed ?view= enum
// mirrors those two literal queries (fetchFeaturedBooks(9) and
// fetchFeaturedFiction() in js/sanity.js) rather than accepting an
// arbitrary query from the client.
const PROJECT_ID = 'fe6l0kiy';
const DATASET = 'production';
const API_VERSION = '2024-01-01';
const STUDIO_URL = 'https://swg-studio.sanity.studio';

const FIELDS = `title, author, description, status, featuredMonth,
        substackUrl, printUrl, ebookUrl, note, commentary,
        "coverUrl": coverImage.asset->url`;

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
  if (typeof view !== 'string' || !Object.prototype.hasOwnProperty.call(VIEWS, view)) {
    return res.status(400).json({ error: 'Missing or invalid view' });
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
    const result = await client.fetch(VIEWS[view]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ result });
  } catch (err) {
    console.error('Preview draft fetch error:', err);
    return res.status(500).json({ error: 'Preview fetch failed' });
  }
}
