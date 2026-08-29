// TEMPORARY — root-causing the "Unable to connect" banner in Presentation
// Tool (2026-08-29). Logs whatever the browser reports about its own cookie
// state at page-load time, from inside the actual embedded iframe. Remove
// this file once resolved.
export default function handler(req, res) {
  console.log('PREVIEW_DEBUG client report', {
    cookies: req.query && req.query.cookies,
    isPreviewing: req.query && req.query.isPreviewing,
    href: req.query && req.query.href,
    referrer: req.query && req.query.referrer,
    'sec-fetch-dest': req.headers['sec-fetch-dest'],
    'sec-fetch-site': req.headers['sec-fetch-site'],
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(204).end();
}
