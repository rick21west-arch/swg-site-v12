# SWG Project Log

Running record of decisions, thinking-in-progress, and open threads that don't belong in `CLAUDE.md` (technical/operational instructions) but shouldn't be lost either. Newest entries at the top. Each entry is dated. Anything marked **Open** is not a decision — treat it as where the thinking stood, not as settled ground.

Read this at the start of any SWG session, same as `CLAUDE.md`.

---

## 2026-08-28 (8)

Rotated `SANITY_PREVIEW_SECRET` — the old value had been exposed in Studio's build output before the previous session's `@sanity/preview-url-secret` fix, so it was due for rotation on general hygiene grounds (flagged, not acted on, last session). New 256-bit value set in Vercel; the old one no longer works anywhere. Confirmed directly, not assumed, that env var changes don't take effect until a new deployment: right after updating the Vercel value, the live site still accepted the old secret and rejected the new one, then flipped the other way immediately after a fresh `vercel deploy --prod`. The Presentation Tool's own separate mechanism (Sanity's per-session secret, `@sanity/preview-url-secret`) is untouched by this — verified fresh via Vercel's logs (enable→302, preview-story→200) after the rotation, same pattern as before.

## 2026-08-28 (7)

Replaced the static preview secret baked into Studio's config with Sanity's own `@sanity/preview-url-secret` mechanism — that secret was ending up in Studio's public built JS bundle, which is exactly the pattern Sanity's docs warn against. Studio's `presentationTool` config no longer embeds anything; the Presentation Tool generates its own short-lived, per-session secret internally and `/api/preview` (site repo) validates it against the dataset using the library, reusing the same `SANITY_PREVIEW_TOKEN` already used for draft-fetching (no new token needed — it already has the read access this requires). Added `@sanity/client` and `@sanity/preview-url-secret` as real dependencies — first `package.json` this site repo has ever had, scoped to the `/api` serverless functions only, no effect on the static frontend's no-build-step design. The original manual `?secret=&slug=` path (the fixed server-side `SANITY_PREVIEW_SECRET`) still works unchanged, for direct testing and for sharing a preview link with someone outside Studio.

**Real finding while re-testing, not assumed:** Presentation Tool's actual enable request is a genuine cross-site iframe navigation, which makes the existing Partitioned-cookie logic (built last time, unchanged this time) actually kick in — meaning a session activated through Presentation Tool is invisible to a separate top-level browser tab by design (CHIPS partitioning, correct browser behavior). That broke the cross-tab verification trick used last round. Verified the real mechanism instead through Vercel's function logs (enable→302 immediately followed by preview-story→200) and by hitting `/api/preview-story` directly with the matching cookie value, which returned the actual draft content (`_originalId` confirms it's the draft). The always-available manual `?secret=&slug=` path — a normal top-level navigation, never partitioned — was used to re-verify the normal-visitor and exit-preview cases in a real browser the same way as before.

**Bundle inspection, the specific new check asked for:** pulled the actual deployed JS (both the local pre-upload build and the live-served file from swg-studio.sanity.studio — byte-identical) and grepped it directly. The config's `previewMode` shows up as literally `{enable:\`/api/preview\`,disable:\`/api/exit-preview\`}` — a bare path, nothing appended. Zero occurrences anywhere in the entire built output of the old secret value, the env var name, or even the word "secret" in any form.

**Not done, flagged rather than assumed:** the old static `SANITY_PREVIEW_SECRET` value was genuinely present in the Studio bundle before this fix (visible to anyone with Studio access, not the public internet) — it still works today via the manual path, unrotated. Rotating it is a reasonable hardening step but changes something Rick may already be relying on, so it wasn't done without asking.

## 2026-08-28 (6)

Sanity's Presentation Tool wired into the Studio repo (`southern-writers-guild`), scoped to porchStory only. Reused the existing `/api/preview` and `/api/exit-preview` endpoints rather than adopting Sanity's own `@sanity/preview-url-secret` handshake — Presentation Tool generates its own per-session secret and there's no supported way to make it send a chosen one instead, so the Studio config bakes the existing static secret directly into the enable URL (`SANITY_STUDIO_PREVIEW_SECRET`, in the Studio's local, gitignored `.env.local`, never committed — same "never commit a key" rule as the site's env vars) and ignores whatever secret Presentation Tool appends on its own. Added a `resolve.locations`/`resolve.mainDocuments` pair in `sanity.config.js` mapping `porchStory` to `/the-porch/{slug}/`.

Two real bugs found and fixed while testing this against the live embed, not just the manual `?secret=&slug=` flow from the original preview build:
- The preview cookies were `SameSite=Lax`, which is silently dropped on a cross-site iframe load (Presentation Tool embeds the site in an iframe from `sanity.io` — not a top-level navigation, so Lax's usual top-level-navigation exception doesn't apply). Switched to `SameSite=None; Secure`, with Safari's CHIPS `Partitioned` attribute added only when the request actually looks like it's coming from that iframe (`sec-fetch-dest`/`sec-fetch-site` headers) — same pattern Sanity's own docs use.
- `/api/preview` 404'd on Presentation Tool's very first call (no document selected yet, pathname `/`), which isn't a Porch story path — and Presentation Tool retries the enable call in a loop when it fails, which hung the whole preview pane before an editor ever picked anything. Now `/` is accepted as a valid, harmless redirect target alongside `/the-porch/{slug}/`; the actual draft-content route (`/api/preview-story`) still only ever serves `porchStory` documents regardless, so this doesn't widen what's actually previewable.

Tested for real, not just by reading code: opened the Studio in a real logged-in Chrome session, selected Gracelets via Structure's "Used on 2 pages" link (confirmed the resolver's output directly — `/the-porch/gracelets/`), watched the address bar inside Presentation resolve to the real live URL with real rendered content behind it. Patched the draft title without publishing, and — since Presentation's own click-to-edit connection never established (expected: `@sanity/visual-editing` overlays were never installed, out of scope here, and its absence surfaces as a permanent "Unable to connect" banner over the iframe that made screenshotting the pane itself unreliable) — confirmed the edit landed by opening the exact resolved URL in a second tab in the *same* browser: it showed the unpublished title. A `curl` with no cookie against the same URL, and a fresh visit after `/api/exit-preview`, both still showed the real published title. Test draft discarded afterward.

**Open, not decided:** click-to-edit overlays (`@sanity/visual-editing`, stega encoding) were not built — this task was the enable/disable/resolver wiring only. That's the next piece if full visual editing (Step 9) gets prioritized.

## 2026-08-28 (5)

Private preview mode built and tested, scoped to Porch stories only — the test case ahead of extending it elsewhere. `/api/preview` (validates a secret, sets a cookie, redirects to the story), `/api/exit-preview` (clears it), `/api/preview-story` (server-side only, fetches the draft with a privileged token when the cookie checks out). Two new Vercel env vars, both server-side only, same pattern as `KIT_API_KEY`: `SANITY_PREVIEW_SECRET` (the activation secret) and `SANITY_PREVIEW_TOKEN` (a Sanity "viewer" role robot token — read access, drafts included, nothing else). Tested end to end: edited a real story's draft without publishing, confirmed the draft text appeared only in the browser session that had visited `/api/preview` with the right secret, confirmed a cookie-less request (and a request with a forged cookie) got a plain 404 with no hint, confirmed `/api/exit-preview` fully reverted the session to published content.

**Naming note for later:** `SANITY_PREVIEW_TOKEN` is scoped to this narrow feature. If Step 9 (real visual editing, per the Going Pro plan) gets built later using Sanity's official `@sanity/preview-url-secret` pattern, that work will likely want its own token following Sanity's own convention (`SANITY_API_READ_TOKEN`) and a proper Presentation Tool handshake — this token and cookie scheme is a simpler hand-rolled version built for this one test case, not meant to be the permanent mechanism Step 9 builds on. Revisit naming then rather than assuming reuse.

## 2026-08-28 (4)

Real founder addresses confirmed: beau@ (Rick), hank@ (MJ), gray@ (Grace) — using pen names, not real names, consistent with the Guild's naming convention. Mailboxes exist; Google Accounts for these three still need creating, one-time process each, verified against current Google signup flow. jp@ confirmed as the anchor identity for both the YouTube Brand Account and the shared Guild Drive — one identity, multiple jobs, by design.

## 2026-08-28 (3)

Step 8 phases 1-2 complete. Videos and Featured Fiction pages rewired to existing Sanity fetch functions (no new schema). New siteSettings singleton added (contactEmail field), House page's two hardcoded addresses now pull from one Sanity document, hardcoded value kept as fallback if the fetch fails. Side effect: the guildVideo showOnHomepage toggle, which existed in a prior unpushed commit, went live in the same deploy — homepage "Right Now" section now actually includes Guild Videos as designed, closing a gap that had existed silently. Phase 3 (Writers page + subpages — needs a new schema type, paused on a real design decision, not started) and Phase 4 (House mission/beliefs copy, guidelines page — low priority) remain open.

## 2026-08-28 (2)

Step 0 partially cleared: LLC formed and confirmed real; business bank account still under evaluation, not final. This unblocks anything requiring the LLC to legally exist (Step 3 named explicitly in the plan), but not anything requiring finalized bank details. Step 4 confirmed not yet in place — addresses decided, not provisioned in IONOS, no Google Accounts created. Decision made this session: proceed with Step 4 work now rather than wait, since it was already sanctioned as quiet prep independent of Step 0's exact status.

## 2026-08-28

Step 0 (LLC + bank account) confirmed cleared by Rick. Step 4 (founder email identities) confirmed not yet in place — this is now the live prerequisite before any real Creator Workstation build, since its "your account" tiles are literally these accounts. — Correction, same day: this entry overstated Step 0 as fully cleared. See the "2026-08-28 (2)" entry above for the accurate status: LLC formed and confirmed, business bank account still under evaluation, not final.

---

## 2026-08-19 — Session close-out

Cowork (this kind of session) and Claude Code are separate, isolated environments by design, not a bug — Cowork's container has no local credentials, which is why a git push needs a Claude Code handoff rather than happening directly. This repo, read by both, is the real shared channel between them; there's no live link beyond it.

**Checkpoint for any future Claude Code session:** should show folder `swg-site`, branch `main`, before anything gets typed. A different project name showing up there — "rick-west-site" did, this session — is the signal to stop before proceeding.

**Unresolved, worth a real look if it comes up again:** what "rick-west-site" actually is. Confirmed as a genuinely separate project from SWG (its real GitHub remote is `swg-site-v12`, not that name), and there are files named `rick-west*.jsx` inside the `primalbeet` folder — likely Rick's personal site project. Not confirmed: whether anything from a past session's handoff accidentally touched it instead of SWG.

Commit `019a856` (this log's creation, the CLAUDE.md continuity rule, and `the-commitment-behind-the-bird.md`) is confirmed pushed to `swg-site-v12` on GitHub — verified directly via Claude Code, not assumed.

No separate summary document needed for the next thread. Reading this file and `CLAUDE.md` — automatic once this folder is connected — covers it.

## 2026-08-19

**Continuity process, decided.** This file exists because relying on a Cowork project's cached/uploaded files as memory failed — that cache goes stale (last synced 2026-08-11, missed everything built after). This repo, connected live, is the only source treated as current. Going forward: settled decisions and standing rules go in `CLAUDE.md`; everything else that matters but isn't settled goes here, written without being asked, at natural stopping points in a conversation — not something Rick has to remember to request.

**"It's All About the Bird" — reader-facing essay, done.** Final version written by Rick, saved as `the-commitment-behind-the-bird.md` in that session's outputs (not yet in this repo — worth moving in if it's going on the site). Governing metaphor: harbor vs. open sea, sailing a self-built corsair, not a warship, not stolen. The unholy trio (all three founders) as the crew. Thesis: ownership isn't the point, it's the price — what it buys is freedom of shape, since every platform-of-one-shape (Substack, YouTube) forces whatever you make into its own template regardless of fit. Jean-Paul closes the piece on the bow of the ship. Deliberately excludes: the Porch/Kitchen Table split, any specific real-world example (Rick's personal Albania piece was ruled out as off-topic for a Guild piece), and any CTA — the CTA lives elsewhere on the page, in a different format, not in the essay text.

**Audio pages — Open, exploratory only, nothing decided.** Partners asked for a page each (three individuals) plus one group page focused on audio. Rationale for the fourth/group page, resolved during discussion: it's for ensemble "skits" — Garrison Keillor-style pieces performed by all three together, which have no natural home on any individual's page. Structural lean, not decided: one Sanity-driven template (`/listen/[persona]`) rather than four hand-built pages, since each partner will self-serve edit their own entry directly in Sanity — Rick is not the bottleneck, each partner touches Sanity at most twice (their own page, and the group page if voted in). QR codes framed as a handoff, not a doorway — the scan should get someone listening in one tap, not route them through navigation. Real podcast distribution (Apple Podcasts, Spotify) needs a dedicated podcast host for RSS; a page with an embedded player is not the same thing as podcast distribution. Video hosting, if it happens: YouTube (free, but subject to advertiser-friendly content policy and algorithmic reach limits — a real concern given Rick's content doesn't always stay in "approved" territory on his personal work, though the Guild's own material is expected to stay within YouTube's guidelines) versus Cloudflare Stream/Mux (paid, no content-policy layer, full control). Nothing built. Nothing scheduled.

**Grace, factual correction for future reference.** She appears on camera regularly — voice and face are not new exposure. What she actually protects: legal name, street address, city of residence. Don't assume audio/video appearances are a privacy risk for her without cause.

**Vercel tile labeled "Shared login" in the workstation concept preview — flagged, not resolved.** Earlier reasoning had Vercel in the same bucket as GitHub/Sanity/Canva (individual Google sign-in, no vault needed). Worth checking whether that's a real distinction (e.g., not on a Team plan) or the mockup just hasn't caught up to the plan.

---
