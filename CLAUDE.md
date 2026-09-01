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
- Before saying something isn't documented, or asking Rick to check or verify something, check it yourself, using every real source actually available — this file, live, in this connected repo, ahead of any cached or secondary copy (a Cowork project's file cache, a remembered summary, an old session). If a tool exists that could answer the question, use it before asking him to do the legwork. Only bring him something genuinely unverifiable from here. This is the same "do it yourself" rule above, stated specifically because it was violated on 2026-08-19: asked him to go check this file instead of checking it directly, when direct access was already sitting there unused.
- When troubleshooting anything with multiple real stages (a pipeline, a build process, a feature with several dependent steps): before touching code, write out the full intended chain, in order — what's supposed to happen at each stage, start to finish. Then test each stage in that order, stopping at the first one that actually fails. Do not jump to the next plausible cause, the next component, or the next guess without first confirming exactly which stage in the real chain is where things actually break. A fix applied downstream of the real failure will look like progress and change nothing, because the actual break is upstream of it. This applies especially when several fixes have already been tried without resolving the underlying issue — that pattern itself is a signal to stop and map the system, not to try harder at the next guess.
- When a broad or structural question is asked (e.g. "does this whole page/feature actually work," "is X the root cause"), do not silently substitute it with a narrower, more easily-testable sub-question. Before running any check, name the specific sub-question(s) that will actually be tested, and state plainly what portion of the original broad question each one covers and does not cover. When reporting results, never let "this narrow thing checked out clean" stand in for "the original question is answered" — state both separately. If available tools genuinely can't answer the broad question directly, say so plainly rather than answering an adjacent question and reporting it as if it closed the original one.
- Before starting any investigation or build that could plausibly touch more than one page, template, or content type, create an explicit scope document first — not a narrative log entry, a literal checklist: every real page/surface where the relevant content type or feature appears, one row each, with a status column (untested / tested-working / tested-broken / not-applicable). This must be created and shown before any fixing begins, not reconstructed afterward from memory. Every claim made during the work — "this is confirmed," "this is ruled out" — must reference which row of this list it addresses, explicitly. If a claim doesn't map cleanly to a row already on the list, that's a signal the list itself is incomplete, and the list gets updated before the claim is trusted.

## Absolute rule

One of the three founders goes by **Gray**, **Grace**, or **Grace Lynn** only. Her legal name must never appear anywhere — code, comments, commit messages, CMS entries, file names, conversation. No exceptions.

Other founders: Rick West (writes as Beau Pritchett IV), MJ Polk (writes as Hank Cotton). Jean-Paul is the Guild's mascot, a taxidermied peacock, played completely straight.

## Also read PROJECT_LOG.md

Same folder, read at the start of every session alongside this file. This file is settled technical/operational instructions; `PROJECT_LOG.md` is the running record of decisions, thinking-in-progress, and open threads that don't belong here but shouldn't be lost — written unprompted at the end of substantive conversations, not something Rick has to remember to request.

## Repo location trap

Working repo: `C:\Users\Rick\Desktop\EZ\websites\swg-site-v12\swg-site`

A decoy folder exists at `...\swg-site-v12\swg-site-v12` with no git repository in it. If git says "not a git repository," you are in the wrong folder. Do not ask Rick to hunt for it.

## A separate project exists — do not mix them

`C:\Users\Rick\Desktop\EZ\primalbeet` is Rick West's personal "primalbeet" music project. It is entirely separate from the Southern Writers Guild — different site, different brand, different everything. Never read from, write to, or pull instructions from that folder while working on SWG, and never let SWG content, branding, or decisions leak into it. If a task description doesn't match anything in this site (e.g. references sections like "Fiction/Verse/Essays," "Visual," or "Music/Video" that don't exist here), stop and check whether it actually belongs to primalbeet before building anything.

Static site, no build step. Vercel watches GitHub and deploys automatically.

- Push to `main` → live on southernwritersguild.com in ~30 seconds.
- Push to any other branch → public preview URL.
- Default is to push straight to `main`. There is no standing branch-first review rule — that was a one-off Rick asked for on a single past occasion, not a policy. Corrected 2026-08-19.

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

## Jean-Paul's tip jar — Value for Value concept

**Status: early thinking, not a locked decision.** Rick's own notes, written roughly a week before being pasted here 2026-08-11 — his framing, not a finalized plan. Useful for the reasoning and direction, but nothing below should be treated as settled or built against without checking current status first. What's actually confirmed as of 2026-08-11: a Jean-Paul tip jar is definitely happening, and Square is the payment processor currently being discussed/decided — actively in progress as of this note, not yet final. Read what follows for the *why*, not as a locked spec.

**The core problem:** Value-for-Value (the "No Agenda" podcast model — give the work away free, ask for support directly) only works if the ask is actually visible. No Agenda's host asks constantly, by name, with dollar amounts — the Guild's voice can't do that without breaking character. But a tasteful, quiet ask is functionally invisible, and an invisible ask reads to the audience as "we don't need your money." The design problem is an ask that's standing and unembarrassed without ever sounding like a pledge drive.

**The solution: Jean-Paul is the collection plate.** He's already established as a taxidermied peacock whose hunger is played completely straight. "Feed Jean-Paul" is an in-voice, in-character donation ask the Guild can make at any frequency without it ever reading as begging — it's a running bit with a payment link attached, and regulars enjoy the bit. This sits below and separate from the formal $96/year dues tier: dues are for people who want to join something; feeding Jean-Paul is for people who just want to toss five dollars at something they love without joining anything. Two asks, both fully in-voice, neither one a pledge drive.

**Where the ask lives:** not a site banner — the site's posture stays "we don't need you." It lives in the email newsletter, in a standing line in the same spot in every footer, same dry register every time. Ritual, not campaign — regular readers see it dozens of times a year at zero cost to them, until the time they act on it.

**The full formula is time, talent, and treasure — not just money:**
- **Talent:** readers writing back — letters to the Porch, readers' own porch-style stories, fan art of Jean-Paul. Costs nothing, deepens the fictional world, and quietly doubles as a farm system for finding the Guild's future writers.
- **Time:** word of mouth. Given Substack's organic discovery produced exactly 32 subscribers in the publication's lifetime, word of mouth isn't a soft nice-to-have here — it's the actual acquisition channel. V4V means formalizing the ask: if this was worth something, hand it to somebody.
- **Treasure:** the literal money ask — Jean-Paul's jar and the dues tier.

**Merch ties directly into this, not alongside it.** The bar for merch: artifacts a stranger might want, not logo-on-a-mug branding. Objects from inside the fiction — the Guild treated as an institution that's quietly existed for a century and occasionally lets artifacts out into the world. Jean-Paul as iconography; whatever Hank Cotton's world would plausibly produce. This matters specifically for MJ Polk: it turns his pen name into a real brand with real objects in the world, run by him, sold to strangers — which is the actual memorialization he's chasing. Natural cadence: a story publishes free, its artifact follows about a week later. The writing becomes the marketing calendar, and every merch drop is a newsletter with a reason to exist beyond "new story."

**The flywheel:** free writing brings a reader in. A reader who catches real affection for it has three purely voluntary exits — feed Jean-Paul, pay dues, buy an object — none of them gating anything. Every one of those transactions drops an email address into Kit and the members table, which grows the list, which grows the next drop's audience. None of it requires a paywall, a vendor platform, or a fixed cost.

**Tempered expectations, stated plainly so nobody's dreaming:** V4V conversion for a small, devoted audience typically runs low single digits of people paying anything in a given year. Off ~250 subscribers, that's beer money, and merch will likely start the same. The honest framing, including to the founders themselves: this isn't an income play, it's a proof-of-affection machine where every dollar is a data point, running on infrastructure that costs nothing to sit idle and scales without modification if the audience ever multiplies (a screenplay, a viral story, Polk's own hustle). Cheap to be wrong about, already built if it's right.

**How this is meant to land with each founder, per Rick:** MJ Polk gets a real commercial lane to run hard in on his own terms. Grace's work stays a labor of love that never acquires a revenue target it didn't ask for. Rick himself doesn't need any of it to pay him personally — if it ever takes off, the upside goes to his kids, and otherwise Jean-Paul just eats well that year. The system doesn't depend on any of the three needing it to work, which is stated as the actual point.

**Related, not yet written:** a "paywall counterfactual" — laying out plainly what gating content would cost at this scale, in both data and readers — is meant to go in a separate paper Rick is preparing, framed as a numbers-driven case rather than a deference argument.

## Current objectives

1. **Readability and polish** — the contrast fix above, plus body copy sizing and line length. Same aesthetic. Deadline mid-August. *(Status unconfirmed as of 2026-08-02 — see the "Typography decisions (locked)" section above, which documents this work as done on the `typography-pass` branch. Whether that branch is merged to `main` was not verified this session.)*
2. **The Kitchen Table** — new paid section, added to navigation. Design and shell first; the paywall is a separate, larger project and should not be rushed to meet the deadline. *(Status unconfirmed as of 2026-08-02.)*
3. **Porch access via email** — signup grants Porch entry. The mechanism for recognising a returning visitor is undecided. Do not implement one without an explicit decision. *(Status unconfirmed as of 2026-08-02.)*
4. **House, Writers, and Join pages** — substantially completed 2026-08-03. House: beliefs rewritten, "What Is a Southern Writer" section added, contact consolidated to one address, manifesto removed. Writers: circular photo treatment, updated headline and copy, dead links removed. Join: new header copy and retro badge image, email capture wired to Kit, dead links removed. Nothing outstanding identified this session.
5. **Storefront** — dormant on the technical/build side for now, but Grace is actively developing products for it, so this is past the discussion stage. Next session priority: audit how much of the site is Sanity-managed vs. hardcoded, and extend Sanity's reach wherever it makes sense (writers, work, house content already flagged elsewhere in this doc). Do not assume this is the same thing as the existing `/shop/` page unless told so explicitly.

Nav currently reads: THE PORCH · THE WORK · EVENTS · THE HOUSE · WRITERS · JOIN. Events was added 2026-08-02. Every item is evocative rather than descriptive; a first-time visitor can't tell what any of them contain. Adding a seventh is a real navigability risk. Raise it before adding.

## Content management

Sanity CMS (project `fe6l0kiy`, studio at swg-studio.sanity.studio) powers Porch stories, book pages, featured fiction, and the Writers section. House contact address and the videos/featured-fiction pages were moved to Sanity 2026-08-28 (Step 8, phases 1-2); Writers (schema, all four bios, listing page, individual pages) moved 2026-09-01 (Step 8, phase 3 — closes the last item on this list). When the domain changes, Sanity CORS origins must be updated or content silently fails to load.

### Sanity MCP schema lookup gotcha

When checking live schema via Sanity MCP tools (get_schema), list_workspace_schemas can return a "Studio-deployed" schemaId that is stale/disconnected from what npx sanity@latest schema deploy actually writes to. The record that reflects real CLI deploys is schemaId '_.schemas.default'. Confirmed 2026-08-28 after a stale-record check caused a false alarm over a field that was actually live. Check against '_.schemas.default' first.

## Going Pro — "Rick's Vision for Going Pro" (governs sequencing below)

The canonical infrastructure plan, provided in full by Rick 2026-08-10 (source doc: `SWG_Infrastructure_Independence_Plan.md`). The workstation and visual editing both live inside this larger plan. Treat this section as authoritative — it supersedes any earlier, reconstructed summary of the same plan in this file's git history.

**The governing principle:** every asset that matters — domain, code, documents, mailbox, tools — ends up owned by the LLC, not any individual, with one necessary exception: login credentials are personal, but revocable and role-based rather than tied to one person's availability. Where a tool won't support three separate real logins (Kit, for instance), the fallback is a shared credential in a managed vault.

**Step 0 — gate:** LLC, EIN, and business bank account. LLC formed — documents received, confirmed by Rick 2026-08-28. Business bank account under active evaluation, a frontrunner exists but not finalized, as of 2026-08-28. Practical effect: anything requiring the LLC to legally exist (e.g. Step 3, domain transfer) is now unblocked. Anything requiring finalized bank account details remains blocked. **Clarified 2026-08-11: this gates what's public or official, not quiet technical prep.** Rick knows the LLC is happening — what's still missing is the bank account's actual details. Setting up accounts, building tools, and moving infrastructure quietly is fine and encouraged right now, so it's all ready to switch on the moment the paperwork clears, rather than starting from zero then. What's genuinely blocked: anything needing finalized bank account details, and any public announcement or "this is now how we officially do things" rollout. Transferring the domain's registration to the LLC (Step 3) was previously blocked on this same basis — it no longer is, since the LLC is confirmed formed as of 2026-08-28 (see the updated Step 0 status above). Prep freely on anything else; don't announce yet.

Step 4 confirmed 2026-08-28: real addresses are beau@southernwritersguild.com (Rick), hank@southernwritersguild.com (MJ Polk), gray@southernwritersguild.com (Grace) — mailboxes created and active. Independent Google Accounts for these three not yet created as of this date. jp@southernwritersguild.com already has its own independent Google Account (see Confirmed facts above) and additionally now anchors the YouTube Brand Account as Primary Owner and the shared Guild Drive (Step 5).

Confirmed 2026-08-29: Sanity organization renamed to "Southern Writers Guild." MJ and Grace invited as Administrators at the organization level (pending their acceptance). Rick's personal account fully separated from the Guild's Sanity organization — no longer reachable by SWG admins, no entanglement with the personal music project. Visual Editing (private draft preview + click-to-edit) fully built and confirmed working on Porch stories as of 2026-08-28.

**Confirmed facts, already true:**
- `jp@southernwritersguild.com` is active with its own independent login, separate from Polk's main IONOS account.
- The Kit account is already registered in the Guild's name.
- Everything on Rick's C drive relative to SWG is the website build — one folder, no financial or admin records mixed in.
- IONOS holds the domain and the `jp@` mailbox. Nothing else, no entanglement with anyone's other business.
- The entity is an LLC, being formed in Georgia. Confirmed directly by Rick 2026-08-11 — "corporation" in an earlier message was casual phrasing, not a change of entity type.
- **Payment processors — current thinking as of 2026-08-11, not a locked decision:** leaning toward running both, split by channel — Stripe for online/web payments (the site's dues, Jean-Paul tip jar, etc.), Square for point-of-sale (in-person, e.g. events like Bands, Booze, and Books). Rick was explicit: this is where their heads are right now, not something decided.
- **Business bank — under consideration as of 2026-08-11, not decided:** Bank of America, Truist, and Synovus are the names in the conversation. No commitment to any of them yet.

**The 13 steps, in order:**

0. Gate — LLC, EIN, bank account. In progress.
1. Secure `jp@` access — password into the shared vault so all three can get in independently. No longer held on Step 0 — this is quiet prep, not an announcement.
2. Move DNS management to Cloudflare, signed up under `jp@southernwritersguild.com` rather than a personal email. All three get access.
3. Transfer the domain's actual registration to the LLC, inside Cloudflare. A tax/reporting transfer — takes about two weeks, doesn't touch live operations.
4. Give each founder a real identity, free. IONOS already includes five mailbox slots; `jp@` uses one, each founder takes one of the remaining four (one spare left over) — a real, non-shared address on the domain. Each founder makes their own free Google Account signed in with that address: full Drive/Docs/Sheets/Calendar, and the same identity covers "Sign in with Google" on GitHub, Vercel, Sanity, and Canva. Zero added cost. Known gap: free Google accounts don't have Workspace's org-owned Shared Drives, so documents are centralized by convention, not truly company-owned.
5. Migrate the ~100 shared Google Docs/Sheets currently scattered across personal accounts into `jp@`'s Drive as the central home, shared out to each founder. Real one-time effort, not automatic.
6. Move the site's code off Rick's PC and into a Guild-owned GitHub Organization. Claude Code points at the new home; this also formally retires Cursor and GitHub Desktop from the workflow.
7. Build the shared credential vault — Proton Pass free tier (or KeePass as a DIY fallback). Controls who can access what; all three founders retain full rights to everything regardless.
8. Finish wiring the site into Sanity completely. Content inventory is already substantially moved — "may be a straggler, but that portion is complete." Goal: anything on the site can be changed quickly and easily from Sanity.
9. Set up Sanity Visual Editing (see the dedicated section below for the technical build) — only works on content that's actually gone through Step 8.
10. Build the Creator Workstation — one page, one login, for the non-technical side. Tiles into Docs, Sheets, Canva (individual accounts for now), Kit, Sanity, and `jp@` mail, plus room for personal tiles.
11. Build the Tech Console, separately — deploy status, GitHub, the pieces almost nobody else needs. Same underlying credential/identity plumbing as the Creator Workstation, different front door. Everyone has access; Rick trains if needed.
12. Define roles, not people — Admin, Technical Operator, Content Operator, Communications Operator, Growth Operator, each a defined slice of access (including what `jp@` access comes with it), stored as data. All three founders hold every role today; the payoff is that handing a slice to a future hire is a data change, not a rebuild.
13. Leave Finance and Admin open, not built — same login, same roles table, same directory pattern, ready to carry new sections whenever those fronts are ready.

**What it produces:** no single laptop, personal account, or one person's availability stays load-bearing for the business. Access is real, independent, and revocable in one action instead of a scavenger hunt across a dozen logins.

**Reference file still not in hand:** `SWG_Workstation_Concept_Preview.html`, the original clickable mockup, isn't in this repo. What exists instead: `WORKSTATION_CONCEPT_REFERENCE.md` (same folder), a full transcription of its actual content and structure, done directly from screenshots 2026-08-28 — every tile, every label, every access tag. Read that file before starting a real build; it also lists the three things that are genuinely undecided (where the workstation lives, what handles login, and current Step 0 status) rather than just undocumented.

**Resolved, not open:** the planning session this plan came from ended mid-troubleshooting on a Sanity Studio bug — stories displaying correctly but with no editable input in the Studio editor. That was independently diagnosed and fixed in a later session (this file's git history): the schema simply never declared fields that already held live data. No longer an open thread.

**Do not ask Rick about founder governance or decision-making mechanics between the three of them** — stated explicitly as out of scope for a technical assistant.

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
