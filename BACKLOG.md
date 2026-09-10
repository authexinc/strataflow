# Backlog

Durable work queue for `addons/strataflow_workorder`. `HANDOFF.md` holds only what is in flight this session;
anything that should survive a `/wrap` lives here. Add to the bottom of a section, strike nothing — move a
finished item to `DEVLOG.md` and delete the line.

Locked product decisions are in `ARCHITECTURE.md` › "Product decisions" and are not reopened here.

---

## Task briefs — `tasks/`

Stefan's 2026-09-09 list of 20 items was decomposed into 14 implementation briefs under `tasks/`,
one per unit of work, each fact-checked against the tree. **`tasks/00-INDEX.md` is the entry point**:
it carries the wave order, the file-collision groups, the decisions still waiting on Stefan, and
the five places where the request turned out to be wrong about the code.

The rule: one session, one brief. This file stays the queue; the briefs hold the detail. Where an
entry below has a brief, work from the brief, not from the line here.

| Brief | Covers | Blocked? |
|---|---|---|
| `01-usp-intake` | USP feed transport + how tickets are created | yes — ten questions for USP |
| `02-auto-assign-zones` | zone model, `postal_code`, zone-first rule | no |
| `03-stock-view-sweep` | every remaining stock Odoo surface | one design call |
| `04-home-hover-greeting` | tile hover + rotating greeting | yes — pick a hover treatment |
| `05-theme-system-mode` | three-state theme that keeps following the OS | no |
| `06-profile-page` | avatar → a real profile screen, not Discuss | no |
| `07-notifications` | toast styling, incl. dark toasts from dark screens | no |
| `08-crm-board` | board chrome + stage-to-stage drag | no |
| `09-branding-and-errors` | favicon, tab titles, designed error pages | four design calls |
| `10-ticket-lifecycle` | dispatcher reopen + where completed docs live | one policy call |
| `11-readme` | replace the stock Odoo README | yes — public repo? key rotation |
| `12-map-inspect-geolocate` | click a feature for attributes; real GPS button | no |
| `13-draw-filter-toggle` | utility chips isolate as well as draw | no |
| `14-drawing-editing` | **split into 14a–14f**; 14a is a `v:3` format change | one definition call |

**Precondition, all of it:** Strataline dev key `k_17c57c69` is live and unrevoked and is committed
at `HANDOFF.md:22`, `:58` and `DEVLOG.md:80`, plus git history at `f2667ecd25c`. `origins` governs
only the CORS echo, not access, so it works from curl. The branch is unpushed — rotate before the
push, or it becomes a history rewrite.

---

## Open questions (answer before the dependent work is planned)

- [ ] **How do we actually hook into the USP feed?** No integration exists today; tickets are created by hand.
      → **`tasks/01-usp-intake.md`** is the decision memo: it compares the four realistic transports, specifies
      the one transport-agnostic seam that survives all of them, and lists the ten questions to put to USP.
      Need: the feed's transport (poll, push, email, portal scrape), its record shape, auth, and cadence, then
      a decision on whether it lands in Odoo directly or through the strataline API. Blocks any real ticket
      intake: until it exists, `source` is always `manual` and every screen footer reads "USP feed · not
      connected". The manual "+ New ticket" path below is settled independently of this.
      **Where the ingest code lives is a second, dependent decision** (asked 2026-09-08, deliberately not
      answered): tenancy is DB-per-tenant, so tickets must reach *each* tenant's own DB. Either an
      `ir.cron` inside `strataflow_workorder` fetches per tenant (no new service; credentials and parsing
      duplicated per DB, and a parser fix means updating every tenant), or one strataline-side service
      fetches once and writes into tenant DBs over JSON-RPC (one place to fix and watch, same shape as the
      Phase 2 provisioner; another service, needing write access into every tenant). Answering this before
      the transport is guesswork — an email-in alias has no fetch step at all and is Odoo-side by
      definition.

## Behaviour / correctness

- [ ] **Rebuild Auto-assign as zone-first, workload-tiebreak** → **`tasks/02-auto-assign-zones.md`**
      (Stefan, 2026-09-08 — locked in
      `ARCHITECTURE.md` › "Product decisions"). **Correction to this file's earlier note: Auto-assign is
      not a stub.** It is built and it really assigns — `planRoutes` (`core/geo.js:45`) is greedy
      nearest-neighbour from `crewAnchors`, the toggle draws the routes, and `applyRoutes`
      (`screens/dispatch.js:192`) calls `action_assign` per stop. So this is a replacement of the rule,
      not a first build. Zone filter first, then least-loaded among the matches, then pure workload when
      no zone matches. Two things fall out of dropping distance: `crewAnchors` is no longer an
      assignment input (it can stay for the drawn routes), and the current silent exclusion of tickets
      without `latitude`/`longitude` from auto-assign goes away — those are exactly the hand-entered
      tickets. `get_board_data` already ships each locator's `open` count, so the workload half needs no
      new data. **Zone representation decided 2026-09-08 (Stefan): a `strataflow.zone` model, many2many
      on `res.users`, matched to the ticket by postal-code prefix** — locked in `ARCHITECTURE.md`.
      **Ticket side decided 2026-09-09 (Stefan): a `postal_code` Char on `strataflow.workorder`**, on the
      stock form, defaulted from the requester's `zip` only when empty; "+ New ticket" and the USP feed
      populate it. Deriving from the partner was rejected: the dig site is not the billing address.
      Also decided with the map: `crewAnchors` and `planRoutes` now feed the live map's route layer
      (`routes[].coords`), so the drawn routes survive the rule change unchanged.
      The options that were weighed: (a) a `strataflow.zone` model, many2many
      on `res.users`, matched to the ticket by postal-code prefix; (b) the same model matched by ATS
      township/range off the existing `lld` field, which suits the rural dispatch this app is aimed at;
      (c) a bbox per zone matched against `latitude`/`longitude`, which reintroduces the coordinate
      dependency the decision just removed; (d) a plain Char zone on both ticket and locator that the
      dispatcher types, which is the cheapest and the easiest to get wrong.

## UI / design language

- [ ] **Verify the skeleton fade in a browser.** The strataline fade-out and map ground landed 2026-09-08
      but could not be seen running: Odoo's boot dies on `Access to storage is not allowed from this
      context` in the automation tab. Confirmed not to be our code (stashing the change reproduced the
      same failure). Check the skeleton fades rather than pops, and that the map ground lines up with the
      real background. `core/shell.js` still hides the skeleton after 4 s regardless — that fence stays
      until screen `load()` is properly awaited. **2026-09-08: the automation tab is out as a way to
      check this** — stock Odoo fails to mount there too (`/odoo/settings` gives a 108-character body),
      so it is the extension racing Odoo's boot for storage, not our code and not a site-data setting.
      Handed to Stefan to look at in a normal tab.
- [ ] **Internal screen revamp (asks 3 and 10) — NOT done; Stefan, 2026-09-10: "there is still a lot
      left to do".** `tasks/03-stock-view-sweep.md` is the next tranche, not the whole ask: when its
      seven commits are in, walk every inner page again with Stefan before calling this closed —
      the brief inventories what was known on 2026-09-09, and the navbar rebuild (`4fd32387e1c`)
      already showed the inventory was short. Steps 1–2 of the brief landed
      2026-09-09 (`8c4fe820d7f`, `da725915429`) and were seen in the automation tab; the brief's
      step-6 dialog rule (`.modal .o_form_view .o_form_sheet` flat) landed early in `0fcaae22b48`.
      Remaining, in the brief's order: (3) statusbar arrows — five `--o-statusbar-*` variables on
      `.o_field_statusbar > .o_statusbar_status`, radius 10px, hover `--chip-bg` (today `#b9bec2`);
      (4) notebook variables + `.nav` transparent, facets `bg-200 !important`, the searchview caret
      toggler's right radius (visible square seam on every list today), search panel border;
      (5) kanban: `--KanbanRecord-margin-v: 8px` + cancel the `-1px` card margin, the four highlight
      colours (`#d1ecf1` still live), quick-create, the two rot literals in `rotting_mixin.scss`
      (a rotting CRM card is still pink); (6) Settings title bands, chatter top band, empty-state
      faces, (7) `o_section_and_note_list_view` hairline, `.gray_ribbon`, and the ticket form
      `<header>` with `widget="statusbar" clickable="0"` (Decision 2 in the brief). Every acceptance
      criterion in the brief still applies. The invoice form's "outstanding credits" `alert-info` band
      is off-brief and stock blue — fold it into step 7 or leave it.
- [ ] **Stock navbar follow-ups.** The bar is the shell's top bar since `4fd32387e1c`
      (`static/src/stock/navbar.js`, `navbar.xml`, `user_menu.xml`). Not carried over on purpose: the
      theme toggle (see "Stock views, dark" — adding it back is one button in `navbar.xml` once stock
      pages can go dark) and the search pill. Small screens: the `burger_menu` systray item is kept but
      the pills have no wrap rule in `stock.scss` — check a phone width. The gradient-disc avatars are
      a CSS trick (bitmap pushed out with `object-position`); initials on them need a widget.
- [ ] **Finish looking at the live map.** Seen 2026-09-09: Dispatch in both themes, Satellite, zoom,
      pins + label, utility overlay with labels, the Locator's on-site stage and map mode. Not seen:
      route lines (demo data has 0 `new` tickets, so Auto-assign draws nothing — set one ticket back to
      `new` to check), `keepInView` panning, the "not connected" fallback. Seen since: the layer panel
      (groups, rows, safety, presets), drawing gas lines on the Locator, the review preview, the PDF.
      Not seen: Satellite under a drawing, the panel on the Locator's map mode, the Work Orders side of the canvas.
      **Basemap data question for Stefan:** at city scale (z10–12) a broad straight NW–SE band paints
      in the `water` colour across Calgary — a polygon in the `basemap` extract's `water` layer at low
      zoom, not one of our layers (it vanishes by z13). Check `basemap_calgary.pmtiles` in map-sys.
- [ ] **Stock views, dark.** Odoo CE serves one colour scheme (`ir.http.color_scheme()` is hard-coded to
      `light`); the shell's dark toggle stops at the shell. Doing it means overriding `color_scheme()`
      from a cookie the shell's toggle also sets, a `web.assets_web_dark` bundle with a
      `backend_variables.dark.scss` prepended, and a dark `stock.scss` — the variable file already mirrors
      `tokens-light`, so `tokens-dark` is the map. Also: `holdPageGround` paints `<html>` in the *shell's*
      theme for 600 ms after leaving a dark screen, so a light stock page flashes dark once.
- [ ] **Layer panel follow-ups** (the store also gains an `isolate` field in **`tasks/13-draw-filter-toggle.md`**
      and a `sub_layer` index in **`tasks/12-map-inspect-geolocate.md`** — sequence against those): the company filter (`owners.json`, session-only on strataline — needs
      a key grant like `layers.json` got); `EXCLUDED_SUBS` should become a flag in `layers.json` on
      strataline's side instead of a mirrored list in `core/layers.js`; the settings for the panel are
      per device (localStorage) — per user would mean an `ir.config_parameter`-style store on `res.users`.
- [ ] **Old pixel drawings** (folded into **`tasks/14-drawing-editing.md`** › 14a, which specifies the
      `v: 3` format and its migration): any `drawing` without `v: 2` (there were a few in the dev DB) reads as empty.
      Nothing to migrate for real tenants; clear them with
      `update strataflow_workorder set drawing='{}' where drawing::text not like '%"v": 2%'` when convenient.
- [ ] **Map follow-ups**, in no order: cluster overlapping pins at low zoom (Guideline — Maps); an ATS
      section-grid layer for rural tickets (`ats` source is granted, nothing draws it yet); dark-theme
      recolour of the grey *utility* layers (strataline's own `themedStyle` does this — only
      `metadata.dark` overrides are applied here); a tile 429 arrives as a CORS error because strataline's
      rate-limit path skips `cors()` (`serve.py` `serve_tile`, the `throttle` branch); the small faux-map
      thumbnails in the Work Orders and Locator detail panes are still decorative SVG (the drawing canvas
      and the on-site stage are live now).

Review UI work with the `apple-design` skill before and after (CLAUDE.md non-negotiable).

## Platform

- [ ] Write comprehensive docs in `README.md`. → **`tasks/11-readme.md`** (full outline, every setup
      command pre-verified; blocked on the key rotation and on whether the repo goes public).
- [x] **`/odoo` never in the address bar** (2026-09-10): the web client is served at `/app/<path>`
      (`controllers/home.py`, `static/src/core/app_url.js`) and `deploy/nginx/flow.strataline.co` 301s the
      stock prefix. See `ARCHITECTURE.md` › "Product URLs".
- [x] **Deployed to `flow.strataline.co`** (2026-09-10) on the map-sys box `74.208.133.70`; kit in
      `deploy/`, `scripts/vps_bootstrap.sh`, `scripts/vps_deploy.sh`, `.github/workflows/deploy.yml`. The box
      follows `/etc/strataflow/deploy_branch` (`feat/strataflow-workorder`); switch it to `19.0` at merge time.
- [ ] **Deploy loose ends (Stefan):** change `admin`/`admin` on prod; look at Dispatch with the live
      map. (Secrets set, record proxied, demo seeded, key `k_3f7cf1e3` minted — 2026-09-10.)
- [ ] `vps_deploy.sh`: skip the stop/`-u`/start when nothing under `addons/` or `requirements.txt`
      changed — a docs-only push takes prod down for ~30 s today.
- [ ] Deploy follow-ups: PWA manifest icons and `scope`/`start_url` still say odoo
      (`web/controllers/webmanifest.py`, needs a controller override); an `<a href="/odoo/…">` click under
      `/app` is a full page load (router's click guard, see ARCHITECTURE); `scratchpad/` still not in
      `.gitignore`.
