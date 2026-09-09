# Backlog

Durable work queue for `addons/strataflow_workorder`. `HANDOFF.md` holds only what is in flight this session;
anything that should survive a `/wrap` lives here. Add to the bottom of a section, strike nothing — move a
finished item to `DEVLOG.md` and delete the line.

Locked product decisions are in `ARCHITECTURE.md` › "Product decisions" and are not reopened here.

---

## Open questions (answer before the dependent work is planned)

- [ ] **How do we actually hook into the USP feed?** No integration exists today; tickets are created by hand.
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

- [ ] **Rebuild Auto-assign as zone-first, workload-tiebreak** (Stefan, 2026-09-08 — locked in
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
- [ ] **Finish looking at the stock-view revamp.** Seen 2026-09-09 in the automation tab (it boots the
      web client again): Settings, the Records list, the ticket form + chatter — all fine. Not yet seen:
      a CRM lead, an invoice, a kanban, a dialog, a dropdown, the statusbar arrows. Settings' section
      title bands (`--settings__title-bg`) are heavier than the rest; consider `var(--chip-bg)`.
- [ ] **Finish looking at the live map.** Seen 2026-09-09: Dispatch in both themes, Satellite, zoom,
      pins + label, utility overlay with labels, the Locator's on-site stage and map mode. Not seen:
      route lines (demo data has 0 `new` tickets, so Auto-assign draws nothing — set one ticket back to
      `new` to check), the layers toggle, `keepInView` panning, the "not connected" fallback.
      **Basemap data question for Stefan:** at city scale (z10–12) a broad straight NW–SE band paints
      in the `water` colour across Calgary — a polygon in the `basemap` extract's `water` layer at low
      zoom, not one of our layers (it vanishes by z13). Check `basemap_calgary.pmtiles` in map-sys.
- [ ] **Stock views, dark.** Odoo CE serves one colour scheme (`ir.http.color_scheme()` is hard-coded to
      `light`); the shell's dark toggle stops at the shell. Doing it means overriding `color_scheme()`
      from a cookie the shell's toggle also sets, a `web.assets_web_dark` bundle with a
      `backend_variables.dark.scss` prepended, and a dark `stock.scss` — the variable file already mirrors
      `tokens-light`, so `tokens-dark` is the map. Also: `holdPageGround` paints `<html>` in the *shell's*
      theme for 600 ms after leaving a dark screen, so a light stock page flashes dark once.
- [ ] **Map follow-ups**, in no order: cluster overlapping pins at low zoom (Guideline — Maps); an ATS
      section-grid layer for rural tickets (`ats` source is granted, nothing draws it yet); dark-theme
      recolour of the grey *utility* layers (strataline's own `themedStyle` does this — only
      `metadata.dark` overrides are applied here); a tile 429 arrives as a CORS error because strataline's
      rate-limit path skips `cors()` (`serve.py` `serve_tile`, the `throttle` branch); the small faux-map
      thumbnails in the Work Orders and Locator detail panes are still decorative SVG.

Review UI work with the `apple-design` skill before and after (CLAUDE.md non-negotiable).

## Platform

- [ ] Write comprehensive docs in `README.md`.
- [ ] **nginx `/odoo` prefix strip at the tenant edge** (2026-09-08, with Phase 2):
      `https://<slug>.strataflow.co/dispatch` proxies to `/odoo/dispatch`, and the web client's own
      `/odoo/...` URLs are rewritten on the way out. Replaces the reverted in-app root-path serving
      (`b13cadcd239`); see `ARCHITECTURE.md` › "Product URLs".
