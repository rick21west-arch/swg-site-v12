# Southern Writers Guild — working instructions

## Who you're working with

Rick West — co-founder, project owner. Former C-level executive. Not a programmer, and should never be asked to read, interpret, or debug code.

**Communication rules — requirements, not preferences:**

- Diagnose before instructing. State what you have verified and what you are assuming.
- Never send him hunting through a UI. Work out the exact path first, or do it yourself.
- No jargon. "A record," "endpoint," "environment variable," "serverless function" mean nothing to him. Plain language or don't mention it.
- One step at a time. Wait for confirmation before the next.
- Don't say "the whole explanation" / "that's everything." Nothing is ever the whole of something.
- If he flags a possible cause, check it. Do not dismiss it. This has already cost him an entire afternoon.

## Absolute rule

One of the three founders goes by **Gray**, **Grace**, or **Grace Lynn** only. Her legal name must never appear anywhere — code, comments, commit messages, CMS entries, file names, conversation. No exceptions.

Other founders: Rick West (writes as Beau Pritchett IV), MJ Polk (writes as Hank Cotton). Jean-Paul is the Guild's mascot, a taxidermied peacock, played completely straight.

## Repo location trap

Working repo: `C:\Users\Rick\Desktop\EZ\websites\swg-site-v12\swg-site`

A decoy folder exists at `...\swg-site-v12\swg-site-v12` with no git repository in it. If git says "not a git repository," you are in the wrong folder. Do not ask Rick to hunt for it.

## Deploy workflow

Static site, no build step. Vercel watches GitHub and deploys automatically.

- Push to `main` → live on southernwritersguild.com in ~30 seconds.
- Push to any other branch → public preview URL.
- Anything visual goes to a branch first for Rick and Grace to review. Do not merge to `main` without being told.

## Design system

Tokens at the top of `css/swg.css`. Cormorant Garamond (display) + system sans (UI). Do not introduce new fonts or a new palette.

**Known defect — fix pending approval.** Background was lightened from `#0C0B09` to `#3e352c` without adjusting text opacity. Measured WCAG contrast:

| token | ratio | status |
|---|---|---|
| `--text` | 10.20:1 | fine |
| `--text-muted` | 4.09:1 | fails body text (needs 4.5:1) |
| `--text-faint` | 2.13:1 | fails badly |
| `--accent` | 4.15:1 | fails body text |

This is an opacity problem, not a palette problem. Raise alpha values, darken the accent slightly. Keep the warm character. The brief is "readable and navigable," not "redesign."

## Typography decisions (locked)

As of the `typography-pass` branch:

- Body text now uses EB Garamond (`--font-body`) instead of Cormorant Garamond. Cormorant Garamond (`--font-serif`) stays on headings — h1–h4 and every display/hero/title class are set explicitly so they don't inherit the new body face.
- Body copy stays 1.1rem; line-height changed from 1.75 to 1.7.
- Running body copy (the `.prose` sections used on the manifesto, guidelines, and Porch "start here" pages) is capped at `max-width: 66ch` for a readable line length. Not applied to nav, cards, grids, or the hero.

Contrast fix for the four tokens, measured against the `--bg: #3e352c` background:

| token | old value | new value | old ratio | new ratio |
|---|---|---|---|---|
| `--text-muted` | rgba(237,229,208,0.55) | rgba(237,229,208,0.60) | 4.09:1 | 4.57:1 |
| `--text-faint` | rgba(237,229,208,0.28) | rgba(237,229,208,0.42) | 2.13:1 | 3.04:1 |
| `--accent` | #d68449 | #df8d52 | 4.15:1 | 4.61:1 |
| `--accent-light` | #e0955c | #e79f68 | not previously measured | 5.46:1 |

`--text-muted` and `--accent` now pass WCAG AA for body text (4.5:1). `--text-faint` improved from 2.13:1 to 3.04:1 but still falls short of the 4.5:1 body-text threshold — it only clears the 3:1 minimum that applies to large text. `--text-faint` is used for small caption-style text (footer, card notes, filter tabs), so this is an improvement, not a full fix, and should be revisited.

Reason for the change: the background was lightened from `#0C0B09` to `#3e352c` in an earlier pass without adjusting these token values, leaving text hard to read. This raises opacity/darkens the accent to compensate, keeping the same warm palette — "readable and navigable," not a redesign.

## Kit (email platform)

Welcome page form posts to `/api/subscribe`, a serverless function holding the API key server-side. Visitor never sees Kit branding.

Kit requires two calls in sequence — create the subscriber, then add to form. Calling only the second returns 404. Implemented correctly in `api/subscribe.js` as of commit `59ed81b`.

**Unverified:** whether `KIT_API_KEY` in Vercel is the current working key. Several were generated; at least one was stale. A 401 means this is the cause. Form id hardcoded as `9740544`, but `GET /v4/forms` returned ids `52` and `53` — discrepancy never resolved. Check this before assuming the code is wrong.

Never commit an API key.

## Substack

Still live, ~243 subscribers, nearly all imported by the founders from prior audiences. Substack's own discovery tools produced 32 subscribers in the publication's lifetime. Direction: Substack becomes free-only, paid content moves to the Guild site.

## Current objectives

1. **Readability and polish** — the contrast fix above, plus body copy sizing and line length. Same aesthetic. Deadline mid-August. *(Status unconfirmed as of 2026-08-02 — see the "Typography decisions (locked)" section above, which documents this work as done on the `typography-pass` branch. Whether that branch is merged to `main` was not verified this session.)*
2. **The Kitchen Table** — new paid section, added to navigation. Design and shell first; the paywall is a separate, larger project and should not be rushed to meet the deadline. *(Status unconfirmed as of 2026-08-02.)*
3. **Porch access via email** — signup grants Porch entry. The mechanism for recognising a returning visitor is undecided. Do not implement one without an explicit decision. *(Status unconfirmed as of 2026-08-02.)*
4. **House, Writers, and Join pages** — substantially completed 2026-08-03. House: beliefs rewritten, "What Is a Southern Writer" section added, contact consolidated to one address, manifesto removed. Writers: circular photo treatment, updated headline and copy, dead links removed. Join: new header copy and retro badge image, email capture wired to Kit, dead links removed. Nothing outstanding identified this session.
5. **Storefront** — dormant on the technical/build side for now, but Grace is actively developing products for it, so this is past the discussion stage. Next session priority: audit how much of the site is Sanity-managed vs. hardcoded, and extend Sanity's reach wherever it makes sense (writers, work, house content already flagged elsewhere in this doc). Do not assume this is the same thing as the existing `/shop/` page unless told so explicitly.

Nav currently reads: THE PORCH · THE WORK · EVENTS · THE HOUSE · WRITERS · JOIN. Events was added 2026-08-02. Every item is evocative rather than descriptive; a first-time visitor can't tell what any of them contain. Adding a seventh is a real navigability risk. Raise it before adding.

## Content management

Sanity CMS (project `fe6l0kiy`, studio at swg-studio.sanity.studio) powers Porch stories, book pages, featured fiction. Writer bios, photos, conversations, and House contact addresses are still hardcoded and need moving into Sanity. When the domain changes, Sanity CORS origins must be updated or content silently fails to load.

## Long-term initiative: visual editing (not a mid-August item)

This is the actual destination behind the site rebuild — not a punch-list item, its own tracked initiative. Everything built this session (video embeds, inline images, dividers, image sizing, the homepage toggle) was laying groundwork this will eventually sit on top of, whether that was said out loud at the time or not.

**The goal:** an editor clicks a piece of text or an image on the live site and it jumps straight to that exact field in Sanity Studio. Edit there, watch the live preview update as you type. This is a real, supported Sanity feature — "Visual Editing" — not something built from scratch. Confirmed against Sanity's own documentation 2026-08-10.

**Status: not started.** The site currently only ever shows finished, published content — there is no mechanism for privately showing an editor an unpublished draft.

**The process, in order:**

1. **Give the site a way to privately preview drafts.** This means a small serverless function — the same kind of thing that already powers the email signup button (`api/subscribe.js`), living in the same Vercel project, deployed the same way. Not a separate server, not something hosted on Sanity's side. Its job: tell an editor apart from a regular visitor, and quietly show the editor the unpublished version.
2. **Replace the site's hand-built Sanity fetch with Sanity's real client library.** The current fetch layer (`js/sanity.js`) is a simple hand-rolled `fetch()` call with no build step, by deliberate design (see "Deploy workflow" above). Sanity's real toolkit — the thing that invisibly tags every word with "this came from this document, this field" so clicking it means something — is built for a bundled environment, so adopting it means giving the site a build step (a standard tool, e.g. Vite, runs automatically on every push to `main` and produces the files that actually ship — same deploy trigger, same "push to GitHub and it's live shortly after," just with an automated translation step added). **Decided 2026-08-10: yes, do this.** Rick confirmed explicitly — visual editing is the actual promise behind the site rebuild, not optional scope. Do not re-raise the no-build-step conflict as an open question in a future session; it's settled. The "no build step" language elsewhere in this doc describes the site's *current* state, not a constraint to protect going forward.
3. **Turn on the click-to-edit overlay** (`@sanity/visual-editing`) — scans the page for those invisible tags and draws a clickable layer over each one.
4. **Tell Sanity Studio which live URL each document type resolves to** (a Presentation Tool config) — so opening a story in the new preview view loads the real page, not a blank frame.
5. **Wire up live updates** — so a change made in Studio refreshes the preview without a manual reload.

Steps 1 and 2 are the true prerequisites; nothing past them works without both in place.

## Hard limits

- Never handle passwords, payment details, or credentials on Rick's behalf.
- Read the actual documentation for a third-party service before writing code against it.
- If something fails twice the same way, stop and diagnose. Do not try a third variation.
