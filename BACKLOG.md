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
- [ ] **How can "Auto-assign" actually work?** Currently a stub. Needs an assignment rule — nearest available
      locator, load balance, skill/zone match, or a mix — plus a source of truth for locator position.
      `screens/dispatch.js:95` `crewAnchors` derives distance from each locator's *current ticket*, not GPS,
      and `planRoutes` (`core/geo.js:45`) is greedy nearest-neighbour presented as a suggestion. Decide whether
      real locator GPS is in scope before building this. **Asked 2026-09-08, not yet answered** — the
      options put to Stefan were: keep the current-ticket approximation; add real locator GPS (needs a
      position source, a field, and a staff-tracking privacy call); assign by workload or zone/skill
      instead of distance; or leave it stubbed.

## Behaviour / correctness

- [ ] **Add a "+ New ticket" button to the Strataflow shell** (Stefan, 2026-09-08 — locked in
      `ARCHITECTURE.md` › "Product decisions"). Match the existing `+ New lead` (`screens/crm.js`
      `newLead`) and `+ New invoice` (`screens/invoices.js` `newInvoice`), which open the stock form in a
      dialog — so the same treatment on Work Orders, and probably Dispatch too. Required fields are
      `address` and `dig_date`; `create()` stamps the sequence and auto-links the requester's won
      `crm.lead`. It should write `source = 'manual'` (the default), leaving `usp` for the feed.

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
