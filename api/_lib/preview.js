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

export function setPreviewCookies(res, secret) {
  const value = previewCookieValue(secret);
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`,
    `${HINT_COOKIE_NAME}=1; Path=/; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`,
  ]);
}

export function clearPreviewCookies(res) {
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    `${HINT_COOKIE_NAME}=; Path=/; Secure; SameSite=Lax; Max-Age=0`,
  ]);
}
