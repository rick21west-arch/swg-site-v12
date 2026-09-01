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
const EVENT_PATH_PATTERN = /^\/events\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;
// featuredFiction and guildVideo have no slug field and no individual page —
// every document of either type resolves to one shared listing page, so
// these are fixed paths rather than a slug pattern. Trailing slash is
// optional here too, same as every other pattern in this function — an
// exact-string check (the original version of this) silently rejected
// whichever form Presentation Tool happened to ask for without one,
// which meant preview mode never activated for these two pages at all,
// with no visible error anywhere.
const FEATURED_PATH_PATTERN = /^\/the-work\/featured\/?$/;
const VIDEOS_PATH_PATTERN = /^\/the-work\/videos\/?$/;
const VIDEO_PATH_PATTERN = /^\/the-work\/videos\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;
const FEATURED_ARCHIVE_PATH_PATTERN = /^\/the-work\/featured\/archive\/?$/;
const WRITERS_PATH_PATTERN = /^\/writers\/?$/;
const WRITER_PATH_PATTERN = /^\/writers\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;
const HOUSE_PATH_PATTERN = /^\/the-house\/?$/;
const HOUSE_GUIDELINES_PATH_PATTERN = /^\/the-house\/guidelines\/?$/;

function isAllowedRedirectPath(path) {
  return (
    path === '/' ||
    PORCH_PATH_PATTERN.test(path) ||
    EVENT_PATH_PATTERN.test(path) ||
    FEATURED_PATH_PATTERN.test(path) ||
    FEATURED_ARCHIVE_PATH_PATTERN.test(path) ||
    VIDEOS_PATH_PATTERN.test(path) ||
    VIDEO_PATH_PATTERN.test(path) ||
    WRITERS_PATH_PATTERN.test(path) ||
    WRITER_PATH_PATTERN.test(path) ||
    HOUSE_PATH_PATTERN.test(path) ||
    HOUSE_GUIDELINES_PATH_PATTERN.test(path)
  );
}

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
//
// type= defaults to porchStory (the original, still-bare ?secret=&slug=
// links keep working unchanged). event needs a slug the same way; featured
// and videos have no slug — they always resolve to their one shared listing
// page.
function resolveManualRedirect(req, secret) {
  const providedSecret = req.query && req.query.secret;
  if (typeof providedSecret !== 'string' || !timingSafeEqual(providedSecret, secret)) {
    return null;
  }
  const type = (req.query && req.query.type) || 'porchStory';
  if (type === 'porchStory' || type === 'event') {
    const slug = req.query && req.query.slug;
    if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) return null;
    return type === 'event' ? `/events/${slug}/` : `/the-porch/${slug}/`;
  }
  if (type === 'guildVideo' || type === 'writer') {
    // Both types have an optional slug: with one, resolve to that
    // document's own page; without one, resolve to the shared listing.
    const slug = req.query && req.query.slug;
    if (typeof slug === 'string' && slug) {
      if (!SLUG_PATTERN.test(slug)) return null;
      return type === 'writer' ? `/writers/${slug}/` : `/the-work/videos/${slug}/`;
    }
    return type === 'writer' ? '/writers/' : '/the-work/videos/';
  }
  if (type === 'featuredFiction') return '/the-work/featured/';
  // Singleton, no slug, feeds two pages — always resolves to the primary
  // one; the Submission Guidelines page is reachable from there.
  if (type === 'houseContent') return '/the-house/';
  return null;
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
  if (!isAllowedRedirectPath(cleanPath)) return null;
  return cleanPath;
}

export default async function handler(req, res) {
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
  setPreviewCookies(req, res, secret);
  res.setHeader('Location', redirectPath);
  return res.status(302).end();
}
