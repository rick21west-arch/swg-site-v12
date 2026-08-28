import { clearPreviewCookies } from './_lib/preview.js';

export default async function handler(req, res) {
  clearPreviewCookies(res);
  res.setHeader('Location', '/');
  return res.status(302).end();
}
