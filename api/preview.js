import { createClient } from '@sanity/client';
import { validatePreviewUrl } from '@sanity/preview-url-secret';
import { withoutSecretSearchParams } from '@sanity/preview-url-secret/without-secret-search-params';
import { setPreviewCookies, timingSafeEqual } from './_lib/preview.js';

const PROJECT_ID = 'fe6l0kiy';
const DATASET = 'production';

// Slugs are hyphenated lowercase segments (matches how Porch story slugs
// are generated in Studio) — validating the shape means the slug can go
// straight into the redirect path with no risk of an open redirect.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PORCH_PATH_PATTERN = /^\/the-porch\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;

function fail(res) {
  // Same response whether the secret was wrong, expired, or missing, the
  // path was malformed, or an env var isn't configured — a 404 gives an
  // attacker nothing to distinguish "bad secret" from "route doesn't exist."
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(404).send('Not found');
}

function fullRequestUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}${req.url}`;
}

// Manual/tested path — visit ?secret=<SANITY_PREVIEW_SECRET>&slug=<slug>
// directly. Unchanged since the original build: a fixed server-side secret,
// checked with a constant-time comparison. Kept alongside the Presentation
// Tool path below for direct testing and for sharing a preview link with
// someone who doesn't have Studio access.
function resolveManualRedirect(req, secret) {
  const providedSecret = req.query && req.query.secret;
  if (typeof providedSecret !== 'string' || !timingSafeEqual(providedSecret, secret)) {
    return null;
  }
  const slug = req.query && req.query.slug;
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) return null;
  return `/the-porch/${slug}/`;
}

// Presentation Tool path — Sanity's own supported mechanism
// (@sanity/preview-url-secret). The Studio generates a short-lived,
// cryptographically random secret per preview session, stores it as a
// draft document in the dataset, and appends it to this URL itself as
// ?sanity-preview-secret=. validatePreviewUrl checks that document exists
// and hasn't expired (secrets are TTL'd to one hour). Nothing static or
// long-lived is involved, and nothing here ever ships to the Studio's
// built JS bundle — nothing is baked into Studio config any more, this
// endpoint is just a plain path the Presentation Tool navigates to and
// appends its own params to.
async function resolvePresentationToolRedirect(req) {
  const token = process.env.SANITY_PREVIEW_TOKEN;
  if (!token) {
    console.error('SANITY_PREVIEW_TOKEN is not configured');
    return null;
  }
  const client = createClient({
    projectId: PROJECT_ID,
    dataset: DATASET,
    apiVersion: '2024-01-01',
    useCdn: false,
    token,
  });

  const requestUrl = fullRequestUrl(req);
  const { isValid, redirectTo } = await validatePreviewUrl(client, requestUrl);
  if (!isValid) return null;

  // No document selected yet (Presentation Tool's initial load) resolves
  // to "/" — accepted as a harmless redirect target so the tool doesn't
  // retry forever waiting for a Porch-shaped path that isn't coming yet.
  // Draft content itself stays Porch-only regardless: /api/preview-story
  // never looks at this path, only at porchStory documents.
  const cleanPath = redirectTo
    ? withoutSecretSearchParams(new URL(redirectTo, requestUrl)).pathname
    : '/';
  if (cleanPath !== '/' && !PORCH_PATH_PATTERN.test(cleanPath)) return null;
  return cleanPath;
}

export default async function handler(req, res) {
  // TEMPORARY diagnostic logging — root-causing the "Unable to connect"
  // banner in Presentation Tool (2026-08-29). Remove once resolved.
  console.log('PREVIEW_DEBUG /api/preview', {
    method: req.method,
    url: req.url,
    'sec-fetch-dest': req.headers['sec-fetch-dest'],
    'sec-fetch-site': req.headers['sec-fetch-site'],
    'sec-fetch-mode': req.headers['sec-fetch-mode'],
    referer: req.headers['referer'],
    'user-agent': req.headers['user-agent'],
  });

  if (req.method !== 'GET') return fail(res);

  const secret = process.env.SANITY_PREVIEW_SECRET;
  if (!secret) {
    console.error('SANITY_PREVIEW_SECRET is not configured');
    return fail(res);
  }

  const hasManualSecret = typeof (req.query && req.query.secret) === 'string';
  let redirectPath;
  try {
    redirectPath = hasManualSecret
      ? resolveManualRedirect(req, secret)
      : await resolvePresentationToolRedirect(req);
  } catch (err) {
    console.error('Preview validation error:', err);
    return fail(res);
  }

  if (!redirectPath) return fail(res);

  // Either path lands here having proven itself independently; from this
  // point on the cookie set is identical regardless of which one fired,
  // so everything downstream (api/preview-story.js, the story page's own
  // cookie check) is completely unaware anything changed upstream.
  console.log('PREVIEW_DEBUG /api/preview redirecting', { redirectPath, hasManualSecret });
  setPreviewCookies(req, res, secret);
  res.setHeader('Location', redirectPath);
  return res.status(302).end();
}
