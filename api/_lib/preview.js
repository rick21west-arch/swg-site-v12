import crypto from 'crypto';

// Two cookies, one job each:
// - COOKIE_NAME: the real credential. HttpOnly so page JS (and any XSS) can
//   never read it; the browser still sends it automatically on same-origin
//   fetches. Its value is an HMAC of a fixed message keyed by the preview
//   secret, not the secret itself, so a leaked cookie value can't be used
//   to derive the secret or mint new cookies.
// - HINT_COOKIE_NAME: not secret, not verified anywhere. Its only job is
//   to be readable by page JS so a page can decide whether to attempt the
//   preview fetch at all. The server-side check on COOKIE_NAME is the only
//   real gate — a forged hint cookie with no matching real cookie just
//   causes one extra fetch that fails closed.
export const COOKIE_NAME = 'swg_preview';
export const HINT_COOKIE_NAME = 'swg_preview_active';

const HMAC_MESSAGE = 'swg-porch-preview';
const MAX_AGE_SECONDS = 3600;

export function previewCookieValue(secret) {
  return crypto.createHmac('sha256', secret).update(HMAC_MESSAGE).digest('hex');
}

export function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

export function isValidPreviewRequest(req) {
  const secret = process.env.SANITY_PREVIEW_SECRET;
  if (!secret) return false;
  const cookies = parseCookies(req.headers.cookie);
  const value = cookies[COOKIE_NAME];
  if (!value) return false;
  return timingSafeEqual(value, previewCookieValue(secret));
}

// SameSite=None (not Lax) because the Presentation Tool loads the site in a
// cross-site iframe — a sub-frame load, not a top-level navigation, so Lax
// cookies are dropped by the browser there even though they worked fine for
// direct top-level testing. None is a strict superset of when Lax is sent,
// so this doesn't change behavior for the direct/no-Studio flow.
// Safari 18.4+ additionally requires the CHIPS "Partitioned" attribute for
// any cookie set from a cross-site iframe, or it silently drops it — added
// only when the request actually looks like it came from that iframe, so a
// normal top-level request is unaffected.
function isCrossSiteIframeRequest(req) {
  return (
    req.headers['sec-fetch-dest'] === 'iframe' &&
    req.headers['sec-fetch-site'] === 'cross-site'
  );
}

export function setPreviewCookies(req, res, secret) {
  const value = previewCookieValue(secret);
  const partitioned = isCrossSiteIframeRequest(req) ? '; Partitioned' : '';
  const cookies = [
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${MAX_AGE_SECONDS}${partitioned}`,
    `${HINT_COOKIE_NAME}=1; Path=/; Secure; SameSite=None; Max-Age=${MAX_AGE_SECONDS}${partitioned}`,
  ];
  // TEMPORARY diagnostic logging — root-causing the "Unable to connect"
  // banner in Presentation Tool (2026-08-29). Remove once resolved.
  console.log('PREVIEW_DEBUG setPreviewCookies', { partitionedApplied: !!partitioned, cookies });
  res.setHeader('Set-Cookie', cookies);
}

export function clearPreviewCookies(req, res) {
  const partitioned = isCrossSiteIframeRequest(req) ? '; Partitioned' : '';
  const expired = [
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`,
    `${HINT_COOKIE_NAME}=; Path=/; Secure; SameSite=None; Max-Age=0`,
  ];
  // Clear both the partitioned and unpartitioned variants, since either may
  // have been set depending on how the session started.
  res.setHeader('Set-Cookie', [
    ...expired,
    ...(partitioned ? expired.map((c) => `${c}${partitioned}`) : []),
  ]);
}
