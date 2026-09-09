# 11 — Write the project README

The repo's front page is still Odoo's marketing README: a stranger who clones `authexinc/strataflow` learns
nothing about Strataflow, cannot start the server, and cannot find the docs that already exist. A future
session must replace `README.md` at the repo root with a Strataflow README that gets a competent engineer from
`git clone` to a running `/odoo/dispatch` with a live map, and that routes every deeper question to the
durable docs (`ARCHITECTURE.md`, `BACKLOG.md`, `DEVLOG.md`, `HANDOFF.md`, `CLAUDE.md`, `tasks/`) instead of
duplicating them.

## The ask

> "6. Write comprehensive docs in readme"

`BACKLOG.md:102` carries the same item: "Write comprehensive docs in `README.md`."

## What is true today

**The root README is untouched upstream Odoo.**
- `README.md` is 37 lines. Line 1 is `# Odoo`; lines 3–6 are runbot/docs/help/nightly badges pointing at
  `odoo.com`; lines 8–23 describe Odoo and list the Odoo Apps; line 25 is the "Getting started with Odoo"
  heading with lines 27–32 its content (odoo.com install docs, eLearning, developer tutorials); line 34 is a
  "Security" heading and lines 36–37 point security reports at `odoo.com/security-report`.
  Zero lines mention Strataflow, `addons/strataflow_workorder`, or this fork.
- `git log --oneline -- README.md` shows only upstream Odoo commits — a long history whose three most recent
  are `66bd4a014cd`, `adf70bf9dcb`, `cc4b2b2ffd2`. Nothing in this fork has ever edited it.
- The product module has no README of its own: `addons/strataflow_workorder/` contains `__init__.py`,
  `__manifest__.py`, `controllers/`, `data/`, `demo/`, `models/`, `security/`, `static/`, `views/` (plus
  gitignored `__pycache__/` and `graphify-out/`) — no `README.md`, and `static/description/` is an empty
  directory (no `index.html`, no `icon.png`). The only README under the module is the vendored library note
  `static/lib/maplibre-gl/README`, which is not documentation for this repo.

**`README.md` is referenced by upstream packaging and must keep existing at that path.**
- `MANIFEST.in:3` — `include README.md` (sdist).
- `debian/odoo.docs:1` — `README.md`; `debian/install:2` — `README.md /usr/share/doc/odoo`.
  Replacing the *content* is safe; deleting or moving the file breaks the Debian build. None of these read the
  content, only ship it.

**Other upstream-Odoo docs at the root, also untouched, that the README must not contradict.**
- `CONTRIBUTING.md` (14 lines) is Odoo's "make PRs against odoo/odoo" guide — wrong for this repo.
- `SECURITY.md` (41 lines) is Odoo's supported-versions table and disclosure policy pointing at odoo.com.
- `LICENSE` (LGPL-3) and `COPYRIGHT` are Odoo's and stay. The module declares `'license': 'LGPL-3'`
  (`addons/strataflow_workorder/__manifest__.py:8`), consistent with the root.

**The durable docs the README must point at, not restate.**
- `ARCHITECTURE.md`, 69 lines: `:7` "Locked decisions" table (tenancy `:11`, provisioning `:12`, work order
  model `:18`, data layer `:19`), `:21` "Product decisions" table (product URLs `:34`, live map `:42`),
  `:44` "Provisioner flow (Phase 2, not built)", `:50` "Required changes on strataline (Phase 0 …)",
  `:63` "Phases" table.
- `BACKLOG.md`, 106 lines: durable work queue — open questions, behaviour, UI, platform.
- `DEVLOG.md`, 784 lines, newest first, failures recorded on purpose.
- `HANDOFF.md`, 148 lines, overwritten each session, in-flight only.
- `CLAUDE.md`, 28 lines: agent instructions — session protocol (`:7`–`:11`), run commands (`:16`–`:20`),
  non-negotiables (`:22`–`:28`).
- `tasks/` exists at the repo root and is **untracked by git** (`git status` shows it as `?? tasks/`). It
  already holds the briefs this workflow has written — `01-usp-intake.md`, `04-home-hover-greeting.md`,
  `05-theme-system-mode.md`, `10-ticket-lifecycle.md`, `11-readme.md`, `12-map-inspect-geolocate.md` — one
  implementation brief per backlog item.

**The module, as it actually is** (facts the README's architecture/data-model/screens sections must match).
- `__manifest__.py:4` version `19.0.1.0.0`; `:9` `depends = ['base', 'web', 'mail', 'contacts', 'crm',
  'account', 'product']`; `:10` `external_dependencies` python `reportlab`; `:51` `post_init_hook`.
- Asset seams, `__manifest__.py:29`–`:49`: `static/scss/backend_variables.scss` **prepended** to
  `web._assets_primary_variables`, `static/scss/backend_bootstrap.scss` **prepended** to
  `web._assets_backend_helpers`, `static/scss/tokens.scss` + globbed `static/src/**` into
  `web.assets_backend`, and `tokens.scss` + `static/login/login.{scss,js}` into `web.assets_frontend`.
  Sizes: `tokens.scss` 78 lines, `backend_variables.scss` 82, `backend_bootstrap.scss` 41,
  `static/src/stock/stock.scss` 83.
- `__init__.py:5` `post_init_hook` renames stock CRM stage `crm.stage_lead3` from "Proposition" to
  "Quote sent", and only if it still carries Odoo's default name.
- Six client actions with `path`, `views/strataflow_actions.xml`: `desk` (`:9`–`:11`), `dispatch`
  (`:12`–`:14`), `workorders` (`:15`–`:17`), `pipeline` (`:18`–`:20`, action name "CRM"), `invoices`
  (`:21`–`:23`), `locator` (`:24`–`:26`). Menu items `:28`–`:34`.
- The matching `static path` on each OWL component: `static/src/screens/home.js:29` `"desk"`,
  `dispatch.js:19` `"dispatch"`, `workorders.js:39` `"workorders"`, `crm.js:15` `"pipeline"`,
  `invoices.js:15` `"invoices"`, `locator.js:27` `"locator"`. Registry tags at `home.js:96`,
  `dispatch.js:227`, `workorders.js:317`, `crm.js:73`, `invoices.js:108`, `locator.js:310`.
- `controllers/home.py:20` `HOME_URL = '/odoo/desk'`; `:48`–`:57` overrides `/` so a Strataflow user (and a
  signed-out visitor) lands on the Home screen; `:59` `_login_redirect` does the same after sign-in; `:32`
  documents that `/odoo` stays the only route back to the stock backend.
- Models: `strataflow.workorder` (`models/strataflow_workorder.py:25`, `_inherit = ['mail.thread',
  'mail.activity.mixin']`, `:27`), `strataflow.utility` (`models/strataflow_utility.py:6`), plus inherits on
  `crm.lead` (`models/crm_lead.py:5`), `account.move` (`models/account_move.py:5`), `res.partner`
  (`models/res_partner.py:5`).
- Ticket statuses, `models/strataflow_workorder.py:6`–`:13`: new → assigned → onsite → located → closed →
  invoiced; the advance map `NEXT_STEP` is `:15`–`:20`. Ticket names come from the `strataflow.workorder`
  sequence (`:63`, defined in `data/ir_sequence_data.xml:3`). `action_invoice_closed` (`:85`) raises one draft
  `account.move` per requester from closed uninvoiced tickets using product `product_locate`
  (`data/strataflow_crm_account_data.xml:8`). `action_complete_locate` (`:121`) stops at `located`.
- Screen data seams (RPC entry points the README can name): `get_board_data`
  (`models/strataflow_workorder.py:193`), `get_home_stats` (`:219`), `get_map_config` (`:147`),
  `crm.lead.get_pipeline` (`models/crm_lead.py:23`), `account.move.get_invoice_board`
  (`models/account_move.py:32`). PDF export route `/strataflow/workorder/<int:wo_id>/locate.pdf`
  (`controllers/export.py:58`).
- Security: privilege + two groups, `security/strataflow_security.xml` — `group_strataflow_user` "Locator"
  (`:12`) and `group_strataflow_manager` "Dispatcher" (`:19`), the latter implying
  `sales_team.group_sale_salesman_all_leads`, `account.group_account_invoice`, `base.group_partner_manager`.
- Strataline wiring: `get_map_config` (`models/strataflow_workorder.py:160`–`:163`) reads
  `ir.config_parameter` `strataline.api_key` and `strataline.base_url` (default
  `https://strataline.co`), and returns `connected: bool(key)`. No key ⇒ the screens draw a "not connected"
  ground instead of a map.
- Demo data, `demo/strataflow_workorder_demo.xml`: 42 records — 13 `strataflow.workorder`, 17 `res.partner`,
  9 `crm.lead`, 4 `res.users`.

**Setup facts, verified in this tree rather than copied from `HANDOFF.md`.**
- `odoo-bin` is a 6-line shim calling `odoo.cli.main()`.
- Minimum Python is 3.10 (`odoo/release.py:39` `MIN_PY_VERSION = (3, 10)`, enforced via
  `setup.py:70`). The repo's `.venv` runs **Python 3.12.8**; `requirements.txt:86` pins `reportlab==4.1.0`
  for `python_version >= '3.12'` and `:62` `psycopg2==2.9.9`. `reportlab 4.1.0` is importable from `.venv`.
- `.venv/` is gitignored (`.gitignore`, "local dev" block) — so is `graphify-out/`.
- **The database does not need `createdb`.** `odoo/cli/server.py:100`–`:113` calls
  `db._create_empty_database(db_name)` for every `-d` name at startup and swallows `DatabaseExists`, so
  `-d strataflow_dev` creates the DB if it is missing. `dropdb strataflow_dev` is still the fresh-start step.
- `--with-demo` is a real flag in this tree (`odoo/tools/config.py:233`); `--without-demo` at `:235`.
- Run command and login are `CLAUDE.md:16`–`:19`: the `.venv/bin/python odoo-bin …` line, `-u
  strataflow_workorder` after changes, `dropdb` + `-i strataflow_workorder --with-demo` for a fresh DB,
  `admin`/`admin`.
- Branch/commit convention, `CLAUDE.md:12`–`:13`: commits authored `Stefan Djordjevic <dev@authex.co>` from
  repo-local git config, on a feature branch, never pushed to `19.0` directly; merging is Stefan's call.
  Current state: `git remote -v` → `https://github.com/authexinc/strataflow`; branches `19.0` (tracking
  `origin/19.0`) and `feat/strataflow-workorder` (checked out, tracking `origin/feat/strataflow-workorder`).
  Commit subjects follow Odoo's tag style —
  `[ADD]`, `[IMP]`, `[FIX]`, `[DOC]` + `strataflow: …` (see `git log --oneline -8`).

**Secret hygiene — this is the one thing the README must actively get right.**
- The dev Strataline key `k_17c57c69` is already committed in this repo: `HANDOFF.md:22`, `HANDOFF.md:58`,
  `DEVLOG.md:80`. It is a *dev* key registered for `http://localhost:8069` origins and it lives in
  `~/map-sys/data/api_keys.json` (gitignored there), but it is a live credential in a repo that will be
  pushed to GitHub.
- The README must **not** repeat it. The setup section tells the reader to list or mint their own:
  `python3 ~/map-sys/scripts/manage_access.py key list`, or mint with
  `--origins http://localhost:8069,http://127.0.0.1:8069`.

**Nothing in the ask is factually wrong.** The one correction worth making explicit is that the ask says
"docs in readme" while the repo already holds better docs elsewhere: the README's job is a front page and an
index, not a re-telling of `ARCHITECTURE.md`.

## Decision needed

**1. Does the stock Odoo README get replaced at the root, or does Strataflow get its own README with Odoo's
preserved?**

- (a) **Replace `README.md` at the root with Strataflow's** — recommended.
- (b) Keep Odoo's at the root, add `addons/strataflow_workorder/README.md`.
- (c) Replace the root and move Odoo's copy to `doc/README.odoo.md`.

Recommendation: **(a)**. The root README is the front page of `github.com/authexinc/strataflow`, and everyone
who opens that page is here for Strataflow — Odoo's evaluation-and-marketing copy is noise that actively
misleads (its install instructions, its bug-report address, its badges point at odoo.com's runbot for a repo
that is not odoo/odoo). `CLAUDE.md:3` already frames the repo as "Odoo 19 CE fork … everything else is
upstream Odoo and is not edited", and the README is the one upstream file whose *purpose* is repo identity,
so it is the correct exception. Nothing reads the content — `MANIFEST.in:3`, `debian/odoo.docs:1` and
`debian/install:2` only ship the file, so it keeps working as long as the path exists. (c) is dead weight:
Odoo's text is one `git show 19.0:README.md` away and is on odoo/odoo forever. (b) buries the only page a new
engineer will look at three directories deep and leaves the front page wrong. The cost of (a) is a merge
conflict on `README.md` the next time upstream 19.0 touches it — a rare event; the file's three most recent
upstream commits are `66bd4a014cd`, `adf70bf9dcb`, `cc4b2b2ffd2` — resolved with `git checkout --ours
README.md`. Say so in the README's own "Relationship to upstream
Odoo" section.

**2. Is the repo going public, or staying private to authexinc?** This changes nothing structural, but if it
is public the README should carry no internal hostnames beyond `strataline.co`, and the leaked dev key
(`HANDOFF.md:22`, `:58`, `DEVLOG.md:80`) should be rotated before the push. Recommendation: write the README
as if public either way, and raise the key rotation with Stefan separately — it is not this task's fix.

**3. Do `CONTRIBUTING.md` and `SECURITY.md` get the same treatment?** They are Odoo's and are equally wrong
for this fork. Recommendation: **out of scope here**; the README links to them with one clause saying they
are upstream Odoo's and describe odoo/odoo's process, not this repo's. Add a `BACKLOG.md` › Platform line for
them rather than expanding this task.

## Plan

1. **`README.md` (root) — replace wholesale.** Overwrite all 37 lines. Keep the file at this exact path
   (`MANIFEST.in:3`, `debian/install:2` ship it). Structure, in this order, with the content below:

2. **Title + one-paragraph "What this is".** `# Strataflow`, then: an Odoo 19 CE fork sold to utility-locate
   companies; one product module, `addons/strataflow_workorder`; a custom OWL "Strataline glass" shell over
   real Odoo models. Who it is for: dispatchers who assign locate tickets and locators who work them in the
   field. One line of tenancy shape (DB-per-tenant, `<slug>.strataflow.co`) with a link to
   `ARCHITECTURE.md` › Locked decisions.

3. **"Relationship to upstream Odoo".** State: everything outside `addons/strataflow_workorder/` is stock
   Odoo 19 CE and is never edited (`CLAUDE.md:3`–`:4`); `19.0` tracks upstream, product work lands on feature
   branches; `LICENSE`/`COPYRIGHT` are Odoo's LGPL-3 and the module declares the same
   (`__manifest__.py:8`); `CONTRIBUTING.md` and `SECURITY.md` at the root are upstream Odoo's and describe
   odoo/odoo's process, not this repo's; this README replaces Odoo's, which lives at
   `git show 19.0:README.md` and on github.com/odoo/odoo.

4. **"Relationship to Strataline".** Strataline (`~/map-sys`, strataline.co) is a **separate service consumed
   over its HTTP API**. What the module actually requests today (`static/src/core/strataline_map.js:57`–`:58`,
   `:163`): map tiles, `/style.json`, `/layers.json`, `/tiles/meta` and glyphs from `/fonts/*`. Strataline's
   address/feature/LLD search is part of the Phase-0 key scope but **no Strataflow code calls `/search/*`
   yet** — do not describe it as consumed. Keyed access to `/style.json`, `/layers.json` and `/fonts/*`
   exists only on the unmerged, undeployed map-sys branch `feat/search-key-scope`
   (`KEY_ASSET_PATHS`/`KEY_ASSET_PREFIXES` in `~/map-sys/web/serve.py:86`–`:87`, head `4b08efb`); against
   deployed strataline a key still reaches `/tiles/*` only, so the map draws tiles with no labels and no
   utility overlay. `ARCHITECTURE.md:50`–`:61` records this and its line 60 is now stale on `layers.json`.
   Nothing from `map-sys` is copied into this repo (`CLAUDE.md:28`); the map style is fetched at runtime.
   Auth is a scoped API key sent as `?key=` — never a header, because Strataline has no OPTIONS handler and a
   custom header would trigger a CORS preflight that fails. Point at `ARCHITECTURE.md:42` (Live map) and
   `:50` (the Phase-0 changes on strataline, built and awaiting merge).

5. **"Architecture in brief".** Six to ten lines plus a pointer: OWL client actions registered by tag and
   `path` (`views/strataflow_actions.xml`) rendering fullscreen screens (`static/src/screens/`) inside one
   shell (`static/src/core/shell.js`); screens talk to the server through a handful of model methods
   (`get_board_data`, `get_home_stats`, `get_map_config`, `crm.lead.get_pipeline`,
   `account.move.get_invoice_board`) rather than Odoo views; the map component is
   `static/src/core/strataline_map.js` with MapLibre 5.24.0 vendored in `static/lib/maplibre-gl/`; stock Odoo
   views are restyled through the two prepended SCSS variable files plus `static/src/stock/stock.scss`.
   End with: **locked decisions and their rationale live in `ARCHITECTURE.md` — read it before changing any
   of this.**

6. **"The six screens".** A table: URL | screen | component | who sees it. Copy exactly —
   `/odoo/desk` Home `screens/home.js` (all Strataflow users);
   `/odoo/dispatch` Dispatch `screens/dispatch.js` (Dispatcher);
   `/odoo/workorders` Work Orders `screens/workorders.js` (all);
   `/odoo/pipeline` CRM `screens/crm.js` (Dispatcher);
   `/odoo/invoices` Invoices `screens/invoices.js` (Dispatcher);
   `/odoo/locator` Locator view `screens/locator.js` (all).
   Visibility comes from the menu `groups` in `views/strataflow_actions.xml:28`–`:34` and the two groups in
   `security/strataflow_security.xml:12`/`:19`. Add the three-declarations rule as a note: an action's `path`
   (`strataflow_actions.xml`), the component's `static path`, and `HOME_URL` (`controllers/home.py:20`) must
   agree, and a `path` may never equal a stock client-action tag — that is why Home is `desk`, not `home`.
   Note `/` redirects to `/odoo/desk` for Strataflow users and `/odoo` is the way back to stock Odoo
   (`controllers/home.py:23`–`:57`).

7. **"Data model".** A table: what | model | where. Rows — locate ticket | `strataflow.workorder` (new,
   `mail.thread` + `mail.activity.mixin`) | `models/strataflow_workorder.py:25`; utility type |
   `strataflow.utility` | `models/strataflow_utility.py:6`; pipeline | stock `crm.lead` + `crm.stage` +
   `crm.tag` | `models/crm_lead.py`; invoicing | stock `account.move` / `account.move.line` |
   `models/account_move.py`; customers | stock `res.partner` | `models/res_partner.py`; locators | stock
   `res.users` + two groups | `security/strataflow_security.xml`; ticket numbering | `ir.sequence` |
   `data/ir_sequence_data.xml`; the locate line item | `product.product` `product_locate` |
   `data/strataflow_crm_account_data.xml:8`. Then the status ladder new → assigned → onsite → located →
   closed → invoiced (`models/strataflow_workorder.py:6`–`:13`), the note that closing is what bills
   (`action_invoice_closed`, `:85`) and that the field "Confirm locate" stops at `located`
   (`action_complete_locate`, `:121`), and the design rule from `ARCHITECTURE.md:19`: real stock modules,
   never stand-ins.

8. **"Local development".** End-to-end, numbered, every command verified against this tree:
   prerequisites (Python ≥ 3.10 — `odoo/release.py:39`; the repo's venv runs 3.12; PostgreSQL running
   locally with a superuser role for your OS user; `wkhtmltopdf` only if you want stock Odoo reports);
   `python3 -m venv .venv` then `.venv/bin/pip install -r requirements.txt` (reportlab is required by the
   module, `__manifest__.py:10`, and pinned at `requirements.txt:86`); note `.venv/` is gitignored.
   Then **first run** — no `createdb` step, because `odoo/cli/server.py:104` creates the database:

   ```
   .venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
     -i strataflow_workorder --with-demo --http-port=8069
   ```

   (~4 minutes; pulls `crm`, `account`, `mail` — `__manifest__.py:9`. `--with-demo` is
   `odoo/tools/config.py:233` and seeds 13 tickets, 17 partners, 9 leads, 4 users from
   `demo/strataflow_workorder_demo.xml`.) Then **day-to-day**:

   ```
   .venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
     --dev=xml --http-port=8069 --log-level=warn
   ```

   plus `-u strataflow_workorder` after **any** Python/XML/JS/SCSS change — say plainly that a plain reload
   can serve a stale JS/CSS bundle (`CLAUDE.md:17`). **Fresh database:** `dropdb strataflow_dev`, re-run the
   install command, then re-insert the two `strataline.*` config parameters (next section). Sign in at
   `http://localhost:8069` with `admin` / `admin` (`CLAUDE.md:19`); a Strataflow user lands on `/odoo/desk`.

9. **"Strataline dev dependency" (its own subsection).** The map is dark without it. Steps: run Strataline
   locally (`bash ~/map-sys/scripts/app.sh start 8613`; `~/map-sys` is a separate repo, reference-only — read
   it, never execute product code from it into this repo). Then set **two** `ir.config_parameter` rows in
   the Strataflow database — `strataline.base_url` = `http://localhost:8613` and `strataline.api_key` =
   a key you list or mint yourself — and say where they are read: `get_map_config`,
   `models/strataflow_workorder.py:147`–`:163`, which defaults `base_url` to `https://strataline.co` and
   reports `connected: false` when the key is empty, which the screens render as a "not connected" ground.
   Give the key command as `python3 ~/map-sys/scripts/manage_access.py key list`, or mint with
   `--origins http://localhost:8069,http://127.0.0.1:8069`. **Do not print any key value.** Show the rows
   being set through the Odoo shell rather than raw SQL, e.g.
   `.venv/bin/python odoo-bin shell -d strataflow_dev --db_host=localhost --addons-path=addons`
   then `env['ir.config_parameter'].sudo().set_param('strataline.base_url', 'http://localhost:8613')`.
   Add the Phase-1 note from `ARCHITECTURE.md` (Tile key exposure): the key reaches the browser on purpose,
   scoped by bbox/sources/zoom/quota/origin, and is sent as `?key=` because Strataline has no preflight
   handler.

10. **"Repo map".** A table of the root docs and directories with one line each: `addons/strataflow_workorder/`
    (all product code), `addons/*` else + `odoo/` + `setup/` + `debian/` (upstream Odoo, not edited),
    `ARCHITECTURE.md` (locked decisions, provisioner flow, phase table — read before changing behaviour),
    `BACKLOG.md` (durable work queue), `DEVLOG.md` (newest-first log, failures recorded on purpose),
    `HANDOFF.md` (in-flight only, overwritten each session), `CLAUDE.md` (agent instructions), `tasks/`
    (one implementation brief per backlog item, `NN-slug.md`), `CONTRIBUTING.md` / `SECURITY.md` / `LICENSE`
    / `COPYRIGHT` (upstream Odoo's). Then a module-internals table: `models/`, `controllers/`, `views/`,
    `security/`, `data/`, `demo/`, `static/scss/` (tokens + the two prepended variable files),
    `static/src/core/`, `static/src/screens/`, `static/src/stock/`, `static/lib/maplibre-gl/`,
    `static/login/`, `static/fonts/` (Public Sans + JetBrains Mono, self-hosted, OFL included).

11. **"Working on this repo".** Branch and commit conventions from `CLAUDE.md:12`–`:13`: feature branches off
    `19.0`, never push to `19.0`, merging is Stefan's call; commits authored
    `Stefan Djordjevic <dev@authex.co>` via repo-local git config; Odoo-style subjects
    `[ADD]/[IMP]/[FIX]/[DOC] strataflow: …`. The session protocol in one line — read `HANDOFF.md`, then the
    last few `DEVLOG.md` entries, then `ARCHITECTURE.md`; log to `DEVLOG.md` and rewrite `HANDOFF.md` at the
    end. State that there are **no automated tests for the module yet** and that verification today means
    running the server and looking at the screens in a browser.

12. **"Status".** Copy the phase table's shape from `ARCHITECTURE.md:63`–`:69` in two or three lines, not
    verbatim: Phase 0 (Strataline key scope) built on `map-sys` `feat/search-key-scope`, not merged; Phase 1
    (the module: six screens, live map, restyled stock views) done; Phase 2 (template DB, provisioner,
    wildcard nginx + `dbfilter`, `/odoo` prefix strip) not started; Phase 3 (per-user tile tokens, tenant
    backup/delete, monitoring) not started. Then **what is not built**, sourced from `BACKLOG.md`: no USP
    feed integration (every ticket is `source = manual`, footers read "USP feed · not connected",
    `BACKLOG.md:13`–`:25`); auto-assign is distance-greedy today and is due to be rebuilt zone-first
    (`BACKLOG.md:29`–`:45`, `static/src/core/geo.js:45`); no `strataflow.zone` model and no `postal_code` on
    the ticket yet; stock views are light-only because Odoo CE hard-codes `ir.http.color_scheme()` to
    `light` (`addons/web/models/ir_http.py:77`); Equipment / Timesheets / Reports are deliberately
    "coming soon" tiles (`static/src/screens/home.js:18`–`:20`). Close with: **`BACKLOG.md` is the live list; this section is a
    summary and will drift — trust the backlog.**

13. **Do not add a second README** under `addons/strataflow_workorder/` and do not touch
    `static/description/`. One front page, one set of durable docs.

14. **Nothing else changes.** No edits under `addons/`, no `MANIFEST.in` or `debian/` change (the path stays),
    no rewrite of `CONTRIBUTING.md` / `SECURITY.md`.

## Files

| path | what changes |
|---|---|
| `README.md` | Replaced wholesale: Odoo's 37 lines of marketing copy out, the Strataflow README from the Plan in. Same path (packaging references it). |
| everything else | Untouched. No file under `addons/`, no `MANIFEST.in`, no `debian/*`, no `CONTRIBUTING.md` / `SECURITY.md` / `LICENSE`. |

## Landmines

- **Never print the dev Strataline API key.** `k_17c57c69` is already committed at `HANDOFF.md:22`, `:58` and
  `DEVLOG.md:80`; do not carry it into the README, which is the one file certain to be read by anyone with
  repo access. Give the `manage_access.py key list` / mint commands instead. (New finding: raise the
  already-committed key with Stefan as a rotation question — it is out of scope to fix here.)
- **The three path declarations must agree** — action `path` in `views/strataflow_actions.xml`, `static path`
  on the component, and `HOME_URL` in `controllers/home.py:20`. The README's screen table is the first place
  anyone will look these up, so get all six right and say the rule out loud, including *why* Home is
  `/odoo/desk` and not `/odoo/home` (a `path` may not equal a stock client-action tag; stock's `home` tag
  navigates to `/` and loops).
- **`-u strataflow_workorder` is not optional** after any Python/XML/JS/SCSS change. A README that omits it
  sends a new engineer chasing changes that "did nothing" while Odoo serves the previous bundle. Related and
  worth one line in the setup section: a SCSS compile error makes Odoo serve the *previous* CSS with only a
  small red banner (this is how `min(52%, 460px)` — Sass eats CSS `min()`/`max()` with mixed units — took out
  the whole bundle silently).
- **`post_init_hook` runs on install, never on `-u`** (`__init__.py:5`), and
  `data/strataflow_crm_account_data.xml` is `noupdate="1"`. If the README claims the CRM stage rename or the
  Locate-service product "applies on update", it is wrong: those land on `-i` only.
- **Assets are prepended, not appended**, in `web._assets_primary_variables` and
  `web._assets_backend_helpers` (`__manifest__.py:29`, `:32`) because Odoo's declarations are `!default`.
  If the README describes the stock-restyle seam at all, describe it that way.
- **Strataline has no OPTIONS handler**, so the key goes as `?key=` and never as a header; a 429 arrives as
  an opaque CORS error. Any README sentence about "authenticating to Strataline" must say `?key=`.
- **Nothing from `map-sys` is copied into this repo** (`CLAUDE.md:28`). The README describes Strataline as a
  service consumed over its API, never as vendored code.
- **Do not restate `ARCHITECTURE.md`.** It is the locked-decisions document; a second, drifting copy of a
  decision in the README is worse than no copy. Summarise in one clause and link.
- **`README.md` must keep its path.** `MANIFEST.in:3`, `debian/odoo.docs:1`, `debian/install:2` ship it.
- **Quote grep globs in zsh** if you go verifying claims: unquoted `--include=*.xml` expands and the flag
  silently vanishes (hit while researching this brief).

## Acceptance criteria

- [ ] `README.md` at the repo root contains no Odoo marketing copy, no runbot/nightly badges and no
      odoo.com install instructions; `grep -ci "odoo.com" README.md` returns 0 apart from the deliberate
      upstream-Odoo pointer, and the first line is `# Strataflow`.
- [ ] The file still exists at `README.md` (packaging), and `git status` shows exactly one modified tracked
      file. `tasks/` is untracked and will also appear, as `?? tasks/`; nothing else should.
- [ ] Every one of the sections in the Plan is present and in order: what this is, relationship to upstream
      Odoo, relationship to Strataline, architecture in brief, the six screens, data model, local
      development, Strataline dev dependency, repo map, working on this repo, status.
- [ ] The screens table lists all six URLs — `/odoo/desk`, `/odoo/dispatch`, `/odoo/workorders`,
      `/odoo/pipeline`, `/odoo/invoices`, `/odoo/locator` — each with its component file and who sees it,
      and matches `views/strataflow_actions.xml` and each screen's `static path`.
- [ ] The setup section takes a reader from `git clone` to a signed-in `/odoo/desk` with: venv creation,
      `pip install -r requirements.txt`, the install command with `-i strataflow_workorder --with-demo`, the
      day-to-day run command, the `-u strataflow_workorder` rule, the `dropdb` fresh path, and `admin`/`admin`.
      It does **not** tell the reader to `createdb` (Odoo does it, `odoo/cli/server.py:104`).
- [ ] The Strataline section names both config parameters (`strataline.base_url`, `strataline.api_key`),
      says where they are read (`get_map_config`), says what happens with no key ("not connected" ground),
      and contains **no key value**: `grep -E "k_[0-9a-f]{8}" README.md` returns nothing.
- [ ] The doc map lists `ARCHITECTURE.md`, `BACKLOG.md`, `DEVLOG.md`, `HANDOFF.md`, `CLAUDE.md` and `tasks/`
      with one line each, and no decision from `ARCHITECTURE.md` is restated with its full rationale.
- [ ] The status section states the four phases and names at least: no USP feed, auto-assign still
      distance-greedy, stock views light-only, no module tests — and defers to `BACKLOG.md`.
- [ ] The branch/commit section states: feature branches, never push `19.0`, commits authored
      `Stefan Djordjevic <dev@authex.co>`, Odoo-style `[TAG] strataflow: …` subjects.
- [ ] No file under `addons/` was created, edited or deleted.
- [ ] Every relative link in the README resolves (`ARCHITECTURE.md`, `BACKLOG.md`, `DEVLOG.md`,
      `HANDOFF.md`, `CLAUDE.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
      `addons/strataflow_workorder/...` paths).

## Verification

Documentation is verified by executing it, not by reading it. Run the README's own instructions on a fresh
database and confirm each step does what the README says.

```bash
cd /Users/stefan/strataflow

# 1. Only README.md changed, and it is no longer Odoo's.
git status --short                       # expect: " M README.md" plus the untracked "?? tasks/", nothing else
head -1 README.md                        # expect: # Strataflow
grep -n "runbot\|nightly.odoo.com\|scale-up-business-game" README.md   # expect: no output

# 2. No credential leaked into the README.
grep -nE "k_[0-9a-f]{8}" README.md       # expect: no output

# 3. Every relative link resolves.
grep -oE "\]\(([^)#h][^)]*)\)" README.md | sed 's/](\(.*\))/\1/' | while read -r p; do
  [ -e "$p" ] || echo "BROKEN: $p"
done                                     # expect: no output

# 4. Walk the setup section for real.
dropdb strataflow_dev
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  -i strataflow_workorder --with-demo --http-port=8069 --log-level=warn
# expect: the DB is created without a createdb step, install finishes (~4 min), no traceback.

# 5. Set the two Strataline parameters exactly as the README describes, then run day-to-day.
.venv/bin/python odoo-bin shell -d strataflow_dev --db_host=localhost --addons-path=addons
#   env['ir.config_parameter'].sudo().set_param('strataline.base_url', 'http://localhost:8613')
#   env['ir.config_parameter'].sudo().set_param('strataline.api_key', '<your own key>')
#   env.cr.commit()
bash ~/map-sys/scripts/app.sh start 8613
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  --dev=xml --http-port=8069 --log-level=warn
```

In the browser (the automation tab, not an HTTP check — "verified server-side" is not verified):

1. `http://localhost:8069/` — signed out, it lands on the login page and after `admin`/`admin` it opens
   `/odoo/desk`, the Home screen, exactly as the README's "Local development" section claims.
2. Visit each of the six URLs the screens table lists and confirm each one opens the named screen:
   `/odoo/desk`, `/odoo/dispatch`, `/odoo/workorders`, `/odoo/pipeline`, `/odoo/invoices`, `/odoo/locator`.
   Any URL in the table that 404s or lands on the app switcher is a wrong row, not a bug to work around.
3. On `/odoo/dispatch`, confirm the map draws tiles — that is the two `strataline.*` parameters proving the
   README's Strataline section is complete. Then blank `strataline.api_key` and reload: the screen must show
   the "not connected" ground the README describes.
4. `/odoo` still reaches the stock Odoo backend (the README's escape-hatch claim), and demo data is present:
   Work Orders lists tickets from `demo/strataflow_workorder_demo.xml`.

No `-u strataflow_workorder` is needed for this task — the README is not an asset — but any follow-up change
under `addons/` in the same session does need it.
