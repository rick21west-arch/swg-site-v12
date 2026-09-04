import { createClient } from '@sanity/client';
import { isValidPreviewRequest } from './_lib/preview.js';

// Consolidates what were three near-identical single-purpose endpoints
// (preview-house.js, preview-home.js, preview-join.js) into one. The
// project hit Vercel's Hobby-plan 12-serverless-function ceiling the
// moment a fourth singleton content type (joinContent) needed its own
// preview route — every singleton here has the exact same shape, fetch
// *[_type == "<type>"][0], no slug, nothing else that ever differed
// between them but the type name. Adding a future singleton type means
// adding it to ALLOWED_TYPES, not a new file/function.
const PROJECT_ID = 'fe6l0kiy';
const DATASET = 'production';
const API_VERSION = '2024-01-01';
const STUDIO_URL = 'https://swg-studio.sanity.studio';

const ALLOWED_TYPES = new Set(['houseContent', 'homeContent', 'joinContent', 'sitePageCopy', 'writersPageSettings']);

export default async function handler(req, res) {
  if (req.method !== 'GET' || !isValidPreviewRequest(req)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('Not found');
  }

  const type = req.query && req.query.type;
  if (typeof type !== 'string' || !ALLOWED_TYPES.has(type)) {
    return res.status(400).json({ error: 'Missing or invalid type' });
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
    // type is validated against ALLOWED_TYPES above, so this is never
    // arbitrary user input reaching the query. writersPageSettings is the
    // only one of these with an image field (trioImage), so it's the only
    // one that needs a projection to dereference the asset URL — every
    // other type is a bare [0], same as before.
    const projection = type === 'writersPageSettings'
      ? `{ ..., "trioImageUrl": trioImage.asset->url, "trioImageHotspot": trioImage.hotspot }`
      : '';
    const result = await client.fetch(`*[_type == "${type}"][0]${projection}`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ result });
  } catch (err) {
    console.error('Preview draft fetch error:', err);
    return res.status(500).json({ error: 'Preview fetch failed' });
  }
}
