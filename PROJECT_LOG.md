# SWG Project Log

Running record of decisions, thinking-in-progress, and open threads that don't belong in `CLAUDE.md` (technical/operational instructions) but shouldn't be lost either. Newest entries at the top. Each entry is dated. Anything marked **Open** is not a decision — treat it as where the thinking stood, not as settled ground.

Read this at the start of any SWG session, same as `CLAUDE.md`.

---

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
