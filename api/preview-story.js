import { isValidPreviewRequest } from './_lib/preview.js';

// Scoped to Porch stories only — this is the test case before preview
// extends to any other document type.
const PROJECT_ID = 'fe6l0kiy';
const DATASET = 'production';
const API_VERSION = '2024-01-01';

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

  const query = `*[_type == "porchStory" && slug.current == $slug][0]`;
  const params = new URLSearchParams({
    query,
    perspective: 'drafts',
    '$slug': JSON.stringify(slug),
  });
  const url = `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?${params.toString()}`;

  try {
    const sanityRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!sanityRes.ok) {
      console.error('Preview draft fetch failed:', sanityRes.status, await sanityRes.text());
      return res.status(502).json({ error: 'Preview fetch failed' });
    }

    const { result } = await sanityRes.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ result });
  } catch (err) {
    console.error('Preview draft fetch error:', err);
    return res.status(500).json({ error: 'Preview fetch failed' });
  }
}
