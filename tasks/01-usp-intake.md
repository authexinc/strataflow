# 01 — USP feed intake and how tickets get created

A future session must deliver the **one seam every USP transport lands on**: a public `usp_intake` method on
`strataflow.workorder` that takes normalized ticket dicts and creates-or-updates idempotently, a `usp_ref`
field with a real uniqueness constraint, and `source='usp'` finally being set by code instead of only by demo
XML. It must **not** deliver a fetcher: Utility Safety Partners does not publish its ALP ticket-delivery
specification, so the transport is unknown and only Stefan can obtain it. Building the seam first means that
when the transport arrives it is a 100-line adapter, not a redesign — and until then the model can already be
fed by hand, by RPC, or by a test. This matters because today `source='usp'` is a label on demo data and
nothing else: there is no external intake of any kind in this codebase.

## The ask

> "1. How are we actually hooking into the USP feed?"

> "5. How are tickets created?"

## What is true today

### Item 5 — how a ticket is born, end to end

There is exactly **one** code path that creates a `strataflow.workorder`, and it is
`models/strataflow_workorder.py:59-69`. Everything else is a caller of it.

`create` is `@api.model_create_multi` and does two things per vals dict:

- `models/strataflow_workorder.py:62-63` — if `name` is missing or still the `_('New')` placeholder, it draws
  the next value from the `strataflow.workorder` sequence. That sequence is
  `data/ir_sequence_data.xml:3-9`: prefix `T-%(y)s-`, padding 5, `number_next` 4150, so tickets read
  `T-26-04150`. The file is `noupdate="1"` (`data/ir_sequence_data.xml:2`), so editing it does nothing on
  `-u`.
- `models/strataflow_workorder.py:64-68` — if a `requester_id` was given and no `lead_id`, it back-fills
  `lead_id` with that partner's most recently closed won `crm.lead` (`stage_id.is_won = True`, ordered
  `date_closed desc`, limit 1). This is what makes the CRM smart button on `crm.lead`
  (`views/strataflow_workorder_views.xml:60-71`) show a count.

`name` is `required=True, copy=False, readonly=True` with `default=lambda self: _('New')`
(`models/strataflow_workorder.py:30`). `address` is `required=True` with **no default**
(`models/strataflow_workorder.py:31`). `dig_date` is `required=True` but defaults to today
(`models/strataflow_workorder.py:38`). `received_at` is `readonly=True` and defaults to now
(`models/strataflow_workorder.py:52`). The model inherits `mail.thread` and `mail.activity.mixin`
(`models/strataflow_workorder.py:27`).

Three callers reach that `create`:

1. **The stock Odoo form view.** `views/strataflow_workorder_views.xml:21-53` is a plain form (address, lld,
   parcel, status, emergency, dig_date, source, requester, contact, locator, invoice, utilities, lat/long,
   scope note, `<chatter/>`). It is opened by the act_window
   `action_strataflow_workorder_records` (`views/strataflow_workorder_views.xml:54-58`), reachable from the
   Records menu (`views/strataflow_workorder_views.xml:97-98`).
2. **The shell's "+ New ticket" buttons**, which are not a separate path — they `doAction` into that same
   stock form. `static/src/screens/workorders.js:223-228` (`newTicket()`), fired by the button at
   `static/src/screens/workorders.xml:7` (dispatchers only, `t-if="state.data.me.is_dispatcher"`); and
   `static/src/screens/dispatch.js:201-206`, fired by `static/src/screens/dispatch.xml:13`. Both build
   `{type: "ir.actions.act_window", res_model: "strataflow.workorder", views: [[false, "form"]],
   target: "current"}`. Neither passes a default context, so a ticket created from Dispatch is identical to
   one created from the Records menu.
3. **Demo XML.** `demo/strataflow_workorder_demo.xml` seeds the ticket set; ORM `create` runs for each
   record, but because each record supplies an explicit `<field name="name">T-26-…`, the sequence branch at
   `models/strataflow_workorder.py:62` never fires for demo data.

There is **no** create call from the OWL client. Every `orm.call` in `static/src` is a read or an action:
`get_board_data`, `get_home_stats`, `get_map_config`, `get_pipeline`, `get_invoice_board`, `action_assign`,
`action_advance`, `action_complete_locate`, `action_invoice_closed` (18 call sites across
`static/src/core/strataline_map.js:38`, `static/src/screens/{dispatch,locator,crm,invoices,home,workorders}.js`).
No `orm.create`, no `web_save` from our code.

Access to create is broad: `security/ir.model.access.csv:2` gives `group_strataflow_user`
read/write/create (not unlink); `security/ir.model.access.csv:3` gives `group_strataflow_manager` all four.

### Item 1 — how we hook into the USP feed

**We do not. There is no external intake in this module of any kind.** A grep across every `.py`, `.xml` and
`.js` under `addons/strataflow_workorder` for `ir.cron`, `mail.alias`, `alias_id`, `auth='public'`,
`message_new` and `message_update` returns nothing. Concretely:

- No `ir.cron` record and no cron data file — `__manifest__.py:11-20` lists eight data files, none of them a
  scheduler.
- No mail alias, no `mail.alias.mixin` on the model, no `message_new`/`message_update` override
  (`models/strataflow_workorder.py` has none), even though the model is a `mail.thread`
  (`models/strataflow_workorder.py:27`).
- No public HTTP route. The module has exactly two controllers: `controllers/home.py` (overrides `/` and the
  post-login redirect) and `controllers/export.py:58`, one route
  `/strataflow/workorder/<int:wo_id>/locate.pdf` with `auth='user'`. Nothing is `auth='public'`, nothing is a
  webhook.

The `source` field exists and already carries the value: `models/strataflow_workorder.py:39` is
`Selection([('usp', 'USP feed'), ('manual', 'Manual entry')], default='manual', required=True)`. **No code
anywhere sets `'usp'`.** The only writers are eight demo records —
`demo/strataflow_workorder_demo.xml:47, 55, 63, 81, 90, 99, 116, 125` — and a human picking it in the form
(`views/strataflow_workorder_views.xml:36`).

The UI already tells the truth about this, in hard-coded strings: `static/src/screens/home.xml:36` renders
"USP feed · not connected · manual entry" and `static/src/screens/dispatch.xml:92` renders "USP feed · not
connected", both with a `o_sf_dot--closed` dot. Neither is driven by any state.

**The dedupe gap is real.** The model has no external reference field of any kind
(`models/strataflow_workorder.py:30-57` is the complete field list). `name` is our own sequence value, drawn
at create time. So if the same USP ticket arrives twice — a resend, a second notice, a revision, an
at-least-once delivery — there is nothing to match on and we would create a second ticket with a second
`T-26-xxxxx` number. There is also no status for a cancelled dig: `STATUSES`
(`models/strataflow_workorder.py:6-13`) is new / assigned / onsite / located / closed / invoiced only.

### What the client sees of `source`

`_ticket_payload` (`models/strataflow_workorder.py:172-190`) ships the **label**, not the key:
`models/strataflow_workorder.py:180` is `dict(self._fields['source'].selection)[t.source]`, so the browser
receives `"USP feed"` / `"Manual entry"`. That string is rendered raw at
`static/src/screens/dispatch.xml:33` and `:57`, `static/src/screens/workorders.xml:64`,
`static/src/screens/locator.xml:96`, and lands in the audit trail (`static/src/screens/workorders.js:132`)
and the CSV export (`static/src/screens/workorders.js:304-305`). Any code that wants to test for USP-ness in
the browser is testing a translated label — worth knowing before adding a filter.

### Stock Odoo seams that exist in THIS tree (verified, not remembered)

- **Inbound mail routing**: `addons/mail/models/mail_thread.py:1122` `message_route`. At
  `addons/mail/models/mail_thread.py:1294` the route tuple is built as
  `(alias.alias_model_id.model, alias.alias_force_thread_id, ast.literal_eval(alias.alias_defaults), user_id, alias)`
  — i.e. `alias_defaults` becomes `custom_values` passed to `message_new`.
- `addons/mail/models/mail_thread.py:1343` `_message_route_process`; at `:1352` it raises unless the target
  model has `message_new` (or `message_update` for an existing thread); at `:1373` it calls
  `ModelCtx.message_new(message_dict, custom_values)` and at `:1374-1379` any exception is turned into an
  alias bounce with `_alias_bounce_incoming_email(..., set_invalid=True)`.
- `addons/mail/models/mail_thread.py:1515` default `message_new`, `:1548` default `message_update`.
- **`mail.alias`**: `addons/mail/models/mail_alias.py:32` (`_name`), with `alias_name` `:39`,
  `alias_model_id` `:48`, `alias_defaults` `:56`, `alias_contact` `:73`, `alias_incoming_local` `:84`,
  `alias_status` `:88`.
- **Mail fetching**: `addons/mail/models/fetchmail.py:91` `fetchmail.server` (IMAP/POP), `:237` `fetch_mail`,
  `:245` `_fetch_mails`; driven by the stock cron `addons/mail/data/ir_cron_data.xml:40-49`
  ("Mail: Fetchmail Service", `model._fetch_mails()`, every 5 minutes, `active` **False** until a server is
  configured).
- `mail` is already a dependency (`__manifest__.py:9`), so all of the above is installed today.
- **`ir.cron`**: `odoo/addons/base/models/ir_cron.py:99` with `interval_number` `:112`, `interval_type`
  `:113`, `nextcall` `:118`, `active` `:111`.
- **Constraints, Odoo 19 style**: `odoo/orm/table_objects.py:79` `Constraint`, `:185` `UniqueIndex`. This
  module already uses the class-attribute form at `models/strataflow_utility.py:15`
  (`_code_uniq = models.Constraint('unique(code)', …)`); the old `_sql_constraints` list is not used here.
- **RPC reachability**: `odoo/service/model.py:45-71` `get_public_method`. `:54` rejects any name starting
  with `_`, and `:61-63` rejects a Python `@classmethod` outright ("cannot be called remotely"). **The intake
  seam therefore must be a normal method decorated `@api.model` — not a `classmethod` and not
  underscore-prefixed** — or the strataline-side transport is dead on arrival.
- **Utilities to map onto**: `strataflow.utility` has a unique `code` (`models/strataflow_utility.py:11,15`)
  and ships exactly four rows: `gas`, `power`, `telecom`, `water`
  (`data/strataflow_utility_data.xml:4-15`, `noupdate="1"`).

### Tenancy constraint

`ARCHITECTURE.md:11` locks **DB-per-tenant** (`<slug>.strataflow.co` → `dbfilter=^%d$`). Tickets must
therefore reach *each* tenant database; there is no shared table to write into. `BACKLOG.md:13-25` records
this as a deliberately unanswered second decision (module-side `ir.cron` per tenant vs. one strataline-side
service writing into tenant DBs over JSON-RPC), and explicitly notes that answering it before the transport
is known is guesswork, because an email-in alias has no fetch step at all.

### What is known about USP delivery (web research, 2026-09)

Utility Safety Partners does **not** publish its ALP ticket-delivery specification. Its public site says only
that a copy of the ticket is emailed to the requester, and that USP "provides ticket processing capabilities
for its members in line with the ALP requirements". Locate contractors in North America commonly sit behind a
third-party ticket management system (Irth, Norfield Newtin) rather than receiving from the one-call centre
directly; Norfield's public material says it delivers "via email or through a TMS". Treat all of this as
context, not specification.

## Decision needed

**1. Which transport?** Blocked on USP — see "Questions for USP" in the Plan. The four realistic shapes, on
the axes that actually differ for this codebase:

| | New service? | Credentials per tenant? | Dedupe | Updates / cancellations | Where parsing lives |
|---|---|---|---|---|---|
| **Email alias** (USP or the TMS mails a per-tenant address) | No. `mail` is already installed (`__manifest__.py:9`); needs a `fetchmail.server` or a catchall MX plus the stock cron at `addons/mail/data/ir_cron_data.xml:40-49` | No outbound credentials; one mailbox per tenant | On `usp_ref` parsed out of the body/attachment. Mail's own Message-Id threading (`mail_thread.py:1122`) does **not** help: an updated ticket is a fresh email, not a reply | Whatever the mail says; a cancellation notice is just another email | One `message_new` override per tenant DB, shipped in the module |
| **Polled vendor API** (Irth / Norfield / USP REST or SFTP drop) | No new service if it is an `ir.cron` in the module | **Yes** — every tenant DB needs its own member credentials in `ir.config_parameter` | On the vendor's ticket number → `usp_ref` | Whatever the API models; usually a revision counter, which is the cleanest case | An `ir.cron` per tenant; a parser fix means upgrading every tenant DB |
| **Strataline-side fetcher** writing over JSON-RPC | **Yes** — a second service, in the shape of the Phase 2 provisioner (`ARCHITECTURE.md:15`) | One credential set, held centrally; but the service needs write access into every tenant DB | Same, done inside `usp_intake` | Same | One place to fix and monitor. Requires `usp_intake` to be RPC-callable — see `odoo/service/model.py:54, 61` |
| **Portal scrape** | Same as polled API, plus fragility | Yes, a portal login per tenant | Same | Same; cancellations are easy to miss when they are a status change on a page | Worst case: HTML parsing, per tenant |

**Recommendation — assume email-in as the default, and say so in writing.** Reasons: USP's only public
statement about delivery is that the ticket is emailed; email needs no new service and no outbound
credentials; it is push, which inverts the DB-per-tenant fan-out problem (each tenant advertises its own
address, no central fetcher needs write access to every DB); and the seam below makes it a `message_new`
override of about 40 lines. **This is an assumption, not a finding.** Do not build a fetcher on it.

**2. How is a cancelled dig represented?** `STATUSES` (`models/strataflow_workorder.py:6-13`) has no
`cancelled`. Options: (a) add `('cancelled', 'Cancelled')` to `STATUSES`; (b) post a chatter note only and
leave the ticket in the queue. **Recommend (a)** — a dispatcher must not roll a truck to a cancelled dig, and
the ripple is bounded and enumerable: `OPEN_STATUSES` (`models/strataflow_workorder.py:21`), `NEXT_STEP`
(`:15-20`, no entry needed — a cancelled ticket cannot advance), `get_home_stats`
(`:224-231`), and the status chips/filters in `static/src/screens/workorders.xml`,
`static/src/screens/dispatch.xml`, `static/src/screens/locator.xml`. It is more work than (b) and can be
deferred to a follow-up task; if deferred, `usp_intake` must still record the cancellation in the chatter so
nothing is silently lost.

**3. Unknown requester on an inbound ticket.** Options: (a) create a `res.partner` from the excavator name
and email on the ticket; (b) leave `requester_id` empty and let a dispatcher fix it. **Recommend (a)** —
`requester_id` empty means `action_invoice_closed` (`models/strataflow_workorder.py:88`) silently skips the
ticket forever, and the `lead_id` back-fill at `models/strataflow_workorder.py:64-68` never runs. Creating
the partner keeps both paths alive; a duplicate contact is cheaper than an unbillable ticket.

**4. Where the fetcher eventually lives** (`BACKLOG.md:18-25`) — **do not decide it in this task.** The seam
below is identical under all four transports. If the answer to (1) is email, the question dissolves: intake
is Odoo-side by construction.

## Plan

Steps 1–6 are the deliverable. Step 7 is the human step that unblocks everything else.

1. **`models/strataflow_workorder.py`** — add three fields next to `source` (after line 39):
   - `usp_ref = fields.Char('USP ticket', copy=False, index='btree_not_null', help='The one-call centre ticket number. Unique; the dedupe key for the feed.')`
   - `usp_revision = fields.Char('USP revision', copy=False, help='Version marker for the same USP ticket; a higher value replaces the ticket content.')`
   - `usp_payload = fields.Json('USP payload', copy=False, help='The normalized dict the intake last applied. Kept for replay and for debugging a parser.')`

   and the constraint, in the class-attribute style this module already uses
   (`models/strataflow_utility.py:15`):
   `_usp_ref_uniq = models.Constraint('unique(usp_ref)', 'This USP ticket has already been imported.')`
   Postgres allows many NULLs under a unique constraint but only one `''`, so step 3 must normalize.

2. **`models/strataflow_workorder.py`** — add the seam, immediately after `create`. **`usp_intake` is
   `@api.model`, public, and not a Python `classmethod`** (`odoo/service/model.py:54, 61-63`):

   ```python
   USP_FIELDS = ('address', 'lld', 'parcel', 'latitude', 'longitude', 'dig_date',
                 'emergency', 'contact', 'scope_note')

   @api.model
   def usp_intake(self, tickets):
       """Create or update locate tickets from a normalized USP feed. Idempotent.

       `tickets` is a list of dicts. The only required key is `usp_ref`; `address`
       is required on creation (models/strataflow_workorder.py:31 has no default).

           {'usp_ref': '2026091200123',      # the one-call ticket number, our dedupe key
            'revision': '01',                # optional; a change means "replace the content"
            'cancelled': False,              # a cancellation notice for an existing ticket
            'address': '2204 12 Ave SE',
            'lld': None, 'parcel': None,
            'latitude': 51.0397, 'longitude': -114.0186,
            'dig_date': '2026-09-14',        # date or ISO string
            'emergency': False,
            'requester': {'name': 'Ledcor Group', 'email': ..., 'phone': ...},
            'contact': '403 555 0117',
            'scope_note': 'Water service repair …',
            'utilities': ['gas', 'power'],   # strataflow.utility codes, see data/strataflow_utility_data.xml
            'raw': {...}}                    # whatever the transport had; stored on usp_payload

       Every transport — email alias, polled vendor API, strataline-side fetcher —
       normalizes to this and calls this method. Nothing else about intake is shared.
       Returns {'created': ids, 'updated': ids, 'skipped': ids, 'errors': [{'usp_ref', 'error'}]}.
       """
   ```

   Behaviour, per dict:
   - reject with an `errors` entry if `usp_ref` is missing/blank, or if `address` is missing on a create;
   - `search([('usp_ref', '=', ref)], limit=1)` with `sudo()`;
   - **not found and not cancelled** → `create` with `source='usp'`, `usp_ref`, `usp_revision`,
     `usp_payload`, the mapped `USP_FIELDS`, `requester_id` from step 4 and `utility_ids` from step 5. Do
     **not** pass `name` — leave it to the sequence branch at `models/strataflow_workorder.py:62-63`;
   - **found, same revision** → skip (this is the resend case, and the whole point of the field);
   - **found, different revision** → `write` the `USP_FIELDS` plus `usp_revision`/`usp_payload`, and
     `message_post(..., subtype_xmlid='mail.mt_note')` naming what changed. Never write `status`,
     `locator_id`, `move_id` or the timestamps — a revision from USP must not undo dispatch work;
   - **cancelled** → per decision 2: `message_post` the cancellation always, and set the status only if the
     `cancelled` status is added;
   - **not found and cancelled** → record in `skipped`, not `errors`;
   - wrap each dict in `try/except` and a `savepoint` (`with self.env.cr.savepoint():`) so one bad ticket in a
     batch of forty does not roll back the other thirty-nine;
   - guard the entry point: `if not self.env.user.has_group('strataflow_workorder.group_strataflow_manager') and not self.env.su: raise AccessError(...)`. A public method is callable over RPC by anyone with model
     access, and `security/ir.model.access.csv:2` gives every locate user create rights.

3. **`models/strataflow_workorder.py:59-69`** — in the existing `create` loop, normalize
   `vals['usp_ref']` to `False` when it is blank, so the unique constraint from step 1 does not fire on the
   second manually created ticket. One line.

4. **`models/strataflow_workorder.py`** — private helper `_usp_partner(self, requester)`: match
   `res.partner` on `email_normalized` (or `email`) first, then exact `name`; create with
   `is_company=True` when nothing matches (decision 3). Returns an id or `False`. Leaving it to `create` is
   deliberate: passing `requester_id` in the create vals is what triggers the won-lead back-fill at
   `models/strataflow_workorder.py:64-68`.

5. **`models/strataflow_workorder.py`** — private helper `_usp_utilities(self, codes)`: case-insensitive
   match against `strataflow.utility.code` (`models/strataflow_utility.py:11`, four rows in
   `data/strataflow_utility_data.xml:4-15`); returns `[(6, 0, ids)]`. Codes with no match are appended to
   `scope_note` as `Unmapped utilities: …` rather than dropped — a locator must not go to site without
   knowing a fifth utility was requested.

6. **`views/strataflow_workorder_views.xml`** — put the new fields where a human can see them:
   `usp_ref` and `usp_revision` on the form beside `source` (after line 36), both `readonly="1"`; `usp_ref`
   on the list view (after line 10). Leave `usp_payload` off both views. Also add `usp_ref` to
   `_ticket_payload` (`models/strataflow_workorder.py:176-190`) so the shell can show it — a dispatcher on
   the phone to USP needs the centre's number, not ours — and render it next to Source at
   `static/src/screens/workorders.xml:64` and `static/src/screens/dispatch.xml:57`.

7. **No fetcher, no cron, no alias, no route in this task.** Instead, write down the questions and give them
   to Stefan. Put them in `BACKLOG.md` under the existing open question at `BACKLOG.md:13`:

   1. Do you deliver ALP tickets to member locate contractors directly, or only through a ticket management
      system (Irth, Norfield Newtin, other)? Which one do our members use?
   2. If by email: from which sending address(es), to an address we choose per company? Is the ticket plain
      text in the body, or an attachment (PDF, XML, CSV, fixed-width)? Is a machine-readable format offered?
   3. Is there a written ticket format specification — field list, encoding, line format — and can we have a
      copy?
   4. What is the ticket-number format, and is the number stable across revisions? Is there an explicit
      revision or sequence number on each delivery?
   5. How are updates, second notices, re-marks and **cancellations** delivered — the same number with a new
      revision, or a new number referencing the old?
   6. Is there an API (REST / SOAP / SFTP drop) and what authentication does it use? Are credentials issued
      per member company?
   7. Is there a sandbox or test feed, and can we get a set of sample tickets (including one cancellation and
      one revision)?
   8. What is the delivery SLA, and how are emergency tickets delivered — same channel, or phoned as well?
   9. **Is a positive response / close-out required back to USP, and over what channel?** If yes, intake is
      bidirectional and this brief covers only half the integration.
   10. What daily volume should we expect per member, and is duplicate delivery expected (at-least-once)?

8. **`tests/` (new)** — `tests/__init__.py` and `tests/test_usp_intake.py`, a `TransactionCase`. Odoo
   imports `<module>/tests` on its own, so do **not** add an import to the module's root `__init__.py`; but
   `tests/__init__.py` **must** contain `from . import test_usp_intake`, because
   `odoo/tests/loader.py:56-66` only collects submodules named `test_*` that are already members of
   `<module>.tests`. Cover: create sets
   `source='usp'` and a `T-26-` name from the sequence; the same dict twice creates one ticket; a changed
   revision updates `address` but leaves `status` and `locator_id` alone; a blank `usp_ref` is an error not a
   crash; two manual tickets with no `usp_ref` both save (the NULL case); an unknown utility code lands in
   `scope_note`.

## Files

| path | what changes |
|---|---|
| `addons/strataflow_workorder/models/strataflow_workorder.py` | New `usp_ref` / `usp_revision` / `usp_payload` fields and the `unique(usp_ref)` constraint; new `usp_intake` (`@api.model`, public), `_usp_partner`, `_usp_utilities`; one blank-to-`False` line in the existing `create`; `usp_ref` added to `_ticket_payload` |
| `addons/strataflow_workorder/views/strataflow_workorder_views.xml` | `usp_ref` + `usp_revision` readonly on the form beside `source`; `usp_ref` on the list |
| `addons/strataflow_workorder/static/src/screens/workorders.xml` | USP ref rendered in the ticket detail beside Source (line 64) |
| `addons/strataflow_workorder/static/src/screens/dispatch.xml` | USP ref rendered in the ticket detail beside Source (line 57) |
| `addons/strataflow_workorder/tests/__init__.py` | **New.** Imports `test_usp_intake` |
| `addons/strataflow_workorder/tests/test_usp_intake.py` | **New.** `TransactionCase` covering create, idempotency, revision update, cancellation, blank ref, utility mapping |
| `BACKLOG.md` | The ten questions for USP appended under the open question at line 13; the transport comparison table's conclusion recorded as an assumption, not an answer |

Not touched: `data/ir_sequence_data.xml`, `demo/strataflow_workorder_demo.xml`,
`static/src/screens/home.xml:36` and `static/src/screens/dispatch.xml:92` (the "not connected" footers stay
honest until a transport actually exists), and anything outside `addons/strataflow_workorder`.

## Landmines

- **A Python `@classmethod` cannot be called over RPC.** `odoo/service/model.py:61-63` rejects it explicitly
  ("cannot be called remotely"), and `:54` rejects any `_`-prefixed name. If `usp_intake` is written as a
  `classmethod` or as `_usp_intake`, the strataline-side transport in the comparison table becomes
  impossible and nobody finds out until that service is written. Use `@api.model` on a normal method, and
  guard it with an explicit group check because a public method is callable by every user who has model
  access (`security/ir.model.access.csv:2`).
- **Stock `message_new` will break the ticket number.** `addons/mail/models/mail_thread.py:1539-1540` sets
  `data[name_field] = msg_dict.get('subject', '')` before calling `create` at `:1546`. Our sequence branch
  (`models/strataflow_workorder.py:62`) only fires when `name` is absent or `_('New')`, so a ticket arriving
  by email through the default implementation would be named after the email subject and never get a
  `T-26-xxxxx`. Any future `message_new` override must delegate to `usp_intake` and never pass `name`.
- **A failing `message_new` bounces the mail and marks the alias invalid.**
  `addons/mail/models/mail_thread.py:1374-1379` calls `_alias_bounce_incoming_email(..., set_invalid=True)`
  on any exception. Since `address` is `required=True` with no default
  (`models/strataflow_workorder.py:31`), an unparseable email loses the ticket rather than parking it. When
  the email transport is built, catch and park, do not let it raise.
- **No `mail.alias.domain` record ships anywhere in `addons/*/data`**, and
  `addons/mail/models/res_company.py:10-11` merely searches for one. On a fresh `strataflow_dev` there is
  none, so an alias cannot be created until an alias domain is configured by hand. Budget for it before
  claiming "the email seam works".
- **Postgres unique treats NULLs as distinct but `''` as a value.** Two manually created tickets both
  storing `usp_ref = ''` violate the constraint from step 1 and the second save fails with an opaque server
  error in the stock form. This is why step 3 exists.
- **`data/ir_sequence_data.xml:2` is `noupdate="1"`**; so is `data/strataflow_utility_data.xml:2`. Editing
  either changes nothing on `-u strataflow_workorder`. Do not "fix" the sequence or add a fifth utility by
  editing those files and reloading. Likewise `post_init_hook` (`__init__.py:5`) runs on install only, never
  on `-u`.
- **Never grep for a stock Odoo field or API from memory** (CLAUDE.md non-negotiable). Every stock name in
  this brief was confirmed in this tree at the line given: `mail.alias.alias_defaults`
  (`addons/mail/models/mail_alias.py:56`), `message_new` (`addons/mail/models/mail_thread.py:1515`),
  `fetchmail.server._fetch_mails` (`addons/mail/models/fetchmail.py:245`), `models.Constraint`
  (`odoo/orm/table_objects.py:79`). Confirm anything you add the same way.
- **Quote grep globs in zsh.** `--include=*.py` unquoted expands and the command dies with
  `no matches found` (hit while researching this brief); `--include='*.py'` works.
- **"Verified server-side" is NOT verified.** The model work here is genuinely server-side and a test
  covers it, but step 6 touches two OWL templates — those must be looked at in the browser automation tab,
  not inferred from a 200.
- **The `source` value reaching the browser is the translated label, not the key**
  (`models/strataflow_workorder.py:180`). Do not write a JS filter against `"usp"`; it will never match.

## Acceptance criteria

- [ ] `strataflow.workorder` has `usp_ref`, `usp_revision` and `usp_payload`, and a `unique(usp_ref)`
      constraint exists in Postgres.
- [ ] `usp_intake` is a public `@api.model` method (not a `classmethod`, not `_`-prefixed) whose docstring
      defines the normalized dict, and which raises `AccessError` for a non-manager, non-sudo caller.
- [ ] Calling `usp_intake` with a new ticket creates one record with `source = 'usp'`, a `name` matching
      `T-26-\d{5}` drawn from the sequence, and `usp_ref` set.
- [ ] Calling `usp_intake` twice with the identical dict creates exactly one record; the second call reports
      it under `skipped`.
- [ ] Calling `usp_intake` with the same `usp_ref` and a different `revision` updates `address` and the other
      `USP_FIELDS`, posts a chatter note, and leaves `status`, `locator_id`, `assigned_at` and `move_id`
      untouched.
- [ ] A batch containing one malformed dict still applies every other dict in the batch, and reports the bad
      one under `errors`.
- [ ] Two tickets created through the stock form with no USP reference both save.
- [ ] An unknown utility code appears in `scope_note` rather than being dropped.
- [ ] `usp_ref` is visible on the stock form and list, and in the ticket detail on Work Orders and Dispatch.
- [ ] `BACKLOG.md` carries the ten questions for USP, and records the email-in default as an assumption.
- [ ] No `ir.cron`, no `mail.alias`, no HTTP route and no credentials were added by this task.

## Verification

Upgrade and run the tests (both stop after init, so neither leaves a server running):

```
cd /Users/stefan/strataflow
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  -u strataflow_workorder --stop-after-init --log-level=warn
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  -u strataflow_workorder --test-enable --test-tags /strataflow_workorder \
  --stop-after-init --log-level=info
```

Expect zero `FAIL`/`ERROR` lines and one `tests.test_usp_intake` block reporting all cases passed.

Confirm the constraint actually reached the database (an Odoo constraint that fails to apply is logged at
warning level and otherwise silent):

```
psql -h localhost strataflow_dev -c '\d strataflow_workorder' | grep -i usp
```

Expect a `UNIQUE CONSTRAINT` line on `usp_ref` and the three columns.

Exercise idempotency by hand:

```
.venv/bin/python odoo-bin shell -d strataflow_dev --db_host=localhost --addons-path=addons --log-level=warn
```

```python
p = {'usp_ref': 'TEST-0001', 'revision': '01', 'address': '100 Test Ave SE',
     'dig_date': '2026-09-20', 'utilities': ['gas', 'unicorn'],
     'requester': {'name': 'Ledcor Group'}}
env['strataflow.workorder'].usp_intake([p])            # -> created: [id]
env['strataflow.workorder'].usp_intake([p])            # -> skipped: [same id]
env['strataflow.workorder'].usp_intake([{**p, 'revision': '02', 'address': '200 Test Ave SE'}])  # -> updated
t = env['strataflow.workorder'].search([('usp_ref', '=', 'TEST-0001')])
t.name, t.source, t.address, t.lead_id, t.scope_note   # T-26-xxxxx, 'usp', '200 Test Ave SE', …unicorn noted
env.cr.rollback()
```

Then start the dev server and look at it:

```
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  --dev=xml --http-port=8069 --log-level=warn
```

In the browser at `http://localhost:8069`, signed in as `admin`/`admin` (hand the tab a curl session cookie;
never type the password):

1. `/odoo/workorders` — click any demo ticket. The detail panel shows **Source** (`USP feed` for eight of the
   ten demo tickets, `Manual entry` for `T-26-04179` and `T-26-04166`) and, for every demo ticket, an empty
   USP ref. Select the `TEST-0001` ticket if you left one committed: the USP ref reads
   `TEST-0001` in the mono style, next to Source.
2. `/odoo/dispatch` — same detail panel, same two rows; the footer still reads "USP feed · not connected",
   which is correct, because no transport was built.
3. Open the stock form from the Records menu (`Strataflow ▸ Records ▸ Work Orders`) — `USP ticket` and
   `USP revision` render readonly beside `Source`; saving a new ticket with both blank succeeds, twice in a
   row.
4. Browser console clean: no OWL template errors from the two `.xml` edits.
