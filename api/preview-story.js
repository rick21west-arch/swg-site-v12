import { createClient } from '@sanity/client';
import { isValidPreviewRequest } from './_lib/preview.js';

// Scoped to Porch stories only — this is the test case before preview
// extends to any other document type.
const PROJECT_ID = 'fe6l0kiy';
const DATASET = 'production';
const API_VERSION = '2024-01-01';

// Single default-workspace Studio (sanity.config.js: name: 'default', no
// basePath) — the client omits the workspace segment from intent URLs in
// that case, so this plain origin is a complete studioUrl on its own.
const STUDIO_URL = 'https://swg-studio.sanity.studio';

export default async function handler(req, res) {
  // TEMPORARY diagnostic logging — root-causing the "Unable to connect"
  // banner in Presentation Tool (2026-08-29). Remove once resolved.
  console.log('PREVIEW_DEBUG /api/preview-story invoked', {
    method: req.method,
    hasCookieHeader: !!req.headers.cookie,
    cookieHeaderRaw: req.headers.cookie,
    valid: isValidPreviewRequest(req),
  });

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

  // The real @sanity/client, not a raw fetch() — this is what lets the
  // response carry stega encoding. Drafts perspective + a privileged
  // server-side token so unpublished edits are visible; stega is enabled
  // only on this client, which only ever runs after isValidPreviewRequest
  // has already checked the HttpOnly preview cookie above, so an encoded
  // response can never reach a request that didn't already prove it was
  // an active preview session.
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
      `*[_type == "porchStory" && slug.current == $slug][0]`,
      { slug }
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ result });
  } catch (err) {
    console.error('Preview draft fetch error:', err);
    return res.status(500).json({ error: 'Preview fetch failed' });
  }
}
