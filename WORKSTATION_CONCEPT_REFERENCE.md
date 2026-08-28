# Workstation Concept Preview — Reference

Transcribed directly from the actual concept preview screenshots (2026-08-28), since the source HTML file (`SWG_Workstation_Concept_Preview.html`) referenced in `CLAUDE.md` still isn't in this repo. This is the content and structure, not the file itself — treat it as the spec to build from until the real file is located and added.

Built in the site's real design system: charcoal background, copper/amber accents, Cormorant Garamond serif headers. A "Creator / Tech" pill toggle, top right, switches between two views on what's otherwise the same page layout. Both views carry a small header label: "CONCEPT PREVIEW — NOT LIVE — FOR DISCUSSION ONLY" and "THE GUILD · SOUTHERN WRITERS GUILD."

## Creator view

Title: "The Workstation." Subtitle: "Welcome back — here's everything you're set up to reach."

Tiles, in a grid, each with a title, one line of description, and an access tag (either "YOUR ACCOUNT" or "SHARED LOGIN"):

- **Google Docs** — Shared drafts, submissions, House copy. Your account.
- **Google Sheets** — Subscriber notes, planning, tracking. Your account.
- **Canva** — Cover art, social graphics, print pieces. Your account.
- **Kit** — Newsletter drafts and subscriber list. Shared login.
- **Sanity** — Edit the site directly — click, change, watch it go live. Your account.
- **jp@ mail** — Reader mail and submissions, in one inbox. Shared login.
- **+ Add a tool** — Music, references, whatever else belongs on your desk. Empty slot, dashed border — not a live tile, an invitation to add one.

## Tech view

Same header pattern. Subtitle changes to: "The parts almost nobody else needs — but everyone still can reach."

- **GitHub** — Site code and recent changes. Your account.
- **Vercel** — Deploy status, rollbacks, logs. Shown as **Shared login** in this mockup — flagged as an open question, not confirmed correct. The Going Pro plan's stated reasoning put Vercel in the same bucket as GitHub/Sanity/Canva (individual Google sign-in, no vault needed). Resolve which is actually true before building against this — either there's a real reason it's shared (e.g. not on a Team plan), or the mockup's label is simply wrong and should read "Your account" like the others.
- **Cloudflare** — Domain and DNS control. Your account.
- **Sanity Studio** — Full content model, schema, structure. Your account. (Distinct from the "Sanity" tile on the Creator side, which is for editing content, not managing schema.)
- **Uptime** — Is the site actually up, right now. Status — not a login at all.

## What's still genuinely undecided, not just undocumented

These aren't in any file anywhere because they haven't been decided yet, not because they were lost. A real build session shouldn't start without answering them first:

- **Where does the real workstation live** — its own repo and subdomain (`hq.southernwritersguild.com` was floated once, not committed to), or a section of the existing `swg-site` repo?
- **What actually handles login** — the tiles say "your account" vs "shared login," but nothing has specified the real authentication mechanism tying a person to which tiles they can see. Google OAuth directly? Something else?
- **Is Step 0 (LLC + business bank account) actually done yet?** `CLAUDE.md` still says "in progress" as of 2026-08-10/11 — over two weeks old as of this writing. The whole build is gated on this per Rick's own rule. Confirm current status before treating this as buildable.
