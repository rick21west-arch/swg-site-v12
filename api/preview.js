import { setPreviewCookies, timingSafeEqual } from './_lib/preview.js';

// Slugs are hyphenated lowercase segments (matches how Porch story slugs
// are generated in Studio) — validating the shape means the slug can go
// straight into the redirect path with no risk of an open redirect.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PORCH_PATH_PATTERN = /^\/the-porch\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;

function fail(res) {
  // Same response whether the secret was wrong, the path was malformed, or
  // the secret env var isn't configured — a 404 gives an attacker nothing
  // to distinguish "bad secret" from "route doesn't exist."
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(404).send('Not found');
}

// Resolve the redirect target. Manual/tested use passes ?slug=; the
// Presentation Tool instead appends its own ?sanity-preview-pathname=
// (the location our Studio resolver mapped the selected document to).
// Both are validated against the same Porch-only shape before use.
function resolveRedirectPath(req) {
  const slug = req.query && req.query.slug;
  if (typeof slug === 'string' && SLUG_PATTERN.test(slug)) {
    return `/the-porch/${slug}/`;
  }
  const pathname = req.query && req.query['sanity-preview-pathname'];
  if (typeof pathname === 'string' && PORCH_PATH_PATTERN.test(pathname)) {
    return pathname;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res);

  const secret = process.env.SANITY_PREVIEW_SECRET;
  const providedSecret = req.query && req.query.secret;

  if (!secret) {
    console.error('SANITY_PREVIEW_SECRET is not configured');
    return fail(res);
  }
  if (typeof providedSecret !== 'string' || !timingSafeEqual(providedSecret, secret)) {
    return fail(res);
  }

  const redirectPath = resolveRedirectPath(req);
  if (!redirectPath) return fail(res);

  setPreviewCookies(req, res, secret);
  res.setHeader('Location', redirectPath);
  return res.status(302).end();
}
