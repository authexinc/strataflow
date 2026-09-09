# Task briefs — index

One brief per unit of work, each written to be the *only* thing a fresh session needs to read.
Every file:line claim in them was checked against the tree by a second pass. Where a brief
contradicts the request that spawned it, the brief is right and says so.

Generated 2026-09-09 from Stefan's 20-item list. Source items are mapped at the bottom.

**How to use these.** One session, one brief. Open a fresh session, tell it to read
`tasks/NN-slug.md`, and let it work. Do not run two briefs from the same collision group at
once — see the collision table.

---

## Before anything else: rotate the Strataline dev key

`k_17c57c69` is **live and unrevoked** (200,000 tiles/day, Calgary bbox, z≤15) and is committed
in this repo at `HANDOFF.md:22`, `HANDOFF.md:58` and `DEVLOG.md:80`, plus git history at
`f2667ecd25c`. Per the project's own recorded landmine, a key's `origins` list governs only the
CORS echo, not access, so the key works from curl from anywhere.

The branch is still unpushed. Cleaning it now costs nothing; cleaning it after a push means a
history rewrite. Mint a replacement with `scripts/manage_access.py`, revoke this one, and replace
the three literals with a placeholder. Brief 11 covers this as a precondition for the README.

---

## Recommended order

Four waves. Within a wave, order is a suggestion; between waves it is a dependency.

### Wave 1 — foundations that unblock other briefs

| # | Brief | Size | Why first |
|---|---|---|---|
| 02 | `02-auto-assign-zones.md` | large | Creates `strataflow.zone` and `postal_code`. Brief 01 writes to `postal_code` and brief 06 wants to show a locator's zone. Nothing else can use either until this lands. |
| 05 | `05-theme-system-mode.md` | medium | Replaces `toggleTheme()` with `setThemeMode()`. Brief 06 puts the theme control on the profile screen, so it needs the new API. |
| 10 | `10-ticket-lifecycle.md` | medium | Pure model and security work, touches nothing any other brief touches. Closes a real hole: an invoiced ticket can be hand-edited back to `new` today while staying linked to the issued invoice. |

### Wave 2 — stock Odoo chrome

Sequence these. Three of the four write to `stock.scss`.

| # | Brief | Size | Note |
|---|---|---|---|
| 07 | `07-notifications.md` | small | Do before 03. Small, and it establishes how a toast reaches shell tokens, which 03 should not fight. |
| 03 | `03-stock-view-sweep.md` | large | Seven commits, ordered variables-first. The single biggest brief in the set. |
| 09 | `09-branding-and-errors.md` | large | Two independent commits: favicon and tab titles, then error pages. Ships the module's first image assets. |
| 06 | `06-profile-page.md` | medium | Needs 05. Wants 02 but ships without it. |

### Wave 3 — Strataflow screens

Both write to `strataflow.scss`. Sequence them.

| # | Brief | Size | Note |
|---|---|---|---|
| 04 | `04-home-hover-greeting.md` | small | Needs a design decision from you before it can start. |
| 08 | `08-crm-board.md` | medium | The chrome fix is a hard prerequisite of the drag work, not a nicety: the column's `backdrop-filter` makes it a containing block. |

### Wave 4 — the map

All three write to `strataline_map.js`, `layers.js` or `locate_canvas.js`. Strictly sequential.

| # | Brief | Size | Note |
|---|---|---|---|
| 12 | `12-map-inspect-geolocate.md` | large | Adds a `sub_layer` index to `layers.js` that 13 also reads. Do first. |
| 13 | `13-draw-filter-toggle.md` | medium | Adds a transient `isolate` field to the same store. |
| 14 | `14-drawing-editing.md` | **split** | Six sub-tasks, 14a through 14f. 14a is a format change and is mandatory before the other five. Treat each as its own session. |

### Wave 5 — last, and one of them is blocked on you

| # | Brief | Size | Note |
|---|---|---|---|
| 11 | `11-readme.md` | medium | Do late so it describes what actually exists. Blocked on the key rotation above and on whether the repo goes public. |
| 01 | `01-usp-intake.md` | medium | **Read this one now, build it last.** It lists ten questions to put to Utility Safety Partners, and that has a long lead time. The build is blocked until they answer. |

---

## File collision groups

Do not run two briefs from the same row concurrently.

| Files | Briefs |
|---|---|
| `static/src/stock/stock.scss` | 03, 07, 09 |
| `static/src/strataflow.scss` | 04, 08, 13 |
| `static/src/core/strataline_map.js` | 12, 13, 14 |
| `static/src/core/layers.js` | 12, 13 |
| `static/src/core/locate_canvas.js` | 13, 14 |
| `static/src/core/shell.js` / `shell.xml` | 05, 06, 09 |
| `models/strataflow_workorder.py` | 01, 02, 10 |
| `views/strataflow_workorder_views.xml` | 02, 03, 10 |
| `controllers/export.py` | 10, 14 |

---

## Where the request was wrong about the code

Five briefs correct the item that spawned them. Worth reading before you plan around them.

- **04** — the greeting is already time-aware. `home.js:50-53` buckets the local hour into
  morning, afternoon and evening. What is missing is variety and a correct clock source.
- **05** — the theme already reads the system setting on first load, at `theme.js:15`. The gap is
  that one press of the toggle pins a value forever, with no mode that keeps following the OS.
- **12** — there is no pinpoint button to add geolocation to. The crosshair on the Dispatch rail
  is "Crew positions" and only toggles an initials badge on on-site pins.
- **13** — Dispatch has no utility chips and no drawing at all. The chips exist only in the
  Locator's draw stage and the Work Orders detail pane. The rows you were probably clicking are
  read-only text on the on-site card.
- **14** — north alignment on completion already works and always has. `projectDrawing` is
  unconditionally north-up. The real defect is that map rotation stays enabled mid-draw, so the
  print can silently disagree with what the locator saw.

Two more worth knowing:

- **02** — Auto-assign is not a stub. It is built and really assigns. What is broken is that
  `geo.js:46` silently drops every ticket with no coordinates, which is exactly the hand-entered
  population the zone rule exists to serve.
- **10** — reopening already works, by accident. `status` is a plain editable field with no guard.

---

## Decisions waiting on you

Every brief that needs one carries a "Decision needed" section with options and a recommendation.
The ones that actually block work:

1. **01** — the USP transport. Ten questions for them, listed in the brief. Longest lead time.
2. **04** — which hover treatment to ship, and whether to overturn the recorded no-translate
   decision. Nothing can start until you pick.
3. **11** — does the repo go public. Drives the key rotation urgency.
4. **14** — what "editable measurement arrows" means. The brief recommends against a typed
   override of a measured distance on a locate record, and gives the liability reason.

The rest have safe defaults and can proceed on the recommendation.

---

## Item mapping

| Your item | Brief |
|---|---|
| 1 USP feed, 5 how tickets are created | 01 |
| 2 Auto-assign | 02 |
| 3 revamp internal screens, 10 inner pages | 03 |
| 4 hover animation, 16 greeting | 04 |
| 17 system theme | 05 |
| 9 avatar goes to Discuss | 06 |
| 11 notification styling | 07 |
| 12 CRM boxes and drag | 08 |
| 13 404 page, 14 favicon and tab branding | 09 |
| 7 completed docs, 8 reopen tickets | 10 |
| 6 README | 11 |
| 18 feature select, 19 geolocation | 12 |
| 15 draw/filter toggle | 13 |
| 20 drawing editing, all five parts | 14 |
