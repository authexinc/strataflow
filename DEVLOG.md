# Strataflow — devlog

Newest first. Read the last 3–5 entries at session start. Failures are recorded on purpose; a
workaround is labelled as one so it does not become permanent by accident.

### 2026-09-08 — Ticket creation: baseline read out of the code, then decided

**The factual half was answerable without asking.** "How are tickets created?" turned out to have an
uncomfortable answer: **there is no create path in the Strataflow UI at all.** CRM and Invoices both
carry "+ New" buttons in the shell header (`screens/crm.js` `newLead`, `screens/invoices.js`
`newInvoice`), and Work Orders and Dispatch carry none — so the only ways to make a ticket today are
the stock Odoo form (`views/strataflow_workorder_views.xml`, reached through the avatar's "Open Odoo"),
the demo data, or RPC. `create()` (`models/strataflow_workorder.py:58`) stamps the
`strataflow.workorder` sequence and, when a requester is set, auto-links that partner's most recent
won `crm.lead`. `address` and `dig_date` are the only required fields. The `source` selection already
offers `usp` / `manual`, but nothing anywhere writes `usp` — it always defaults to `manual`, which is
exactly why every screen footer reads "USP feed · not connected · manual entry".

**Stefan decided the product half:** dispatchers get a "+ New ticket" button, matching CRM and
Invoices. Locked in `ARCHITECTURE.md` › "Product decisions"; the build task, with the field
requirements above, is in `BACKLOG.md`. **Not built this session.**

**Two questions were put to him and are still open** — the USP feed hookup, and what Auto-assign
should actually do. The Auto-assign options offered are recorded verbatim in `BACKLOG.md` so the next
session does not re-derive them; the live one is whether real locator GPS is in scope, since
`screens/dispatch.js:95` `crewAnchors` currently infers a locator's position from their current ticket.

### 2026-09-08 — Skeleton fade (item 11), and the automation tab stopped mounting

**Item 11 was already three-quarters done.** The shell skeleton is an existing port of strataline's
"stagger-sweep": same `sk-*` class names, and the keyframes and tokens match `~/map-sys/web/app.css`
exactly (sweep 2.6 s / 1.5 s, `sk-in` .45 s `translateY(10px)`, identical bone and sheen values).
Comparing the two turned up only two real gaps, both now closed:

1. **It popped instead of fading.** Strataline transitions `#skeleton` to `opacity: 0` via a `sk-done`
   class over .45 s. Ours was a bare `t-if`, which unmounts the node instantly. The fix has to keep the
   node mounted one transition longer than the data needs it, so the shell now tracks `{mounted, done}`
   and a `useEffect` marks it done, lets the opacity run, then drops it.
2. **It had no map ground.** Strataline's skeleton carries the street-grid SVG behind the bones, so the
   handover to the real map is seamless; ours sat on flat `--bg`, so the background appeared abruptly.
   Added the same `sk-map` SVG plus the `--sk-map-line` / `--sk-map-block` tokens from strataline.

**FAILURE — could not verify it running, and the earlier browser workaround has stopped working.**
Earlier today the automation tab mounted the web client reliably (prime storage at `/web/login`, inject
a JSON-RPC session cookie, then navigate), and items 4, 5, 9, 10, 13, 7, 8, 12 and 14 were all checked
that way. Partway through this item it began failing consistently: `.o_web_client` present, `document.body`
24 characters, console showing only `Error: Access to storage is not allowed from this context`. Odoo's
boot needs `localStorage` and the page context is being denied it. A fresh tab did not help, nor did a
real click for a user gesture, nor `/odoo` before the action route.

**It is not our code.** Stashing the whole skeleton change and restarting reproduced the identical
failure, so the regression is environmental. Worth doing that check before believing an "it broke when I
touched it" story. What *is* verified: all four edited JS files parse as ES modules, `skeletonDone`
reaches the served bundle, and the module updates with zero server errors. The visual behaviour is
recorded as unverified in `BACKLOG.md` rather than claimed.

**Note for the next session:** the storage-permission diagnosis is still the right one and the priming
recipe did work for most of today, so retry it before assuming the tab is unusable — but budget for it
failing, and fall back to JSON-RPC for anything that is not purely visual.

### 2026-09-08 — Motion and the ink/accent split (backlog items 7, 8, 12, 14)

Reviewed with the `apple-design` skill first, as CLAUDE.md requires; the Liquid Glass and Motion
references decided three of the four.

**The "+ New invoice" conflict was a token collision, and it was in both themes.** `.o_sf_pill--ink`
(the CTA) and `.o_sf_navbtn.is-on` (the selected nav item) both `@include ink-btn`, so they rendered
byte-identically — measured `rgb(232,236,238)` on `rgb(20,24,29)` for both in dark. Not a dark-mode
bug: in light theme they were both the same black pill, about 600 px apart in the same bar. The
guideline is blunt about it — *Color > Best practices: "Avoid using the same color to mean different
things."* Liquid Glass splits the two cases explicitly: background colour for primary actions,
foreground colour for selected states. So ink now means navigation only, and the primary action pill
takes the accent as a fill. Renamed `--ink` → `--primary` on the pill (all three uses were actions:
+ New invoice, + New lead, Apply routes). New `--accent-hover/-active/-text` tokens per theme, because
the accent inverts: white on `#0f6ed8` is 4.95:1 in light, but white on the dark theme's `#3fc6ff` is
1.96:1 and fails — that one needs a dark label (9.68:1). Every state was computed, not eyeballed.
**Left alone deliberately:** `.o_sf_btn--primary` (in-page buttons) still uses ink, so the ambiguity
survives away from the top bar. It is in `BACKLOG.md` rather than silently changed — it restyles
buttons on screens nobody complained about, and belongs with the internal-screen revamp.

**Hover on the Home tiles no longer moves them.** It was `translateY(-3px)` plus a bigger shadow.
The pointer guidance warns to "reserve scaling for elements that can increase in size without crowding
nearby elements" — these sit on a 12 px grid, and lifting the card slides the click target out from
under the cursor. Now the glass takes a wash of the tile's own hue with a matching hairline ring, via
`inset 0 0 0 999px color-mix(...)` so the whole thing is one transitionable `box-shadow`; only the
icon scales (1.05). Neighbours stay put.

**Screens fade in instead of cutting.** Each screen is its own client action, so switching destroys
the old `.o_sf` and mounts a new one — a hard cut. Added a 220 ms ease-out fade. **Opacity only, on
purpose:** `.o_sf` hosts `position: fixed` children (topbar and footer in scroll mode), and animating
a transform on it would make it their containing block for the duration and shift them mid-flight.
This also happens to be what Reduce Motion asks for anyway — *"Replacing transitions in x-, y-, and
z-axes with fades to avoid motion."*

**Ambient drift on the map-less screens.** Two heavily blurred blobs (pink, blue) on 54 s and 71 s
offset alternating loops, anchored off the corners so they never cross the centre column where the
greeting and tiles sit, under the content layer at .17 in the gradient. `.o_sf_glow` also now renders
for every non-map screen rather than Home alone, since the ask was "Home and static pages with no map"
— Work Orders, CRM and Invoices qualify. Verified the transforms actually change over time rather than
trusting the declaration.

**All four are off under `prefers-reduced-motion`** — the fade, the drift, the icon scale and its
transition — extending the block that was already there.

### 2026-09-08 — Backlog opened; first five items off it

**Goal:** Stefan handed over 17 items. `HANDOFF.md` is overwritten every session, so a queue parked in
its "Next steps" dies at the next `/wrap`. Added `BACKLOG.md` as the durable list (open questions, UI,
behaviour, platform) and recorded the convention in `CLAUDE.md`. Then took the first five items.

**The automation-tab landmine is solved, and it was never Odoo.** Previous sessions recorded that the
web client would not mount in the automation tab — `.o_web_client` present, body empty — and fell back
to RPC. The console says why: `Access to storage is not allowed from this context.` The client needs
`localStorage` at boot. Navigating to `/web/login` first (which primes storage for the origin), then
injecting a `session_id` cookie obtained over JSON-RPC, then navigating to the action, mounts it every
time. The remaining oddity is cosmetic: the **first** screenshot after a navigation comes back blank
even though the DOM is fully painted — one scroll tick or a second capture fixes it. Every item below
was checked in a real browser rather than reasoned about.

**"Good morning, Mitchell" had no gap below it (item 10) — a specificity bug, not a spacing choice.**
`.o_sf_home_h1` declares `margin: 0 0 26px`, but computed style read `0px`. The cause is
`strataflow.scss:80`, `dl, ol, p, h1 { margin: 0; }` nested inside `.o_sf`, which compiles to
`.o_sf h1` — specificity (0,1,1), beating the (0,1,0) component class. Line 74 directly above it says
these resets are meant to be zero-specificity "so single-class component rules always win"; `h1` had
simply been left out of the `:where()`. Wrapped the whole group. The same reset was also silently
killing `.o_sf_kv { margin-top: 10px }` on the three plain `<dl>`s. Only one real `<h1>` exists in the
module, so the blast radius was checked before changing it, and the gap now measures 26px.

**The locator's completed-ticket guards were dead code (items 13, and the root of 4).** `sel.done` was
read in two places (`Start locate drawing`, `Confirm locate`). `done` is computed in the `stops`
getter, which maps *copies*; `sel` returns the raw ticket out of `state.data.tickets`, which has no
such key. So both guards evaluated `undefined` and neither ever disabled anything — a finished ticket
would happily reopen the drawing tool, and re-confirming threw a red `UserError` toast from the server.
Replaced with a `selDone` getter that asks the status directly (`located`/`closed`/`invoiced`), and
restructured the stage chain so a finished ticket renders a **completed view** instead: the review body
(now a shared `LocateReviewBody` template) with no drawing entry, no confirm, a status line and a
"Next stop" button. Copy adapts too — "Ticket details" rather than "Confirm ticket details", and the
red "go back and draw the locate" line is neutral once the ticket is done. Careful with the branch
order here: lifting the completed block out created a *second* `t-if` group for a moment, which renders
the review body alongside stage 1. It has to be one chain (`t-if` selDone → `t-elif` map → `t-elif`
draw → `t-else` review).

**Dispatch offered an assignment it could never make (item 4).** The "Assign to X" button was correctly
`disabled` on a ticket past `assigned` — that part was never broken. What was live was everything
*around* it: the crew rows stayed clickable on an invoiced ticket, so you could pick a locator and the
button would then read "Assign to S. Braun" while staying permanently grey. The picker is now not
rendered at all when `action_assign` would refuse the ticket; in its place is a static row stating who
holds it and why it is locked, with "Open ticket" taking the full width. Verified both ways: invoiced
ticket shows the locked row, `new` ticket still shows the full picker.

**Two banners removed as contradictions, not as clutter.** The locate print PDF carried "Reference only
— not a locate" (item 5) — on the one document that *is* the locate. Removed; confirmed by extracting
text from a freshly generated PDF, everything else intact. (Note for anyone parsing these: ReportLab
writes `/Filter [/ASCII85Decode /FlateDecode]`, so raw `zlib.decompress` over the streams yields
nothing and silently "proves" whatever you were hoping — use a real parser.) The Home screen's identical
footer banner (item 9) went too, since it speaks for the Strataline map and Home shows no map. It is
deliberately still on Dispatch and the Locator map, which do.

**Not done / still open:** the three questions at the top of `BACKLOG.md` (USP feed, ticket creation,
Auto-assign) need Stefan before they can be planned — Auto-assign in particular turns on whether real
locator GPS is in scope, since `crewAnchors` currently fakes position from each locator's current ticket.

### 2026-09-08 — The six open decisions answered and implemented

**Goal:** close the decision list that had been sitting in HANDOFF since the build session. Stefan
answered all six; they are now locked in `ARCHITECTURE.md` under "Product decisions".

**Three needed no code:** invoice numbering keeps Odoo's `INV/2026/00001` (numbering is an audit
trail; the stock sequence is what Odoo's reports, locking and gap detection expect). Locate pricing
stays flat per ticket at $250. Equipment / Timesheets / Reports stay "coming soon".

**Locator "Confirm & close" now stops at `located`.** Closing is what `action_invoice_closed` bills,
so one tap in the truck must not raise a draft invoice; a dispatcher closes from Work Orders after
reviewing the print. `action_complete_locate` writes `located` + `located_at` and posts a note to the
thread; `closed_at` is left for `action_advance`. The button reads "Confirm locate" and the handler
was renamed `confirmLocate`. No screen work was needed beyond wording — the locator route already
counted `located` as Done (`locator.js` `stops`). Verified over RPC end to end: onsite → confirm →
`located` with no `closed_at`, then dispatcher `action_advance` → `closed` with `closed_at` set.

**CRM stage renamed to "Quote sent"** — and the first attempt was wrong. A `<record id="crm.stage_lead3">`
override in `data/strataflow_crm_account_data.xml` did nothing: that file is `noupdate="1"`, and the
record already exists from the `crm` module, so a module update skips it. Confirmed by RPC after
`-u`: stages still read Proposition. Moved to a `post_init_hook` that renames only when the stage
still carries Odoo's default name, so a tenant who picked their own wording keeps it. Verified by a
clean `-i` into a scratch database (`strataflow_hooktest`, dropped after): stages come out
New / Qualified / Quote sent / Won, zero errors. The dev database was brought in line by running the
same guarded write over RPC, since `post_init_hook` does not fire on an update.

**Fonts are now self-hosted.** Public Sans and JetBrains Mono, variable woff2, latin subset, in
`static/fonts/` with their OFL licences. 27 KB + 40 KB, well under the 400 KB the handoff estimated,
because the variable latin subset replaces a family of static weights. `font-display: swap`; the
`--font` / `--mono` tokens already named these families, so no rule changed. Not a font CDN
on purpose: a tenant subdomain should not call a third party to render its own UI. Verified the SCSS
compiles and both `@font-face` rules land in both backend CSS bundles, and that both files serve 200
as `font/woff2`.

**Design review of the type change (apple-design), measured rather than eyeballed:**
- Public Sans against the SF Pro it replaces: x-height +1.8%, cap height +2.6%, `n` advance **+6.5%**.
  Text sets wider at the same px size, so the fixed-width panels (list 372, queue 328, route 316,
  search 300) reach their ellipsis sooner. 22 truncation guards already exist, so it degrades to
  earlier truncation rather than overflow.
- JetBrains Mono is metric-neutral against the old fallback: `n` advance 0.600 vs Menlo 0.602, and
  x-height 4.6% larger than SF Mono. Tabular figures read better at 11px with no column reflow.
- No thin text: the only `font-weight: 100` in the file is the variable range on the `@font-face`
  itself. Text weights are 400/600/700/800, all clear of the Thin/Light range the guidelines warn off.
- Left alone, flagged for Stefan: the 8.5px uppercase crew badge on a dispatch pin is under the 10pt
  desktop floor (and pin sizing is already step 3 in the handoff), and the -.025em tracking on the
  38px hero figure was tuned for a narrower face.

**Failure worth recording — browser verification did not happen.** The plan was to check for clipped
text in a real tab with the documented curl-cookie transplant. The session was accepted (uid 2 from
`/web/session/get_session_info` inside the page) but the web client never mounted: `.o_web_client`
present, body with zero children, on both the action route and plain `/odoo`. Same shape as the
2026-09-08 action-357 note. Stopped after four probes rather than dig. **So the width finding above is
analysis, not observation** — the next session should open the six screens and look at the dispatch
queue and route panels specifically.

**Files touched:** `models/strataflow_workorder.py`, `__init__.py` (new hook), `__manifest__.py`,
`data/strataflow_crm_account_data.xml`, `static/src/screens/locator.{js,xml}`,
`static/src/strataflow.scss`, `static/fonts/*` (4 new), `ARCHITECTURE.md`, `HANDOFF.md`.

### 2026-09-08 — Phase 0 on strataline: API keys can search, scoped to their bbox

**Goal:** HANDOFF next step 1 — let a strataflow tenant's key reach strataline's
`/search/address|features|lld`, not just `/tiles/*`, and let a provisioner mint keys in-process.
All the code is in `~/map-sys`; nothing in this repo changed except these docs.

**What was built** (map-sys branch `feat/search-key-scope`, commits 7e466cf + 1b16818, **not pushed**
because pushing `main` there deploys to prod):
- `"search"` is a grantable pseudo-source in a key record. With it the three search endpoints answer
  a key; without it they stay 403. It is never treated as a tile source, so granting search cannot
  widen tile access.
- Search results are restricted to the key's bbox, and `daily_searches` is a counter separate from
  `daily_tiles`.
- `scripts/manage_access.py` exposes `create_key(org, contact, bbox, sources=..., origins=...,
  keys_file=...) -> (record, raw)` for the Phase 2 provisioner to import. The raw secret exists only
  in that return value.
- Browser callers get CORS on search responses for origins registered on the key, and must pass the
  key as `?key=` (a custom header would need a preflight the server does not answer).

**Failures worth recording:**
1. The first cut clipped results to the bbox *after* the query, over-fetching 4x to compensate.
   Against the real province indexes `"17 avenue"` returned 32 rows and **0** inside Calgary — a
   city-scoped tenant key would have looked broken on its own city. FTS ranks the whole province
   before applying the limit, so over-fetching cannot fix it. The bbox now goes into the SQL.
2. With the bbox in the WHERE clause, SQLite scans the entire ranked match set: `"road"` against a
   small box took 375 ms. Scoped queries now rank at most 4000 rows in a subquery, then filter —
   105 ms, same rows returned. Unscoped session queries keep the old one-shot SQL.
3. Queries under three characters were being charged against the daily quota. Type-ahead fires per
   keystroke, so the first two letters of every search were spending budget. They now answer empty
   before the counter.

**What this unblocks:** step 2 (swap the faux maps for MapLibre) and the Phase 2 provisioner, but
only after Stefan merges the branch — until then production keys still reach `/tiles/*` only, so the
Locator would get 403 from `/search/*`.

**Files touched (this repo):** `ARCHITECTURE.md`, `HANDOFF.md`, `DEVLOG.md`.

### 2026-09-08 — Six screens on real Odoo modules (crm, account, mail) + theme fade
**Goal:** Implement Home, Dispatch, CRM, Invoices and Locator from the Claude Design project; move CRM/invoicing
off stand-in models onto `crm.lead` / `account.move`; connect tickets to leads, invoices and partners; add a smooth
theme fade; on Work Orders replace Print with an Export menu and fix the primary button hover/expanded states.

**Approaches tried:**
1. Light stand-in models `strataflow.lead` / `strataflow.invoice` — written, then discarded when the brief changed
   to real modules. Not a failure of the code; a scope correction. Deleted before the first install.
2. Install with `res.groups.category_id` → `Invalid field 'category_id' in 'res.groups'`. Odoo 19 moved it to
   `privilege_id` → `res.groups.privilege` (which carries `category_id`).
3. Install with form view referencing `invoice_id` after the model field was renamed to `move_id` →
   `Field "invoice_id" does not exist in model "strataflow.workorder"`. The waiter reported "UP" because the server
   serves without the module; waiter now greps for view/model errors before declaring success.
4. Demo `crm.lead` with `recurring_plan_id` → `Invalid field 'recurring_plan_id' in 'crm.lead'`. Field is
   `recurring_plan` in 19 (the earlier grep only confirmed `recurring_revenue`).
5. SCSS `width: min(1020px, calc(100% - 48px))` → whole backend CSS bundle failed:
   `"calc(100% - 48px)" is not a number for 'min'`. Odoo's Sass resolves `min()` as the Sass function.
   Replaced with `width: calc(100% - 48px); max-width: 1020px`.
6. Theme toggle appeared dead: `toggleTheme()` ran (localStorage flipped) but `data-theme` never changed.
   Suspected OWL reactivity through a getter object; rewrote to plain `useState(store)` — still dead. Actual cause:
   a stale asset bundle containing both old and new `theme.js` (`get isDark` still present after the file was
   rewritten). Restarting with `-u strataflow_workorder` regenerated assets; the fade then measured
   195→101→50→27→20 over ~450 ms. The `useState(store)` rewrite was kept (simpler), but it was not the fix.
7. First-load screenshots of every screen came back blank while the DOM was complete; `elementFromPoint`
   returned the header. Screenshot timing on the first composite of the backdrop-filter layers, not a bug.
   One genuine stall (Home skeleton stuck once, unreproduced) is fenced by a 4 s skeleton timeout in the shell.

**What worked:** real-module wiring — `crm.lead` One2many/smart button + `get_pipeline`; `account.move`
`get_invoice_board` + `action_invoice_closed` (one draft invoice per requester, line per ticket, product
"Locate service"); `mail.thread` on tickets with tracking; `res.partner` smart button. Shared `StrataflowShell`
with slots and a generic skeleton; `theme.js` store with `.is-theming` transitions; Export menu via Odoo
`Dropdown` (PDF from a reportlab controller, PNG rasterised client-side, CSV). Verified live in Chrome across all six
screens; the user ran close→invoice in their own tab and a real draft `INV` appeared for the ticket.

**Workarounds (labelled):**
- Faux-map SVGs stand in for Strataline tiles; containers are shaped for MapLibre. Proper fix: Phase 0 on strataline
  (`/search/*` key scope in `serve.py`, programmatic key minting) then the tenant key from provisioning.
- Dispatch distances derive from each locator's current on-site/assigned ticket, not GPS.
- The skeleton 4 s timeout hides an unreproduced stall rather than explaining it.
- Browser verification signed in by transplanting a curl-authenticated `session_id` cookie on a more specific path
  (`/odoo`), because the HttpOnly root cookie cannot be overwritten and passwords are not typed by the agent.
  Dev-only.

**Files touched:** `addons/strataflow_workorder/models/{strataflow_workorder,crm_lead,account_move,res_partner}.py`,
`controllers/export.py`, `security/*`, `data/strataflow_crm_account_data.xml`, `demo/*.xml`,
`views/strataflow_actions.xml`, `static/src/core/*`, `static/src/screens/*`, `static/src/strataflow.scss`.

**Open questions:** Should "Confirm & close" in Locator set `closed` directly or stop at `located` for dispatcher
review? Rename stock CRM stages to the design's ("Quote sent")? Per-tenant invoice numbering vs Odoo's? Dispatch pins
are 26 px at rest (desktop floor is 28 px).

### 2026-09-08 — Work Orders screen in the Strataline glass shell
**Goal:** Port `Strataflow Work Orders.dc.html` (Claude Design) into the Odoo 19 fork as a fullscreen OWL client
action, reusing strataline's tokens and skeleton loader, with an apple-design review folded into the port.

**Approaches tried:**
1. Security XML with `res.groups.category_id` → install failed (see entry above; first hit here).
2. `import { DateTime } from "luxon"` → the JS module silently failed to load; symptom was
   `Cannot find key "strataflow_workorders" in the "actions" registry`. Odoo exposes luxon as a global:
   `const { DateTime } = luxon;`.
3. Reset `.o_sf button { padding: 0; border: 0 }` outranked single-class rules (`.o_sf_chip`, `.o_sf_btn`),
   collapsing every button. Replaced with a zero-specificity `:where(button)` reset.
4. System `python3` lacked Odoo deps (`No module named 'babel'`); created `.venv` from `requirements.txt`
   (gitignored along with `graphify-out/`).

**What worked:** `strataflow.workorder` + `strataflow.utility` models, Locator/Dispatcher groups, client action with
`static target = "fullscreen"`, `usePopover` for Assign locator (Escape/outside/focus-return from the service),
pointer-event drawing canvas with metre labels prefixed by the utility letter, skeleton shell dismissed on first paint,
prefers-reduced-motion/transparency fallbacks. Assign and drawing persistence verified over RPC.

**Workaround (labelled):** list order was plain `dig_date` ascending, which floated invoiced tickets to the top;
sorted client-side (open → located → closed/invoiced) rather than in `_order`. Proper fix is a stored sort key.

**Files touched:** `addons/strataflow_workorder/` (17 files), `.gitignore`.

**Open questions:** ship Public Sans / JetBrains Mono as local `@font-face` or keep the system stack?
