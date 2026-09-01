import { createClient } from '@sanity/client';
import { isValidPreviewRequest } from './_lib/preview.js';

// Single-document preview endpoint for one writer by slug — exact mirror
// of api/preview-video.js, deliberately kept separate from
// api/preview-writers.js (the listing page's own endpoint).
const PROJECT_ID = 'fe6l0kiy';
const DATASET = 'production';
const API_VERSION = '2024-01-01';
const STUDIO_URL = 'https://swg-studio.sanity.studio';

const FIELDS = `characterName, characterDescriptor, realName,
        writerBio, characterBio, displayOrder, "slug": slug.current,
        "characterPhotoUrl": characterPhoto.asset->url,
        "characterPhotoHotspot": characterPhoto.hotspot,
        "avatarPhotoUrl": avatarPhoto.asset->url,
        links`;

export default async function handler(req, res) {
  if (req.method !== 'GET' || !isValidPreviewRequest(req)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('Not found');
  }

  const slug = req.query && req.query.slug;
  if (typeof slug !== 'string' || !slug) {
    return res.status(400).json({ error: 'Missing slug' });
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
    const result = await client.fetch(
      `*[_type == "writer" && slug.current == $slug][0] {${FIELDS}}`,
      { slug }
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ result });
  } catch (err) {
    console.error('Preview draft fetch error:', err);
    return res.status(500).json({ error: 'Preview fetch failed' });
  }
}
