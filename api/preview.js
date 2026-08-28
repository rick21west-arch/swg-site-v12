import { setPreviewCookies, timingSafeEqual } from './_lib/preview.js';

// Slugs are hyphenated lowercase segments (matches how Porch story slugs
// are generated in Studio) — validating the shape means the slug can go
// straight into the redirect path with no risk of an open redirect.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(res) {
  // Same response whether the secret was wrong, the slug was malformed, or
  // the secret env var isn't configured — a 404 gives an attacker nothing
  // to distinguish "bad secret" from "route doesn't exist."
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(404).send('Not found');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res);

  const secret = process.env.SANITY_PREVIEW_SECRET;
  const providedSecret = req.query && req.query.secret;
  const slug = req.query && req.query.slug;

  if (!secret) {
    console.error('SANITY_PREVIEW_SECRET is not configured');
    return fail(res);
  }
  if (typeof providedSecret !== 'string' || !timingSafeEqual(providedSecret, secret)) {
    return fail(res);
  }
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) {
    return fail(res);
  }

  setPreviewCookies(res, secret);
  res.setHeader('Location', `/the-porch/${slug}/`);
  return res.status(302).end();
}
