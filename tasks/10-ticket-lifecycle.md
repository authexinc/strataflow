# 10 — Reopening tickets, and where completed documents live

A future session must give the dispatcher one explicit, audited way to send a finished ticket back into the
field, and must close the unaudited way that already exists by accident. The same session must answer where
uploaded documents live (they are stock `ir.attachment` rows plus files in the filestore) and make the
generated locate print an actual archived record instead of something regenerated on demand, so that a
reopened ticket supersedes its old print rather than erasing it.

## The ask

> 8. Ticket's need to be able to be reopened by the dispatcher

> 7. Where are completed docs being stored (the ones uploaded to a ticket)?

## What is true today

### The lifecycle field

There is one lifecycle field: `status`, a `Selection` at `addons/strataflow_workorder/models/strataflow_workorder.py:36`,
over the six values in `STATUSES` at `models/strataflow_workorder.py:6-13` — `new`, `assigned`, `onsite`,
`located`, `closed`, `invoiced`. It is `required=True`, `index=True`, `tracking=True`, default `new`. There is
no `stage_id` and no `state` field on the model; grep the model file, they do not exist.

Four methods write it, and every one of them moves forward only:

- `action_assign` (`models/strataflow_workorder.py:71-82`): refuses anything not in `('new', 'assigned')` at
  `:73-74`, then sets `status='assigned'`, `assigned_at`, `assigned_by_id`.
- `action_advance` (`models/strataflow_workorder.py:109-119`): looks the current status up in `NEXT_STEP`
  (`models/strataflow_workorder.py:15-20`) and refuses if it is not a key (`:112-113`). `NEXT_STEP` is a
  one-way map: `assigned→onsite`, `onsite→located`, `located→closed`, `closed→invoiced`. There is no inverse.
- `action_complete_locate` (`models/strataflow_workorder.py:121-142`): refuses anything not in
  `('assigned', 'onsite')` at `:130-131`, refuses an empty drawing at `:132-133`, then sets `status='located'`
  and stamps `onsite_at`/`located_at`.
- `action_invoice_closed` (`models/strataflow_workorder.py:84-107`): an `@api.model` batch method that searches
  `status == 'closed' and not move_id and requester_id` (`:88`), creates one `account.move` per requester
  (`:92-102`) and writes `move_id`, `invoice_line_id`, `status='invoiced'` per ticket (`:104`).

**There is no backwards path in Python.** No `action_reopen`, no `action_reset`, no `action_draft`. No JS writes
`status` either: the only `orm.write` calls on the model anywhere in `static/src` are
`static/src/screens/locator.js:240` and `static/src/screens/workorders.js:258`, and both write `drawing` only.

### The ask is not quite right: reopening already works, by accident

`status` is rendered as a plain, fully editable field on the stock form at
`views/strataflow_workorder_views.xml:33` — no `readonly`, no `invisible`, no `groups`. The model has no
`@api.constrains` on `status`, no SQL constraint, no `write()` override and no `compute`. The module defines no
`ir.rule` at all (grep for `ir.rule` under `addons/strataflow_workorder` returns nothing). Both groups carry
`perm_write=1` on the model: `security/ir.model.access.csv:2` (Locator) and `:3` (Dispatcher).

So today any Locator or Dispatcher can open Records → Work Orders (`views/strataflow_workorder_views.xml:98`,
manager-only menu) or reach the form through the Work Orders screen's Export ▸ "Open record"
(`static/src/screens/workorders.js:230-234`, template `static/src/screens/workorders.xml:54`) and hand-edit an
`invoiced` ticket straight back to `new`. `tracking=True` at `:36` means the change is logged in the chatter, so
it is visible after the fact — but nothing stops it and nothing cleans up after it.

**That is the actual danger.** The stamps `onsite_at`, `located_at`, `closed_at` are declared `readonly=True` at
`models/strataflow_workorder.py:55-57`, and `move_id`/`invoice_line_id` are `readonly=True` at `:49-50`, so a
hand-edit of `status` leaves every one of them untouched. The result is a ticket that says `new` while
`closed_at` is stamped and `move_id` still points at a real, issued invoice line. `action_invoice_closed`'s
domain at `:88` excludes it from re-invoicing because `move_id` is set, so it also silently falls out of the
billing queue.

Note also that `readonly=True` on `move_id`/`invoice_line_id` is a UI attribute only — the ORM still writes
them from Python, which `_demo_seed_invoices` proves at `models/strataflow_workorder.py:282`. Do not treat
`readonly` as enforcement anywhere in this task.

### The UI guards hide, they do not enforce

- `DONE_STATUSES = ["located", "closed", "invoiced"]` at `static/src/screens/locator.js:21` feeds `selDone`
  (`:117-119`), which short-circuits `confirmLocate` at `:255` and swaps the field tools for a read-only print.
  It is a client-side `if`; the server-side guard behind it is `action_complete_locate`'s status check at
  `models/strataflow_workorder.py:130-131`.
- `NEXT_ACTION` at `static/src/screens/workorders.js:26-33` only decides the primary button's label; the button
  handler `onPrimary` (`static/src/screens/workorders.js:186-217`) branches on `t.status` and calls the real
  server methods.
- The status filter chips are `CHIPS` at `static/src/screens/workorders.js:25` —
  `["all", "new", "assigned", "onsite", "located", "invoiced"]`. **`closed` is missing**, so a closed ticket is
  only reachable through the "All" chip or search. That matters for this task: closed tickets are exactly the
  ones a dispatcher will want to reopen.

### Where completed documents are stored — the plain answer

There is no custom attachment model and no binary field on `strataflow.workorder`. Uploaded documents are stock
Odoo `ir.attachment` rows, and this is the whole chain:

1. **Upload UI**: `static/src/screens/locator.xml:169-177` — a "Documents" block in the Locator's review stage,
   with a hidden `<input type="file" multiple>` at `:175` and the "Upload completed docs" button at `:176`
   calling `pickFile` (`static/src/screens/locator.js:273-275`).
2. **Upload transport**: `static/src/screens/locator.js:277-303`. It builds a `FormData` with `csrf_token`,
   `model="strataflow.workorder"`, `id=<ticket id>` and one `ufile` per file (`:286-289`) and `POST`s it to the
   **stock** route `/web/binary/upload_attachment` at `:290`. That route is
   `addons/web/controllers/binary.py:219-256`; it does `ir.attachment.create({'name', 'raw', 'res_model', 'res_id'})`
   at `:237-242` and then `attachment._post_add_create()` at `:243` (a no-op stub in base,
   `odoo/addons/base/models/ir_attachment.py:801-803`).
3. **Database row**: one `ir_attachment` row per file, with `res_model='strataflow.workorder'` and
   `res_id=<ticket id>` (fields declared at `odoo/addons/base/models/ir_attachment.py:456-458`), plus `name`
   (`:453`) and `store_fname`, `file_size`, `checksum`, `mimetype` (`:474-477`). The row holds metadata, not the
   bytes.
4. **The bytes**: `ir.attachment._storage()` (`odoo/addons/base/models/ir_attachment.py:88-89`) reads the
   `ir_attachment.location` config parameter and **defaults to `'file'`**, so the content is written to the
   filesystem, named by its sha1 checksum, under `config.filestore(dbname)` =
   `<data_dir>/filestore/<dbname>` (`odoo/tools/config.py:1030-1031`). On this machine that resolves to
   `/Users/stefan/Library/Application Support/Odoo/filestore/strataflow_dev` (87 MB, 678 files today), split
   into two-hex-character subdirectories. Postgres holds nothing but the metadata row unless
   `ir_attachment.location` is set to `db`.
5. **Read back**: `static/src/screens/locator.js:70-76` — an `orm.searchRead` on `ir.attachment` filtered by
   `res_model`/`res_id`, ordered `create_date desc`, reading `name`, `mimetype`, `create_date`.
6. **Download**: `static/src/screens/locator.js:305-307` opens `/web/content/<id>?download=true`.
7. **Also visible in stock**: the ticket form has `<chatter/>` at `views/strataflow_workorder_views.xml:50`, and
   the stock chatter's attachment box lists the same rows. Files dropped into the chatter land in the same place
   and appear in the Locator's document list.

### Correction: the `ir.attachment` access rule is not missing

`security/ir.model.access.csv` covers only `strataflow.workorder` and `strataflow.utility`, and that is correct
— it does not need an `ir.attachment` line. Stock base already grants it:
`odoo/addons/base/security/ir.model.access.csv:3` gives `base.group_user` full CRUD (`1,1,1,1`) on
`model_ir_attachment`, and `group_strataflow_user` implies `base.group_user` at
`security/strataflow_security.xml:16` (with `group_strataflow_manager` implying `group_strataflow_user` at
`:23`). Per-record access is then delegated: `IrAttachment._check_access`
(`odoo/addons/base/models/ir_attachment.py:514-588`) resolves `res_model`/`res_id` and checks the *referenced
record's* access, mapping `create`/`unlink` onto `write` at `:538-541`. Since the module has no `ir.rule`,
whoever can write a ticket can attach to it and delete from it.

The real gap is the opposite of a missing grant: `access_strataflow_workorder_user` gives Locators `perm_write=1`
(`security/ir.model.access.csv:2`), so a **Locator can delete a completed document off any ticket**, including
one that is already closed and invoiced. `perm_unlink=0` on that line does not help — attachment unlink checks
*write* on the ticket (`ir_attachment.py:538-541`), not unlink.

### The generated locate PDF is never persisted

`controllers/export.py:58-161` serves `/strataflow/workorder/<int:wo_id>/locate.pdf`. It browses the ticket and
calls `wo.check_access('read')` at `:60-61` (`check_access` is the Odoo 19 name,
`odoo/orm/models.py:4106-4121`), builds the document into an `io.BytesIO` at `:63-64`, and returns it with
`request.make_response(...)` at `:158-161`. **There is no `ir.attachment.create` and no filesystem write
anywhere in that file.** The Python projection `project_drawing` at `controllers/export.py:25-53` mirrors
`projectDrawing` in `static/src/core/locate_geo.js`, and it treats any drawing without `v == 2` as empty at
`:28-29`.

The other exports are client-side only: `exportPng` (`static/src/screens/workorders.js:273-298`) and
`exportCsv` (`:300-314`) build a Blob in the browser via `static/src/core/download.js`. `exportPdf`
(`static/src/screens/workorders.js:268-271`) just opens the controller URL.

So the legal record of a locate — the print with the ticket header, the utility legend, the scale and the
"Reference only — not a locate" disclaimer (`controllers/export.py:154`) — is regenerated from the live
`drawing` JSON every time it is asked for, and is never archived. If the drawing changes, every previously
"issued" PDF silently changes with it. That is the thing a reopen makes acute: reopen, redraw, and the record
of what was originally marked is gone.

## Decision needed

**1. What happens when the dispatcher reopens a ticket that is already `invoiced`?**

Options: (a) block outright until the invoice is dealt with; (b) reopen and automatically raise a credit note;
(c) reopen and leave the invoice alone.

**Recommendation: a split on the invoice's state, not one blanket rule.**

- `move_id.state == 'draft'` → **detach and reopen.** `action_invoice_closed` never calls `action_post`
  (`models/strataflow_workorder.py:92-102`), so in normal operation an `invoiced` ticket points at a *draft*
  `account.move`. A draft invoice is not a legal document; remove this ticket's `invoice_line_id` from it, clear
  `move_id`/`invoice_line_id`, and if that leaves the move with no product lines, unlink the move. The ticket
  then re-enters `action_invoice_closed`'s domain (`:88`) naturally when it is next closed.
- `move_id.state == 'posted'` → **block**, with a message telling the dispatcher to raise a credit note from
  the invoice first (stock `account.move.action_reverse`, `addons/account/models/account_move.py:6179-6185`,
  which opens the `account.move.reversal` wizard, declared at
  `addons/account/wizard/account_move_reversal.py:11` and doing the work in `reverse_moves` at `:110`). A
  posted move carries a sequence number kept unique by an index on
  `(name, journal_id) WHERE (state = 'posted' AND name != '/')` (`addons/account/models/account_move.py:791-794`);
  orphaning it from the ticket that justifies it is an
  accounting hole, and silently reversing it is worse — `action_invoice_closed` batches **many tickets per
  invoice** (`:96-101`), so auto-crediting would refund the customer for the other tickets on that invoice too.
- `move_id.state == 'cancel'` → clear the links and reopen; nothing is owed.

**2. Does a reopened ticket land on `new` or back on `assigned` with the same locator?**

**Recommendation: `assigned` when `locator_id` is set, `new` otherwise.** A reopen almost always means "go back
and redo it", and the crew that did it knows the site. `assigned` is in `OPEN_STATUSES`
(`models/strataflow_workorder.py:21`) so it returns to the home counts, it is accepted by
`action_complete_locate` (`:130`), and it puts the ticket back in the Locator's route
(`static/src/screens/locator.js:87`). Reopening to `new` would require the dispatcher to re-assign as a second
step. If Stefan wants the reopen to always land in the unassigned queue, that is a one-line change.

**3. Does a reopen delete the archived locate PDF or supersede it?**

**Recommendation: supersede, never delete.** Keep the old attachment, stamp its `description`
(`odoo/addons/base/models/ir_attachment.py:454`) with the reopen reason and date, and name each new print with
a revision suffix. A locate print is the evidence of what was marked at the time; deleting it destroys the
record the reopen is meant to be honest about.

## Plan

Two halves, independent. Half A is the reopen path. Half B is documents. Half B step 5 is the only place they
touch.

### Half A — an explicit, audited reopen

1. **`models/strataflow_workorder.py`** — add a `REOPEN_TARGETS`-free, explicit `action_reopen(self, reason)`
   next to `action_complete_locate` (i.e. after `models/strataflow_workorder.py:142`). Behaviour:
   - `self.ensure_one()`.
   - Permission gate: `if not self._is_dispatcher(): raise AccessError(...)`. The helper already exists at
     `models/strataflow_workorder.py:169-170` and checks
     `self.env.user.has_group('strataflow_workorder.group_strataflow_manager')` — the group is declared at
     `security/strataflow_security.xml:19-26` ("Dispatcher"). Import `AccessError` alongside the existing
     `UserError` import at `models/strataflow_workorder.py:4`.
   - `reason` is mandatory: `if not (reason or '').strip(): raise UserError(_('Give a reason for reopening %s.', self.name))`.
   - Refuse a no-op: `if self.status in ('new', 'assigned'): raise UserError(_('%s is already open.', self.name))`.
   - Invoice handling, per the Decision above. Draft move: unlink `self.invoice_line_id` if the move has other
     product lines, else `self.move_id.unlink()`. Posted move: `raise UserError(...)` naming the invoice and
     pointing at the credit note. Cancelled move: fall through.
   - Write, with the lifecycle context flag from step 3:
     `{'status': 'assigned' if self.locator_id else 'new', 'onsite_at': False, 'located_at': False, 'closed_at': False, 'move_id': False, 'invoice_line_id': False}`.
   - Deliberately **preserved**: `drawing` (the previous print stays as the starting point and as evidence),
     `received_at`, `assigned_at`, `assigned_by_id`, `locator_id`, `utility_ids`, and every `ir.attachment` on
     the record.
   - `self.message_post(body=_('Reopened by %(who)s from %(from)s — %(reason)s', ...), message_type='notification', subtype_xmlid='mail.mt_note')`,
     matching the existing chatter calls at `:81`, `:105` and `:140-141`. `tracking=True` on `status` (`:36`)
     already logs the field change separately.
2. **`models/strataflow_workorder.py`** — thread the lifecycle context flag through the four existing writers so
   the guard in step 3 does not fire on them: `action_assign` (`:75`), `action_advance` (`:118`),
   `action_complete_locate` (`:135`) and `action_invoice_closed` (`:104`) each become
   `self.with_context(strataflow_lifecycle=True).write(...)` / `t.with_context(strataflow_lifecycle=True).write(...)`.
3. **`models/strataflow_workorder.py`** — add a `write()` override that closes the accidental path without
   breaking legitimate admin correction:

   ```
   def write(self, vals):
       if ('status' in vals
               and not self.env.su
               and not self.env.context.get('strataflow_lifecycle')
               and not self.env.user.has_group('base.group_system')):
           raise UserError(_('Move the ticket with its lifecycle buttons; Reopen is how a finished ticket goes back.'))
       return super().write(vals)
   ```

   `create` is untouched, so imports and the USP feed can still set an initial status. `self.env.su` keeps
   `sudo()` paths and data loading working. `base.group_system` keeps the Settings-level escape hatch for the
   one-off correction Stefan will eventually need.
4. **`views/strataflow_workorder_views.xml`** — make the form honest about it. Change `:33` to
   `<field name="status" readonly="1"/>` and add a `<header>` above the `<sheet>` (which opens at `:26`).
   Because `action_reopen` takes a mandatory `reason`, the header button must open the wizard from step 5
   rather than call the method bare, so it is an action button, not an object one:
   `<button name="%(strataflow_workorder.action_strataflow_reopen_wizard)d" type="action" string="Reopen" groups="strataflow_workorder.group_strataflow_manager" invisible="status in ('new', 'assigned')" context="{'default_workorder_id': id}"/>`.
5. **`wizard/strataflow_reopen_wizard.py` and `wizard/strataflow_reopen_wizard_views.xml`** (new) — a
   `models.TransientModel` `strataflow.reopen.wizard` with `workorder_id = fields.Many2one('strataflow.workorder', required=True)`
   and `reason = fields.Text(required=True)`, whose `action_confirm` calls
   `self.workorder_id.action_reopen(self.reason)`. Add a `<record model="ir.actions.act_window">` with
   `target="new"`, and an ACL line for the wizard on `group_strataflow_manager` only in
   `security/ir.model.access.csv`. Register the package from the module root `__init__.py` (the sibling of
   `models/`, which today reads `from . import controllers` / `from . import models`) and list the one new data
   file, `wizard/strataflow_reopen_wizard_views.xml`, in `__manifest__.py:11-20` (after
   `views/strataflow_workorder_views.xml`).
   Give the act_window the id `action_strataflow_reopen_wizard`, which is what the step 4 header button names.
6. **`static/src/screens/workorders.js`** — add `Reopen` to the Work Orders detail pane. Add a `canReopen`
   getter (`["located", "closed", "invoiced"].includes(this.sel?.status) && this.state.data.me.is_dispatcher`;
   `is_dispatcher` already ships in `get_board_data`'s payload at `models/strataflow_workorder.py:203`) and a
   `reopen()` method that opens the wizard through the action service —
   `this.action.doAction({type: 'ir.actions.act_window', res_model: 'strataflow.reopen.wizard', views: [[false, 'form']], target: 'new', context: {default_workorder_id: this.sel.id}, onClose: () => this.load()})`.
   The existing `openInvoice` at `static/src/screens/workorders.js:219-221` is the pattern for `doAction`.
7. **`static/src/screens/workorders.js:25`** — add `"closed"` to `CHIPS`, between `"located"` and `"invoiced"`.
   Without it a dispatcher cannot filter to the tickets most likely to need reopening. No other change is
   needed: `chips` (`:77-85`) and `visible` (`:103-110`) are already generic over the list.
8. **`static/src/screens/workorders.xml`** — render the button inside the existing `<span class="o_sf_actions">`
   at `:44-57`, next to the primary button at `:45-47`:
   `<button t-if="canReopen" type="button" class="o_sf_btn" t-on-click="reopen">Reopen</button>`. Use the plain
   `.o_sf_btn` class defined at `static/src/strataflow.scss:149-158` — **no new SCSS is needed and none should
   be written.**
9. **`models/strataflow_workorder.py`** — extend `_ticket_payload` (`:172-190`) with the invoice state so the
   screen can explain a blocked reopen before the round trip: add
   `'invoice_state': t.move_id.state if t.move_id else ''` next to the existing `'invoice'` / `'move_id'` keys
   at `:185`. Use it in `workorders.js` to set the Reopen button's tooltip when the move is posted.

### Half B — documents, archived and honest

10. **`models/locate_pdf.py`** (new) — move `M_PER_DEG_LAT`, `MIN_SPAN_M`, `MAX_PT_PER_M`, `haversine_m` and
    `project_drawing` (`controllers/export.py:14-53`) and the whole render body (`controllers/export.py:63-157`)
    into one module-level function `build_locate_pdf(wo) -> bytes`. **Move it verbatim**, changing only
    `request.env['strataflow.utility']` at `controllers/export.py:109` to `wo.env['strataflow.utility']`. Do not
    touch the `v != 2` check at `controllers/export.py:28-29` — see Landmines.
11. **`controllers/export.py`** — the controller shrinks to: browse, `wo.check_access('read')` (keep `:60-61`
    exactly as is), `pdf = build_locate_pdf(wo)`, then the same `request.make_response` as `:158-161`. Nothing
    about the URL or the headers changes.
12. **`models/strataflow_workorder.py`** — add `_archive_locate_pdf(self, note='')`: build the bytes with
    `build_locate_pdf(self)`, count the existing prints
    (`self.env['ir.attachment'].search_count([('res_model', '=', self._name), ('res_id', '=', self.id), ('name', 'like', '-locate-r%')])`),
    and post the new one through the chatter so it is both an attachment and a visible event:

    ```
    att = self.env['ir.attachment'].create({
        'name': f'{self.name}-locate-r{n + 1}.pdf',
        'raw': build_locate_pdf(self),
        'mimetype': 'application/pdf',
        'res_model': self._name,
        'res_id': self.id,
    })
    self.message_post(body=..., attachment_ids=att.ids, message_type='notification', subtype_xmlid='mail.mt_note')
    ```

    `message_post` accepts `attachment_ids` — stock signature at `addons/mail/models/mail_thread.py:2199-2206`.
    Creating the attachment with `raw` is exactly what the stock upload route does
    (`addons/web/controllers/binary.py:237-242`), so the bytes land in the same filestore by the same path.
13. **`models/strataflow_workorder.py:135-141`** — call `self._archive_locate_pdf()` at the end of
    `action_complete_locate`, after the write and before/with the existing `message_post`. That is the moment
    the print becomes a record: the locator has confirmed it and `action_complete_locate` already refuses an
    empty drawing at `:132-133`, so the archived PDF is never blank.
14. **`models/strataflow_workorder.py`** — in `action_reopen` (step 1), **supersede rather than delete**: before
    writing, stamp every existing `-locate-r*.pdf` attachment on the ticket with
    `description = f'Superseded by reopen on {fields.Date.to_string(fields.Date.context_today(self))} — {reason}'`
    (`description` is a stock field, `odoo/addons/base/models/ir_attachment.py:454`). No `unlink` anywhere in
    the reopen path. The next `action_complete_locate` adds `-r2`, and the chatter carries both.
15. **`static/src/screens/locator.js:70-76`** — no change to the search domain (see Landmines), but sort so the
    archived prints are distinguishable: the `orm.searchRead` field list gains `"description"`, and
    `static/src/screens/locator.xml:172-174` renders a small "superseded" marker when `a.description` is set,
    reusing the existing `.o_sf_note` class already used at `:171`.
16. **`security/ir.model.access.csv`** — **do not add an `ir.attachment` line.** Stock
    `odoo/addons/base/security/ir.model.access.csv:3` already grants it and
    `IrAttachment._check_access` (`odoo/addons/base/models/ir_attachment.py:514-588`) delegates per-record
    access to the ticket. What the file *should* gain, if Stefan agrees it is in scope, is nothing at all here —
    the "a Locator can delete a closed ticket's documents" hole is a `strataflow.workorder` record-rule
    question, not an attachment ACL question, and belongs in its own backlog item. Note it in `BACKLOG.md`
    rather than solving it inside this task.
17. **`ARCHITECTURE.md`** — record the answer to question 7 in one short paragraph (rows in
    `ir_attachment` keyed by `res_model`/`res_id`; bytes in `<data_dir>/filestore/<dbname>` by sha1) so it does
    not have to be re-derived. `ARCHITECTURE.md` is where the locked decisions from the Decision section go.

## Files

| path | what changes |
| --- | --- |
| `addons/strataflow_workorder/models/strataflow_workorder.py` | new `action_reopen`, new `write()` guard, `strataflow_lifecycle` context on the four existing status writers, `_archive_locate_pdf`, call it from `action_complete_locate`, `invoice_state` in `_ticket_payload` |
| `addons/strataflow_workorder/models/locate_pdf.py` | **new** — `build_locate_pdf(wo)` and the projection helpers, moved verbatim out of the controller |
| `addons/strataflow_workorder/models/__init__.py` | import `locate_pdf` |
| `addons/strataflow_workorder/controllers/export.py` | shrinks to browse + `check_access` + `build_locate_pdf` + `make_response`; render code removed |
| `addons/strataflow_workorder/wizard/__init__.py` | **new** |
| `addons/strataflow_workorder/wizard/strataflow_reopen_wizard.py` | **new** — `strataflow.reopen.wizard` transient with a required `reason` |
| `addons/strataflow_workorder/wizard/strataflow_reopen_wizard_views.xml` | **new** — wizard form + `target="new"` action |
| `addons/strataflow_workorder/views/strataflow_workorder_views.xml` | `status` becomes `readonly="1"` at `:33`; a `<header>` with a manager-only Reopen button |
| `addons/strataflow_workorder/security/ir.model.access.csv` | one line for the wizard, manager only. **No `ir.attachment` line.** |
| `addons/strataflow_workorder/__init__.py` | import the `wizard` package |
| `addons/strataflow_workorder/__manifest__.py` | list the wizard view in `data` |
| `addons/strataflow_workorder/static/src/screens/workorders.js` | `"closed"` added to `CHIPS`; `canReopen` getter; `reopen()` opening the wizard |
| `addons/strataflow_workorder/static/src/screens/workorders.xml` | Reopen button in `.o_sf_actions` |
| `addons/strataflow_workorder/static/src/screens/locator.js` | `description` added to the attachment `searchRead` fields |
| `addons/strataflow_workorder/static/src/screens/locator.xml` | "superseded" marker on archived prints |
| `ARCHITECTURE.md` | the two locked decisions; the one-paragraph answer to "where do documents live" |
| `BACKLOG.md` | new item: Locators can delete documents off closed tickets (record rule, not an ACL) |

## Landmines

- **`controllers/export.py` mirrors `projectDrawing` in Python and the two MUST stay in step.** Step 10 moves
  that code to `models/locate_pdf.py`. Move it byte-for-byte; do not "tidy" it. In particular the
  `if (drawing or {}).get('v') != 2: return [], [], 0` at `controllers/export.py:28-29` is load-bearing — a
  drawing without `v: 2` is treated as empty, matching `static/src/core/locate_geo.js`. If you change the
  projection while moving it, every archived PDF diverges from what the browser preview shows.
- **`post_init_hook` runs on install, NEVER on `-u`.** `__manifest__.py:51` declares one. If you want to
  backfill archived PDFs for the `located`/`closed`/`invoiced` tickets that already exist in `strataflow_dev`,
  do it from `odoo-bin shell` as a one-off, not from the hook — it will not fire on the `-u` you use to deploy
  this change.
- **NEVER use a stock Odoo field or API from memory.** The ones this task depends on, all confirmed in this
  tree: `check_access(operation)` is the Odoo 19 name (`odoo/orm/models.py:4106`); `ir.attachment.check()` is
  deprecated as of 19.0 and warns (`odoo/addons/base/models/ir_attachment.py:504-506`) — use `check_access`;
  `message_post(..., attachment_ids=...)` exists (`addons/mail/models/mail_thread.py:2205`);
  `ir.attachment.description` exists (`odoo/addons/base/models/ir_attachment.py:454`);
  `account.move.action_reverse` exists (`addons/account/models/account_move.py:6178`).
- **"Verified server-side" is NOT verified.** The Reopen button, the wizard dialog and the readonly `status`
  field on the stock form must be clicked in a browser. A JSON-RPC call to `action_reopen` proves the model,
  not the button, not the `groups=` on the header button, and not that the readonly field still renders.
- **Quote grep globs in zsh.** `--include=*.xml` unquoted expands and the flag silently vanishes; write
  `--include='*.xml'`.
- **No SCSS changes are needed in this task, and that is deliberate.** The Reopen button reuses `.o_sf_btn`
  (`static/src/strataflow.scss:149-158`). Adding no new stylesheet rules means the Sass `min()`/`max()`
  mixed-unit trap — which throws `Incompatible units: px and %`, breaks the whole bundle, and leaves Odoo
  serving the *previous* CSS behind a small red banner so it looks like nothing happened — cannot be triggered
  here. Keep it that way.
- **New: `action_invoice_closed` never posts the invoice.** `models/strataflow_workorder.py:92-102` creates the
  `account.move` and stops; there is no `action_post()` call. So in normal operation an `invoiced` ticket points
  at a **draft** move. Any reopen logic written on the assumption that "invoiced" means "money collected" is
  wrong for the common case and needlessly blocks the dispatcher. Branch on `move_id.state`.
- **New: one invoice covers many tickets.** `action_invoice_closed` groups by requester and puts one line per
  ticket on a shared move (`models/strataflow_workorder.py:90-102`). Never reverse or unlink a move because of
  one ticket without first checking whether other lines survive.
- **New: `ir.attachment._search` silently ANDs `res_field = False`.** `odoo/addons/base/models/ir_attachment.py:625-630`
  adds that condition unless the domain already mentions `id` or `res_field`. This is why
  `static/src/screens/locator.js:75` correctly excludes binary-field attachments without asking. Do **not**
  "fix" it by adding an explicit `res_field` clause — doing so turns the automatic filter *off* and starts
  leaking field attachments into the Documents list.
- **New: `readonly=True` on an ORM field is a UI attribute, not enforcement.** `move_id`, `invoice_line_id`
  (`models/strataflow_workorder.py:49-50`) and the three timestamps (`:55-57`) are all `readonly=True` and are
  all still written from Python (`_demo_seed_invoices` at `:282` proves it). The `readonly="1"` added to
  `status` on the form in step 4 is cosmetic on its own — the `write()` guard in step 3 is what actually closes
  the hole, and both are needed.

## Acceptance criteria

- [ ] `strataflow.workorder.action_reopen(reason)` exists, is `ensure_one`, and raises `AccessError` for a user
      who is in `group_strataflow_user` but not `group_strataflow_manager`.
- [ ] `action_reopen` raises `UserError` when `reason` is empty or whitespace, and when `status` is already
      `new` or `assigned`.
- [ ] Reopening a `closed` ticket sets `status` to `assigned` (locator set) or `new` (no locator), clears
      `onsite_at`, `located_at` and `closed_at`, and leaves `drawing`, `received_at`, `assigned_at`,
      `assigned_by_id`, `locator_id` and every `ir.attachment` on the ticket untouched.
- [ ] Reopening an `invoiced` ticket whose move is **draft** removes that ticket's `invoice_line_id` from the
      move, clears `move_id` and `invoice_line_id`, and unlinks the move when no product lines are left.
      Afterwards `action_invoice_closed` picks the ticket up again once it is closed.
- [ ] Reopening an `invoiced` ticket whose move is **posted** raises `UserError` naming the invoice, and changes
      nothing — `status`, `move_id` and `invoice_line_id` are all unchanged after the failed call.
- [ ] Every reopen posts a chatter note carrying the reason and the status it came from.
- [ ] A direct `orm.write` of `status` from the web client (or `env['strataflow.workorder'].write({'status': ...})`
      as a plain Locator in `odoo-bin shell`) raises `UserError`. The same write as a `base.group_system` user,
      and any `sudo()` write, still succeeds.
- [ ] `status` renders read-only on the stock form at `/odoo/action-strataflow_workorder.action_strataflow_workorder_records`,
      and the Reopen header button is invisible to a Locator.
- [ ] The Work Orders screen shows a `closed` filter chip, and a Reopen button on `located`/`closed`/`invoiced`
      tickets for a dispatcher only.
- [ ] `action_complete_locate` creates exactly one `ir.attachment` named `<ticket>-locate-r1.pdf` with
      `res_model='strataflow.workorder'`, `res_id=<ticket id>`, `mimetype='application/pdf'`, and its bytes are
      a valid PDF identical to what `/strataflow/workorder/<id>/locate.pdf` returns at that moment apart from
      reportlab's `/CreationDate` and `/ID` stamps.
- [ ] A reopen followed by a second `action_complete_locate` leaves **two** attachments, `-r1` and `-r2`; `-r1`
      still exists and its `description` names the reopen date and reason.
- [ ] `/strataflow/workorder/<id>/locate.pdf` still returns the same document as before the refactor, with the
      same `Content-Disposition` filename.
- [ ] `security/ir.model.access.csv` gained exactly one line (the wizard) and no `ir.attachment` line.
- [ ] `ARCHITECTURE.md` states, in one paragraph, that documents are `ir.attachment` rows keyed by
      `res_model`/`res_id` with bytes on disk under `<data_dir>/filestore/<dbname>`.

## Verification

Restart with the module upgraded — Python, XML and JS all changed, so a plain reload will serve a stale JS
bundle:

```
cd /Users/stefan/strataflow
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  --dev=xml --http-port=8069 --log-level=warn -u strataflow_workorder
```

Server-side checks, in a second terminal (`odoo-bin shell`, same database):

```
cd /Users/stefan/strataflow
.venv/bin/python odoo-bin shell -d strataflow_dev --db_host=localhost --addons-path=addons --log-level=warn
```

```python
WO = env['strataflow.workorder']
t = WO.search([('status', '=', 'closed')], limit=1)

# 1. the write guard fires
try:
    t.write({'status': 'new'})
    print('FAIL: raw status write went through')
except Exception as e:
    print('OK guard:', e)

# 2. reopen works and cleans up
t.action_reopen('Customer says the gas line was missed')
print(t.status, t.closed_at, t.located_at, t.move_id, bool(t.drawing.get('segments')))
# expect: assigned/new, False, False, account.move(), True

# 3. the archived print exists after a re-complete
t.action_complete_locate()
atts = env['ir.attachment'].search([('res_model', '=', 'strataflow.workorder'), ('res_id', '=', t.id)])
for a in atts:
    print(a.name, a.mimetype, a.file_size, a.store_fname, a.description)
# expect at least <ticket>-locate-r1.pdf and -r2.pdf; r1 carries a "Superseded by reopen" description

# 4. a posted invoice blocks the reopen
inv = WO.search([('status', '=', 'invoiced'), ('move_id.state', '=', 'posted')], limit=1)
try:
    inv.action_reopen('test')
    print('FAIL: posted invoice reopen allowed')
except Exception as e:
    print('OK posted-block:', e)
```

Confirm the bytes really landed in the filestore (the `store_fname` printed above is `<2 hex>/<sha1>`):

```
ls -l "/Users/stefan/Library/Application Support/Odoo/filestore/strataflow_dev/<store_fname>"
file "/Users/stefan/Library/Application Support/Odoo/filestore/strataflow_dev/<store_fname>"   # -> PDF document
```

Confirm the controller is unchanged by the refactor — diff the served PDF against the archived attachment:

```
curl -s -b "session_id=$SESSION" "http://localhost:8069/strataflow/workorder/<id>/locate.pdf" -o /tmp/served.pdf
cmp /tmp/served.pdf "/Users/stefan/Library/Application Support/Odoo/filestore/strataflow_dev/<store_fname>"
```

(reportlab stamps a creation date, so if `cmp` differs, check that the only difference is `/CreationDate` —
`strings /tmp/served.pdf | grep CreationDate`.)

In the browser — this is the part that actually counts:

1. `http://localhost:8069/odoo/workorders`, log in `admin`/`admin`. The chip row now reads
   All · New · Assigned · On site · Located · **Closed** · Invoiced. Click **Closed**; the list is non-empty.
2. Select a closed ticket. In the header, next to the primary "Create invoice" button, a **Reopen** button. Click
   it: a dialog appears with a required reason box. Submit it empty — it must refuse. Type a reason and confirm.
3. The dialog closes, the screen reloads, and the ticket is now on the **Assigned** chip with its locator intact.
   The activity rail in the detail pane (`static/src/screens/workorders.js:125-144`) shows "Print complete" and
   "Closed" back to *pending*.
4. Export ▸ **Open record** on that ticket. On the stock form, `status` is greyed out and cannot be edited. The
   chatter shows the reopen note with the reason, the tracked `status` change, and the earlier
   `<ticket>-locate-r1.pdf` in the attachment box. Click it — a real PDF downloads.
5. `http://localhost:8069/odoo/locator`. The reopened ticket is back in the route with its field tools (not the
   read-only "Done" print). Its Documents list in the Review stage shows `-locate-r1.pdf` marked superseded
   alongside anything the locator had uploaded. Redraw and confirm the locate; a `-r2.pdf` appears and `-r1`
   is still there.
6. Log in as a Locator (a user in `group_strataflow_user` only). On `/odoo/workorders` the Reopen button is
   absent on every ticket; on the stock form the header Reopen button is absent and `status` is still read-only.
