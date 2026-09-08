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

- [ ] **Add a "+ New ticket" button to the Strataflow shell** (Stefan, 2026-09-08 — locked in
      `ARCHITECTURE.md` › "Product decisions"). Match the existing `+ New lead` (`screens/crm.js`
      `newLead`) and `+ New invoice` (`screens/invoices.js` `newInvoice`), which open the stock form in a
      dialog — so the same treatment on Work Orders, and probably Dispatch too. Required fields are
      `address` and `dig_date`; `create()` stamps the sequence and auto-links the requester's won
      `crm.lead`. It should write `source = 'manual'` (the default), leaving `usp` for the feed.

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
      new data. **Still to decide before building: how a zone is represented and how a ticket gets one.**
      The options, so the next session does not re-derive them: (a) a `strataflow.zone` model, many2many
      on `res.users`, matched to the ticket by postal-code prefix; (b) the same model matched by ATS
      township/range off the existing `lld` field, which suits the rural dispatch this app is aimed at;
      (c) a bbox per zone matched against `latitude`/`longitude`, which reintroduces the coordinate
      dependency the decision just removed; (d) a plain Char zone on both ticket and locator that the
      dispatcher types, which is the cheapest and the easiest to get wrong.

## UI / design language

- [ ] Port the strataline login screen style to strataflow (`~/map-sys/web/login.js` + `app.css` tokens).
      Consume the design, do not copy map-sys source into this repo.
- [ ] **Verify the skeleton fade in a browser.** The strataline fade-out and map ground landed 2026-09-08
      but could not be seen running: Odoo's boot dies on `Access to storage is not allowed from this
      context` in the automation tab. Confirmed not to be our code (stashing the change reproduced the
      same failure). Check the skeleton fades rather than pops, and that the map ground lines up with the
      real background. `core/shell.js` still hides the skeleton after 4 s regardless — that fence stays
      until screen `load()` is properly awaited.
- [ ] Revamp every internal screen — individual invoices, the CRM record views, and the rest of the stock
      form/list views — into the strataflow language. Swap Odoo styling out across all pages, not just the six
      fullscreen OWL screens.
- [ ] `.o_sf_btn--primary` (the in-page primary button: "Assign to X", "Confirm locate", "Create invoices
      from tickets") still uses the `ink-btn` mixin, so ink continues to mean both "selected nav" and
      "primary action" away from the top bar. The top-bar pill was split to accent on 2026-09-08; decide
      whether these follow, ideally alongside the internal-screen revamp above.

Review UI work with the `apple-design` skill before and after (CLAUDE.md non-negotiable).

## Platform

- [ ] Drop Odoo branding from the URL structure. The Home screen should be the base URL, not
      `/odoo/action-strataflow_workorder.action_strataflow_home`. Affects routing, menus and every bookmark in
      the handoff; scope it before touching it.
- [ ] Write comprehensive docs in `README.md`.
