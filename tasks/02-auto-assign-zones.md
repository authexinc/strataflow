# 02 — Rebuild Auto-assign as zone-first with workload tiebreak

Auto-assign today is a greedy nearest-neighbour router that silently ignores every ticket without
coordinates — which is every hand-entered ticket, exactly the population the zone rule exists to serve.
A future session must replace the *assignment* rule with the locked one (zone match first, least-loaded
among the matches, pure workload when no zone matches), move it server-side onto `strataflow.workorder`
where the USP intake can reuse it and a test can pin it, and add the two data structures it needs: a
`strataflow.zone` model with a many2many to `res.users`, and a `postal_code` Char on the ticket. The
drawn route lines on the live map must survive unchanged.

## The ask

> 2. How can we make "Auto-assign" actually work?

## What is true today

**Auto-assign is not a stub. It is built, it draws routes, and it really assigns.**

- The toggle is a button in the Dispatch queue header,
  `static/src/screens/dispatch.xml:21` — `t-on-click="() => (state.auto = !state.auto)"`, flipping
  `state.auto` (declared `static/src/screens/dispatch.js:37`).
- When on, `dispatch.js:138-147` (`get routes`) calls `planRoutes(...)` and maps the result into
  `{ id, crew, km, stops, color, coords }`.
- `planRoutes` is `static/src/core/geo.js:45-74`. It is greedy nearest-neighbour:
  - `geo.js:46` — the pool is `tickets.filter((t) => t.status === "new" && t.latitude && t.longitude)`.
    **This is the bug at the centre of the ask**: a ticket with no coordinates is silently dropped from
    auto-assign entirely. It does not appear in a route, it is never assigned, and nothing tells the
    dispatcher it was skipped. Hand-entered tickets ("+ New ticket", `dispatch.js:201-206`) have no
    latitude/longitude, and neither does any USP ticket that arrives without them.
  - `geo.js:47` — `const free = crew.filter((c) => !c.busy)` excludes every locator currently on site.
  - `geo.js:51-54` — a centroid of the pool is the fallback start point.
  - `geo.js:55` — each free locator's route starts at `anchors[c.id] || centroid`.
  - `geo.js:56` — remaining tickets are sorted emergencies-first.
  - `geo.js:57-72` — repeatedly: pick the route with the smallest accumulated km (`geo.js:58`), give it
    the ticket nearest its `last` point by `haversineKm` (`geo.js:28-38`, `geo.js:61-67`), append.
  - Workload plays no part. Zones do not exist. Postal codes do not exist.
- The anchors come from `dispatch.js:96-106` (`get crewAnchors`): per locator, their `onsite` ticket if
  they have one, else their first `assigned` ticket, and only if that ticket has a `latitude`.
- `applyRoutes` is `dispatch.js:189-199`. It loops the plan and calls
  `action_assign` once per stop over ORM RPC (`dispatch.js:193`) — N round trips, no transaction
  boundary across them, then `this.state.auto = false` and a reload.
- `action_assign` is `models/strataflow_workorder.py:71-82`. It refuses anything past `assigned`
  (`:73-74`, `UserError`), writes `locator_id`, `status='assigned'`, `assigned_at`, `assigned_by_id`,
  and posts a note to the chatter (`:81`).
- The footer shows `routeSummary` (`dispatch.js:149-157`, rendered at `dispatch.xml:94`) and an "Apply
  routes" button (`dispatch.xml:95`). The empty-state string is literally
  `"Auto-assign · no unassigned tickets with coordinates"` (`dispatch.js:152`) — the code already admits
  the exclusion in its own copy.

**The drawn routes are a separate, working feature that must not break.**

- `dispatch.xml:16` passes `routes="routes"` to `<StratalineMap/>`.
- `static/src/core/strataline_map.js:215` documents the contract: `routes: [{ id, color, coords: [[lng, lat], …] }]`.
- `syncRoutes` (`strataline_map.js:506-527`) filters to `r.coords?.length > 1` (`:513`), builds a
  GeoJSON `FeatureCollection`, and adds a dashed `line` layer `sf_routes` coloured by
  `["get", "color"]` (`:522-526`). It bails unless `this.styleReady` (`:508`).
- `coords` is built at `dispatch.js:145`: `[this.crewAnchors[r.crew.id], ...r.stops]`, coordinate-filtered.
- So `crewAnchors` has two jobs today: route start point (must stay) and greedy-search seed (goes away).

**What does not exist.** `grep -rn "strataflow.zone\|postal_code\|postal_prefix" addons/strataflow_workorder`
returns nothing. There is no zone model, no `postal_code` on the ticket, no many2many on `res.users`, and
no test package (`addons/strataflow_workorder/` has no `tests/` directory).

**What already exists that the new rule can lean on.**

- `get_board_data` (`models/strataflow_workorder.py:192-216`) already ships every locator's open count:
  `open_load` is built at `:197-199` (tickets in `('assigned','onsite')` with a locator), `busy` at `:200`
  (tickets in `onsite`), and each crew row carries `open` and `busy` (`:211`). The crew list is
  sorted `(busy, open, name)` at `:214`. **The workload half of the new rule needs no new data.**
- The locator set is `self.env.ref('strataflow_workorder.group_strataflow_user').user_ids.filtered(lambda u: not u.share).sorted('name')`
  (`:196`). Reading a many2many applies `active_test` (`odoo/orm/fields_relational.py:649-652`), so
  archived users are already excluded; no extra filter is needed.
- Every screen calls `get_board_data` — `dispatch.js:48`, `locator.js:62`, `workorders.js:65`,
  `home.js:42`, `crm.js:27`, `invoices.js:31` — so anything added there is paid for six times. Keep it cheap.
- `_ticket_payload` (`:172-190`) has exactly one caller (`:215`), so its signature is safe to change.
- The manual assign path is separate and unaffected: the Dispatch crew rail (`dispatch.xml:65-71`,
  `dispatch.js:108-121`) and the Work Orders popover (`core/assign_popover.js`, template at
  `screens/workorders.xml:105-122`, opened at `workorders.js:196-200`). The popover's "Suggested" tag is
  purely "first non-busy locator" (`assign_popover.js:27`).

**Stock Odoo facts confirmed in this tree (do not take these from memory elsewhere).**

- `res.partner.zip` exists: `odoo/addons/base/models/res_partner.py:265` — `zip = fields.Char(change_default=True)`.
- `res.users` is `_inherits = {'res.partner': 'partner_id'}` (`odoo/addons/base/models/res_users.py:165`).
  Adding a many2many to it is ordinary; the in-tree precedent for a plain *stored* one is
  `addons/project/models/res_users.py:7-8`, which declares `favorite_project_ids` with an explicit
  relation table and column names (`addons/lunch/models/res_users.py:10` is a second). Do not copy
  `addons/sales_team/models/res_users.py:9-12`: `crm_team_ids` looks similar but is `compute=`/
  `readonly=True` over `crm.team.member`, not a stored relation table of its own.
- `SELF_READABLE_FIELDS` (`odoo/addons/base/models/res_users.py:176-186`) is an **additional grant**, not a
  restriction: `_has_field_access` is `super()._has_field_access(...) or (... field.name in self._self_accessible_fields()[0])`
  (`res_users.py:571-576`). Internal users read `res.users` fields via ordinary ACL
  (`odoo/addons/base/security/ir.model.access.csv:85` grants `base.group_user` read). **So no
  `SELF_READABLE_FIELDS` override is needed.** Only add one later if a locator must read their *own*
  zones as themselves.
- **Writing `res.users` needs `base.group_erp_manager`** (`ir.model.access.csv:86` is the only write row).
  `group_strataflow_manager` implies `group_strataflow_user`, `sales_team.group_sale_salesman_all_leads`,
  `account.group_account_invoice`, `base.group_partner_manager` (`security/strataflow_security.xml:23`) —
  none of which grant it. **A Dispatcher therefore cannot edit a locator's zones from the user form.**
  Linking a many2many only requires *read* on the comodel (`odoo/orm/fields_relational.py:1495-1505`
  checks `check_access('read')` on newly linked corecords), so membership must be editable from the
  **zone side** (`strataflow.zone.user_ids`), which the Dispatcher will own. This drives the view plan below.
- The stock `res.users` form has a documented override seam: `<group name="other_preferences"/>` inside
  `<page name="preferences">`, `odoo/addons/base/views/res_users_views.xml:184`
  (the page opens at `:167`, and the line above the group carries the comment "This group is meant to be
  used in overrides"); `addons/mail/views/res_users_views.xml:57` is the in-tree example of
  xpath-ing into it.
- Odoo 19 constraint idiom in this addon is the class attribute form:
  `_code_uniq = models.Constraint('unique(code)', '…')` (`models/strataflow_utility.py:15`).
- Demo data: 3 tickets are `new` — `T-26-04187` (2204 12 Ave SE, emergency,
  `demo/strataflow_workorder_demo.xml:43-50`), `T-26-04185` (4511 Bowness Rd NW, `:51-58`),
  `T-26-04166` (240 Midpark Blvd SE, `:104-111`). Four demo locators, `user_nguyen`, `user_kowalski`,
  `user_cardinal`, `user_braun` (`:4-19`), each with exactly one open ticket; `user_nguyen` and
  `user_braun` are `onsite` (busy). No demo partner has a `zip` and no demo ticket has a postal code.
  BACKLOG's note that "demo data has 0 `new` tickets" is stale — there are 3.

## Decision needed

1. **Is a locator who is currently on site eligible for auto-assign?** Today they are excluded outright
   (`geo.js:47`). Options: (a) keep excluding them — but then a zone covered by one locator gets nothing
   the moment that locator goes on site, which defeats the zone rule; (b) make on-site a *tiebreak only* —
   least open load wins, and among equal loads the free locator is preferred.
   **Recommendation: (b).** Assigning is queueing tomorrow's work, not interrupting today's, and the
   locked rule says "least-loaded", not "least-loaded among the idle".
2. **May two zones claim the same postal prefix?** Options: (a) forbid it with a cross-zone constraint —
   one prefix, one zone, no ambiguity, but overlapping city/rural coverage becomes impossible to express;
   (b) allow it, and a ticket matching several zones draws from the union of their locators.
   **Recommendation: (b), no constraint.** Overlap is how real coverage works ("Calgary NW" and
   "Everyone, on call") and the union rule is easy to explain.

## Plan

1. **`models/strataflow_zone.py` (new).** `class StrataflowZone(models.Model)`, `_name = 'strataflow.zone'`,
   `_description = 'Locate Zone'`, `_order = 'name'`. Fields:
   - `name = fields.Char(required=True)` — the dispatcher's label, e.g. "Calgary NW".
   - `postal_prefixes = fields.Char(required=True, help='Comma-separated postal-code prefixes, e.g. T3A, T3B, T3G. Matched against the start of the ticket postal code, case and spacing ignored.')`
   - `user_ids = fields.Many2many('res.users', 'strataflow_zone_res_users_rel', 'zone_id', 'user_id', string='Locators', domain=lambda self: [('group_ids', 'in', self.env.ref('strataflow_workorder.group_strataflow_user').id)])`
     — this is the storing side; the domain mirrors `locator_id`'s at `models/strataflow_workorder.py:44`.
   - `active = fields.Boolean(default=True)`.
   - `_name_uniq = models.Constraint('unique(name)', 'Zone names must be unique.')` — same idiom as
     `models/strataflow_utility.py:15`.

   **Prefixes as a Char, not one-to-many rows.** Recommended, and here is why: matching happens in Python
   over a handful of zones per tenant, so a relational split buys no query power; a second model costs a
   second pair of ACL rows, an editable inline list in the form, and a second thing to keep in step; and
   a dispatcher types "T3A, T3B, T3G" faster than they click three rows. The safety the rows would have
   bought is bought instead by normalisation plus a constraint. Note the ARCHITECTURE rejection of "a
   plain typed Char" was about option (d) — a free-text zone name on ticket *and* locator with no model
   behind it — not about how one zone stores its prefixes.

   Methods on the zone model:
   ```python
   @staticmethod
   def _normalize_postal(value):
       """'t3b 0a1' -> 'T3B0A1'. Also fine for US ZIP ('90210') and ZIP+4."""
       return re.sub(r'[^A-Z0-9]', '', (value or '').upper())

   def _prefixes(self):
       self.ensure_one()
       return [p for p in (self._normalize_postal(tok) for tok in (self.postal_prefixes or '').split(',')) if p]

   @api.constrains('postal_prefixes')
   def _check_postal_prefixes(self):
       for zone in self:
           parts = zone._prefixes()
           if not parts:
               raise ValidationError(_('Zone %s needs at least one postal-code prefix.', zone.name))
           if any(len(p) > 6 for p in parts):
               raise ValidationError(_('A postal-code prefix is at most 6 characters (zone %s).', zone.name))

   @api.model
   def _prefix_map(self):
       """[(zone_id, (prefix, …)), …] for every active zone — built once per request."""
       return [(z.id, tuple(z._prefixes())) for z in self.search([])]

   @api.model
   def _match_ids(self, postal_code, prefix_map=None):
       code = self._normalize_postal(postal_code)
       if not code:
           return []
       pm = self._prefix_map() if prefix_map is None else prefix_map
       return [zid for zid, prefixes in pm if any(code.startswith(p) for p in prefixes)]
   ```
   `search([])` excludes archived zones by default, which is what archiving a zone should mean.

2. **`models/res_users.py` (new).** The inverse side of the same relation:
   ```python
   class ResUsers(models.Model):
       _inherit = 'res.users'
       strataflow_zone_ids = fields.Many2many(
           'strataflow.zone', 'strataflow_zone_res_users_rel', 'user_id', 'zone_id',
           string='Locate zones')
   ```
   Same table and column names as step 1, order swapped. Stock seam / precedent:
   `addons/project/models/res_users.py:7-8` declares a stored `res.users` many2many the same way in this
   tree (`addons/lunch/models/res_users.py:10` is a second).
   Do **not** add it to `SELF_READABLE_FIELDS` (`odoo/addons/base/models/res_users.py:176-186`) — nothing
   reads a user's own zones as that user.

3. **`models/__init__.py`.** Add `from . import strataflow_zone` and `from . import res_users`. Put the
   zone import before `strataflow_workorder` for readability; the order is not load-bearing, since
   `strataflow_workorder` only reaches the zone model at runtime through `self.env['strataflow.zone']`.

4. **`security/ir.model.access.csv`.** Two rows, mirroring the utility rows at `:4-5`:
   ```
   access_strataflow_zone_user,strataflow.zone user,model_strataflow_zone,group_strataflow_user,1,0,0,0
   access_strataflow_zone_manager,strataflow.zone manager,model_strataflow_zone,group_strataflow_manager,1,1,1,1
   ```
   The read row for `group_strataflow_user` is required: `get_board_data` runs as the calling user and a
   plain locator calls it from `locator.js:62`.

5. **`views/strataflow_zone_views.xml` (new).** A list (`name`, `postal_prefixes`, `user_ids`
   `widget="many2many_tags"`), a form (same fields, `user_ids` as `many2many_tags` with the group domain
   doing the filtering), an `ir.actions.act_window` `action_strataflow_zone` with
   `view_mode="list,form"`, and:
   ```xml
   <menuitem id="menu_strataflow_records_zones" name="Zones" parent="menu_strataflow_records"
             action="action_strataflow_zone" sequence="40"/>
   ```
   `menu_strataflow_records` is defined at `views/strataflow_workorder_views.xml:97` and is already
   `groups="group_strataflow_manager"`, so the Dispatcher — and only the Dispatcher — gets the menu.
   **This zone form is the supported way to manage membership**, because a Dispatcher has read but not
   write on `res.users` (see "What is true today"); linking from here only needs read on the comodel
   (`odoo/orm/fields_relational.py:1495-1505`).

6. **`views/strataflow_workorder_views.xml`.** Two edits, plus the `res.users` convenience view:
   - Add `<field name="postal_code"/>` to the form's left group, right after `<field name="address"/>`
     (`:30`) — the site block is address / postal code / lld / parcel.
   - Add `<field name="postal_code" optional="show"/>` to the list after `address` (`:11`).
   - Add a `res.users` form inherit so a system admin can see zones on the user record:
     ```xml
     <record id="view_users_form_strataflow" model="ir.ui.view">
       <field name="name">res.users.form.strataflow</field>
       <field name="model">res.users</field>
       <field name="inherit_id" ref="base.view_users_form"/>
       <field name="arch" type="xml">
         <xpath expr="//group[@name='other_preferences']" position="inside">
           <field name="strataflow_zone_ids" widget="many2many_tags" invisible="share"
                  groups="strataflow_workorder.group_strataflow_user"/>
         </xpath>
       </field>
     </record>
     ```
     Stock seam: `<group name="other_preferences"/>` is Odoo's own override point,
     `odoo/addons/base/views/res_users_views.xml:184`, used the same way by
     `addons/mail/views/res_users_views.xml:57`.

7. **`__manifest__.py`.** Append `'views/strataflow_zone_views.xml'` to `data` **after**
   `'views/strataflow_workorder_views.xml'` (`:19`) — the zone menuitem references
   `menu_strataflow_records`, which that file creates.

8. **`models/strataflow_workorder.py` — the ticket field and its default.**
   - New field next to `parcel` (`:33`):
     `postal_code = fields.Char('Postal code', help='Postal code of the dig site. Drives zone-based auto-assign; not the requester\'s billing address.')`
   - In `create` (`:59-69`), inside the existing per-vals loop and next to the `lead_id` default at
     `:64-68`:
     ```python
     if vals.get('requester_id') and not (vals.get('postal_code') or '').strip():
         vals['postal_code'] = self.env['res.partner'].browse(vals['requester_id']).zip or False
     ```
     `res.partner.zip` is `odoo/addons/base/models/res_partner.py:265`. **Only when empty** — the dig
     site is not the billing address (ARCHITECTURE › "Ticket-side postal code for the zone match").
   - An onchange so the stock form fills it while the dispatcher types, without ever overwriting:
     ```python
     @api.onchange('requester_id')
     def _onchange_requester_id_postal_code(self):
         if self.requester_id and not (self.postal_code or '').strip():
             self.postal_code = self.requester_id.zip or False
     ```

9. **`models/strataflow_workorder.py` — the rule, server-side.**
   **Put the rule on the model, not in `core/geo.js`.** Justification, not preference: (a) the zone data
   lives on `res.users` and `strataflow.zone` and is not in `get_board_data` today — running the rule in
   the browser means shipping the whole zone/locator graph to six screens that do not use it; (b) the USP
   intake (BACKLOG › Open questions) creates tickets with no browser attached and is the second caller of
   this rule by design; (c) `action_assign` is already server-side, so a server rule turns
   `applyRoutes`'s N RPC calls (`dispatch.js:191-194`) into one atomic call; (d) there is no JS test
   harness in this repo and there is a Python one for free — a rule you cannot test is a rule that will
   drift. The client keeps only presentation: drawing the suggested routes.

   Add, in the "payloads for the client actions" section:
   ```python
   def _locator_load(self):
       """{user_id: open ticket count} + {busy user ids}. Single source of truth for
       the crew payload and the auto-assign rule."""
       tickets = self.search([('status', 'in', ('assigned', 'onsite')), ('locator_id', '!=', False)])
       load = {}
       for t in tickets:
           load[t.locator_id.id] = load.get(t.locator_id.id, 0) + 1
       return load, set(tickets.filtered(lambda t: t.status == 'onsite').locator_id.ids)

   def _locators(self):
       return self.env.ref('strataflow_workorder.group_strataflow_user').user_ids.filtered(
           lambda u: not u.share).sorted('name')

   @api.model
   def _auto_assign_plan(self):
       """Zone first, least-loaded among the matches, pure workload when no zone matches.

       Distance plays no part (ARCHITECTURE › "Auto-assign rule"): a ticket with no
       coordinates is a first-class ticket here, which the old greedy router
       (static/src/core/geo.js:45) could not do.
       """
       crew = self._locators()
       if not crew:
           return []
       load, busy = self._locator_load()
       load = {u.id: load.get(u.id, 0) for u in crew}          # running, mutated below
       prefix_map = self.env['strataflow.zone']._prefix_map()
       zones_of = {u.id: set(u.strataflow_zone_ids.ids) for u in crew}
       plan = []
       for t in self.search([('status', '=', 'new')]):          # _order: emergency desc, dig_date, id desc
           zone_ids = set(self.env['strataflow.zone']._match_ids(t.postal_code, prefix_map))
           pool = [u for u in crew if zones_of[u.id] & zone_ids] if zone_ids else []
           reason = 'zone' if pool else ('workload' if not zone_ids else 'zone_empty')
           if not pool:
               pool = list(crew)                                 # locked fallback: pure workload
           pick = min(pool, key=lambda u: (load[u.id], u.id in busy, u.name, u.id))
           load[pick.id] += 1
           plan.append({
               'ticket_id': t.id, 'ticket_name': t.name, 'address': t.address,
               'postal_code': t.postal_code or '', 'emergency': t.emergency,
               'latitude': t.latitude or None, 'longitude': t.longitude or None,
               'user_id': pick.id, 'user_name': pick.name, 'reason': reason,
               'zone_ids': sorted(zone_ids),
           })
       return plan

   @api.model
   def plan_auto_assign(self):
       """Preview only — no writes."""
       return self._auto_assign_plan()

   @api.model
   def apply_auto_assign(self):
       """Recompute and assign. The plan is never taken from the client."""
       assigned = skipped = 0
       for row in self._auto_assign_plan():
           try:
               self.browse(row['ticket_id']).action_assign(row['user_id'])
               assigned += 1
           except UserError:
               skipped += 1     # someone else assigned it between plan and apply
       return {'assigned': assigned, 'skipped': skipped}
   ```
   `min` with the key `(load, busy, name, id)` is the whole tiebreak: least open work first, free before
   on-site, then alphabetical, then id — fully deterministic, so the preview and the apply agree.
   `reason='zone_empty'` marks the honest third case: the ticket *did* match a zone, but nobody is in it —
   worth showing the dispatcher rather than hiding behind the workload fallback.
   `action_assign` (`:71-82`) still does the writing, so tracking and the chatter note (`:81`) are unchanged.

10. **`models/strataflow_workorder.py` — payload additions.** Both are cheap and both are read by six
    screens, so build the prefix map once:
    - `_ticket_payload(self, t, prefix_map=None)` (`:172`): add
      `'postal_code': t.postal_code or ''` and
      `'zone_ids': self.env['strataflow.zone']._match_ids(t.postal_code, prefix_map)`.
    - `get_board_data` (`:192-216`): build `prefix_map = self.env['strataflow.zone']._prefix_map()` once,
      pass it to `_ticket_payload` at `:215`; replace the inline `open_load`/`busy` computation at
      `:197-200` with `load, busy = self._locator_load()`; add `'zone_ids': u.strataflow_zone_ids.ids`
      to each crew row (`:209-212`). Leave the crew sort at `:214` alone.

11. **`static/src/core/geo.js` — `planRoutes` becomes a router, not an assigner.** Replace it with:
    ```js
    /** Order one crew's stops nearest-neighbour from their anchor. Presentation only:
     *  who gets which ticket is decided server-side (strataflow.workorder._auto_assign_plan). */
    export function orderRoute(anchor, stops) { … }   // -> { stops: [...], km }
    ```
    Keep the greedy walk from `geo.js:57-72`, drop the crew loop and the coordinate filter on the input;
    stops without coordinates keep their position in the list and simply contribute 0 km.
    `haversineKm` (`:28-38`), `bboxOf` (`:4-16`) and `project` (`:18-26`) stay — `haversineKm` is also
    imported by `core/locate_geo.js:1`.

12. **`static/src/screens/dispatch.js` — wire the toggle to the server.**
    - `setup()`'s `state` object (`:30-42`): add `plan: []`.
    - Replace the inline toggle with a method:
      ```js
      async toggleAuto() {
          this.state.auto = !this.state.auto;
          this.state.plan = this.state.auto
              ? await this.orm.call("strataflow.workorder", "plan_auto_assign", [])
              : [];
      }
      ```
    - `get routes` (`:138-147`): group `state.plan` by `user_id`, and for each group call
      `orderRoute(this.crewAnchors[userId], stops)`; build
      `coords: [anchor, ...ordered].filter((t) => t?.latitude).map((t) => [t.longitude, t.latitude])`
      exactly as `:145` does today. Keep `color: HUES[crewIndex[userId] % HUES.length]` (`:144`).
      **`crewAnchors` (`:96-106`) is unchanged and stays** — it is now only the route start point, no
      longer a search seed. The `sf_routes` layer contract (`strataline_map.js:215`, `:513`) is untouched.
    - `get routeSummary` (`:149-157`): the empty string at `:152` must lose "with coordinates" — make it
      `_t("Auto-assign · nothing to assign")`. Report from the plan, not from the routes, so
      coordinate-less tickets are counted: `_t("Auto-assign · %(n)s tickets · %(z)s by zone · %(km)s km drawn", …)`.
    - `applyRoutes` (`:189-199`) → one call:
      ```js
      const res = await this.orm.call("strataflow.workorder", "apply_auto_assign", []);
      this.state.auto = false; this.state.plan = [];
      this.notification.add(_t("%s tickets assigned.", res.assigned), { type: "success" });
      if (res.skipped) { this.notification.add(_t("%s tickets were already assigned elsewhere.", res.skipped), { type: "warning" }); }
      await this.load();
      ```
    - Import `orderRoute` instead of `planRoutes` at `:10`.

13. **`static/src/screens/dispatch.xml`.**
    - `:21` — `t-on-click="() => (state.auto = !state.auto)"` → `t-on-click="toggleAuto"`; update the
      `title` from "Suggest routes for all unassigned tickets" to "Assign unassigned tickets by zone, then workload".
    - Add a row to the ticket card `<dl>` (after "Requested by", `:58`):
      `<dt>Postal code</dt><dd class="o_sf_mono" t-esc="sel.postal_code || '—'"/>`.
    - `:95` — the Apply button's `t-if="state.auto and routes.length"` must become
      `t-if="state.auto and state.plan.length"`, or tickets without coordinates (no route line) hide the
      button that assigns them. **This is the same bug as `geo.js:46`, one layer up.**

14. **Zone-aware manual picker** (small, and it stops the manual path contradicting the automatic one).
    - `static/src/core/assign_popover.js:24-36`: accept a `zoneIds` prop (`Array`); an option is
      `inZone = zoneIds.length && c.zone_ids.some((z) => zoneIds.includes(z))`; "Suggested" goes to the
      first non-busy in-zone locator if there is one, else the first non-busy as today; add a `"Zone"` tag
      when `inZone`. The template at `screens/workorders.xml:116` already renders `p.tag`, so no XML change.
    - `static/src/screens/workorders.js:196-200`: pass `zoneIds: t.zone_ids`.
    - `static/src/screens/dispatch.js:108-121` (`get crews`): add `inZone` from `this.sel?.zone_ids`, and
      render it in the crew rail (`dispatch.xml:66-70`) as
      `<span t-if="c.inZone" class="o_sf_status o_sf_status--new">Zone</span>` before the distance.
      `.o_sf_status--new` already exists (`static/src/strataflow.scss:139`) — **no new SCSS is needed anywhere in this task.**

15. **`demo/strataflow_workorder_demo.xml`.** Two zones and three postal codes, chosen so all three
    branches of the rule are visible on a fresh demo DB:
    ```xml
    <record id="zone_calgary_nw" model="strataflow.zone">
        <field name="name">Calgary NW</field><field name="postal_prefixes">T3A, T3B, T3G, T3K, T3L, T3R</field>
        <field name="user_ids" eval="[(6, 0, [ref('user_nguyen')])]"/>
    </record>
    <record id="zone_calgary_se" model="strataflow.zone">
        <field name="name">Calgary SE</field><field name="postal_prefixes">T2C, T2G, T2H, T2Z</field>
        <field name="user_ids" eval="[(6, 0, [ref('user_kowalski')])]"/>
    </record>
    ```
    Then `postal_code` on the three `new` tickets: `T-26-04187` → `T2G 1A1` (`:43-50`, matches Calgary SE),
    `T-26-04185` → `T3B 0A1` (`:51-58`, matches Calgary NW), `T-26-04166` → `T2X 1L9` (`:104-111`, matches
    no zone → workload fallback). `user_cardinal` and `user_braun` stay zone-less on purpose.

16. **`tests/__init__.py` + `tests/test_auto_assign.py` (new).** Odoo auto-discovers a `tests` package;
    the addon's top-level `__init__.py` must **not** import it (`addons/crm/__init__.py` is the in-tree
    example, and `addons/crm/tests/__init__.py:4` shows the import-per-module convention).
    `TransactionCase` covering: prefix normalisation (`t3b 0a1` matches prefix `T3B`); a zone match beats a
    lighter-loaded locator outside the zone; among two in-zone locators the lighter one wins; a ticket with
    no `postal_code` falls back to pure workload and **is** assigned; a ticket with no coordinates is
    assigned (the regression this task exists for); load accrues within one run so five tickets spread
    across the crew; `plan_auto_assign` writes nothing; `apply_auto_assign` produces the same assignment
    the plan showed; a `postal_code` set explicitly on create survives a requester with a different `zip`.

## Files

| path | what changes |
|---|---|
| `addons/strataflow_workorder/models/strataflow_zone.py` | **New.** `strataflow.zone`: name, `postal_prefixes` Char, `user_ids` m2m, `active`, unique name; `_normalize_postal`, `_prefixes`, `_prefix_map`, `_match_ids`, prefix constraint. |
| `addons/strataflow_workorder/models/res_users.py` | **New.** `strataflow_zone_ids` many2many on `res.users`, inverse of `strataflow.zone.user_ids`, same relation table. |
| `addons/strataflow_workorder/models/__init__.py` | Import `strataflow_zone` (before `strataflow_workorder`) and `res_users`. |
| `addons/strataflow_workorder/models/strataflow_workorder.py` | `postal_code` field; default from `requester_id.zip` in `create` and an onchange, only when empty; `_locator_load`, `_locators`, `_auto_assign_plan`, `plan_auto_assign`, `apply_auto_assign`; `postal_code` + `zone_ids` in `_ticket_payload`; `zone_ids` on crew rows and a shared prefix map in `get_board_data`. |
| `addons/strataflow_workorder/security/ir.model.access.csv` | Two `strataflow.zone` rows: read for `group_strataflow_user`, full for `group_strataflow_manager`. |
| `addons/strataflow_workorder/views/strataflow_zone_views.xml` | **New.** Zone list + form + act_window + "Zones" menuitem under `menu_strataflow_records`. |
| `addons/strataflow_workorder/views/strataflow_workorder_views.xml` | `postal_code` on the ticket form and list; `res.users` form inherit adding `strataflow_zone_ids` into `other_preferences`. |
| `addons/strataflow_workorder/__manifest__.py` | Add `views/strataflow_zone_views.xml` to `data`, after `strataflow_workorder_views.xml`. |
| `addons/strataflow_workorder/demo/strataflow_workorder_demo.xml` | Two demo zones with locators; `postal_code` on the three `new` tickets. |
| `addons/strataflow_workorder/static/src/core/geo.js` | `planRoutes` → `orderRoute(anchor, stops)`; no crew loop, no coordinate filter on input. `haversineKm`/`bboxOf`/`project` unchanged. |
| `addons/strataflow_workorder/static/src/screens/dispatch.js` | `state.plan`; `toggleAuto()` fetches the server plan; `routes` derives from the plan via `orderRoute`; `routeSummary` rewritten; `applyRoutes` becomes one `apply_auto_assign` call; `crews` gains `inZone`. |
| `addons/strataflow_workorder/static/src/screens/dispatch.xml` | Toggle calls `toggleAuto`; new title text; postal code row in the card; Apply button gated on `state.plan.length`, not `routes.length`; "Zone" tag in the crew rail. |
| `addons/strataflow_workorder/static/src/core/assign_popover.js` | `zoneIds` prop; "Zone" tag; "Suggested" prefers an in-zone, non-busy locator. |
| `addons/strataflow_workorder/static/src/screens/workorders.js` | Pass `zoneIds: t.zone_ids` when opening the popover. |
| `addons/strataflow_workorder/tests/__init__.py` | **New.** `from . import test_auto_assign`. |
| `addons/strataflow_workorder/tests/test_auto_assign.py` | **New.** `TransactionCase` for the rule, the fallbacks, the no-coordinate case and the postal-code default. |

## Landmines

- **A ticket with no coordinates must survive.** `geo.js:46` filters on `t.latitude && t.longitude` and
  `dispatch.xml:95` gates the Apply button on `routes.length`. Both must go. If either survives the
  rewrite, the exact tickets this task exists for are still silently skipped and the task has failed
  while appearing to work.
- **`crewAnchors` is not dead code.** `dispatch.js:96-106` still feeds `coords` at `dispatch.js:145`,
  which is what `strataline_map.js:513` draws. Deleting it deletes the route lines. It only stops being
  an *assignment* input.
- **`0` is falsy, and so is `""`.** Postal codes are strings and `latitude` is a float; write
  `not (vals.get('postal_code') or '').strip()`, not `not vals.get('postal_code')`, or a whitespace-only
  code silently blocks the default. Odoo stores an empty Char as `False`, so normalise on read everywhere.
- **`--test-tags` implies `--stop-after-init`** (`odoo/tools/config.py:287-307`) and, unlike a plain run,
  will roll the module install into the test transaction. Use a scratch DB for the test run, not
  `strataflow_dev`.
- **Odoo compiled CSS is not whitespace-minified**, and Sass eats CSS `min()`/`max()` with mixed units —
  one such expression breaks the whole bundle and Odoo then serves the *previous* CSS behind a small red
  banner, so it looks like nothing happened. This task should need **no new SCSS at all**
  (`.o_sf_status--new` already exists, `static/src/strataflow.scss:139`). If you add any, grep the new
  file for `min(` / `max(` with mixed units before you reload.
- **`-u strataflow_workorder` is mandatory** after every Python/XML/JS change here; a plain reload serves
  a stale JS bundle and you will debug a rule that is not running. New model + new ACL + new view all
  require the update pass regardless.
- **`post_init_hook` runs on install only, never on `-u`** (`addons/strataflow_workorder/__init__.py:5`).
  Nothing in this task belongs there, and nothing in this task may depend on it having run.
- **Demo data is only loaded with `--with-demo` on a fresh DB.** The zones in step 15 will not appear in an
  existing `strataflow_dev` after `-u`; create them by hand from the new Zones menu, or rebuild the DB.
- **Quote grep globs in zsh**: `--include=*.xml` unquoted expands and the flag vanishes silently. Use
  `--include='*.xml'`.
- **"Verified server-side" is not verified.** Six visual bugs have already shipped past HTTP checks in
  this repo. The route lines and the Apply button must be looked at in a browser.
- **New, found while reading:** a Dispatcher cannot write `res.users` — the only write row is
  `base.group_erp_manager` (`odoo/addons/base/security/ir.model.access.csv:86`). If zone membership is
  only editable from the user form, the Dispatcher gets an AccessError and zones become an admin-only
  feature. Membership must be editable from `strataflow.zone.user_ids`; linking a many2many needs only
  read on the comodel (`odoo/orm/fields_relational.py:1495-1505`). Verify this by testing the Zones form
  as a Dispatcher who is **not** a system administrator.

## Acceptance criteria

- [ ] `strataflow.zone` exists with `name`, `postal_prefixes`, `user_ids`, `active`; duplicate names are
      rejected; a zone with no usable prefix is rejected.
- [ ] `res.users.strataflow_zone_ids` and `strataflow.zone.user_ids` share one relation table — setting
      either side shows on the other.
- [ ] A Dispatcher who is not a system administrator can open Strataflow › Records › Zones, create a
      zone, and add and remove locators on it without an AccessError.
- [ ] `strataflow.workorder.postal_code` exists, appears on the stock form and list, and defaults from
      `requester_id.zip` on create and on the form's requester onchange — **only when it is empty**. A
      postal code typed by hand is never overwritten.
- [ ] `plan_auto_assign()` returns one row per `status = 'new'` ticket, in emergency-first order, each
      naming a locator and a reason of `zone`, `zone_empty` or `workload`. It writes nothing.
- [ ] A ticket whose postal code matches a zone is planned to a locator in that zone, even when a
      locator outside the zone has a lighter load.
- [ ] Among two locators in the matching zone, the one with fewer open (`assigned`/`onsite`) tickets is
      planned; on a tie, the one not currently on site; then by name.
- [ ] A ticket with no postal code, or one matching no zone, is planned by pure workload across the whole
      crew — it is **not** skipped.
- [ ] **A ticket with no `latitude`/`longitude` is planned and assigned.** No code path filters on
      coordinates any more except the drawing of the route line.
- [ ] Load accrues within one run: planning 5 tickets across 4 equally loaded locators produces 4
      distinct locators, not the same one 5 times.
- [ ] `apply_auto_assign()` assigns exactly what the preview showed, in one RPC call, via
      `action_assign`, so chatter notes and `assigned_at` / `assigned_by_id` are still stamped.
- [ ] The dashed route lines still draw on the live Dispatch map when Auto-assign is on, one per locator
      whose line has at least two coordinates — their anchor plus at least one located stop, or two
      located stops when they have no anchor — coloured by that locator's `HUES` entry.
- [ ] "Apply routes" is visible whenever the plan is non-empty, including when no ticket in the plan has
      coordinates and no line is drawn.
- [ ] `routeSummary` never says "with coordinates".
- [ ] The Dispatch crew rail and the Work Orders assign popover tag in-zone locators for the selected
      ticket, and "Suggested" prefers a free in-zone locator.
- [ ] `odoo-bin --test-tags /strataflow_workorder` passes.
- [ ] No file under `static/` gained a `min()` or `max()` with mixed units; the Dispatch screen still
      renders with its own styles (no red asset banner).

## Verification

Rebuild a demo DB so the new demo zones and postal codes load (demo data does not apply on `-u`):

```bash
cd /Users/stefan/strataflow
dropdb strataflow_dev
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  -i strataflow_workorder --with-demo --stop-after-init --log-level=warn   # ~4 min
```

Run the tests on a scratch DB (`--test-tags` implies `--stop-after-init`):

```bash
dropdb strataflow_test 2>/dev/null
.venv/bin/python odoo-bin -d strataflow_test --db_host=localhost --addons-path=addons \
  -i strataflow_workorder --test-tags /strataflow_workorder --log-level=warn
```

Then start the dev server and leave it running:

```bash
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  --dev=xml --http-port=8069 --log-level=warn
```

(After any later Python/XML/JS change, restart it with `-u strataflow_workorder` added.)

Server-side sanity over JSON-RPC as `admin`/`admin` (the agent never types passwords in the browser;
hand a curl session cookie to the tab — DEVLOG 2026-09-08):

- `strataflow.workorder.plan_auto_assign()` must return exactly 3 rows on the fresh demo DB:
  `T-26-04187` (emergency, first) → **D. Kowalski**, reason `zone`;
  `T-26-04185` → **R. Nguyen**, reason `zone`;
  `T-26-04166` → **M. Cardinal**, reason `workload` (all four locators start the run at 1 open ticket;
  by the third row Kowalski and Nguyen have been given one each and sit at 2, so the tie is between
  Cardinal and Braun at 1, and Cardinal wins because Braun is on site).
- Then clear `postal_code` on `T-26-04187` and re-plan: it must still appear, now with reason
  `workload` — proof that a code-less ticket is no longer dropped.
- Clear `latitude` and `longitude` on `T-26-04185` and re-plan: it must still appear, still with reason
  `zone` — this is the regression the whole task is about.

In the browser at **http://localhost:8069/odoo/dispatch**:

1. Click **Auto-assign** in the queue header. The footer must show the summary pill and the **Apply
   routes** button.
2. Look at the map: dashed coloured lines must be drawn, one per locator whose anchor plus stops give
   two or more coordinates, starting from that locator's current ticket. On the fresh demo DB that is
   three lines — Kowalski, Nguyen and Cardinal each have an anchor and one located stop. If nothing
   draws, check the `styleReady` flag —
   `map.isStyleLoaded()` returns false while tiles are still streaming and is not a readiness test
   (`strataline_map.js:508` guards on `styleReady`, set in the `style.load` handler at `:323`).
3. Select `T-26-04166` in the queue. Its card must show **Postal code T2X 1L9**. The crew rail must show
   no "Zone" tag on anyone (it matches no zone). Select `T-26-04187`: **D. Kowalski** must carry a
   "Zone" tag.
4. Now edit `T-26-04185` from Work Orders and blank its `latitude` and `longitude` (or use the stock form
   at Strataflow › Records › Work Orders). Return to Dispatch, toggle Auto-assign: the summary must
   still count 3 tickets, the Apply button must still be visible, and only two lines are drawn.
5. Click **Apply routes**. A single request goes out (check the network tab: one
   `apply_auto_assign`, not three `action_assign`). The toast reports 3 assigned. All three tickets
   move to **Assigned** with the planned locator, and each ticket's chatter carries the
   "Assigned to …" note.
6. As a Dispatcher who is **not** a system administrator (create one: a user in
   `group_strataflow_manager` only), open **Strataflow › Records › Zones**, create a zone, add a locator
   to it, save. No AccessError. Then open that locator's `res.users` form — the zone field is visible but
   read-only-by-ACL there; do not test membership editing from that side.
7. Confirm the Dispatch stylesheet is intact — no small red asset banner at the top of the page, and the
   queue/card/rail still carry their glass styling. Verify compiled CSS with regexes, not exact
   substrings: Odoo's compiled CSS is not whitespace-minified.
