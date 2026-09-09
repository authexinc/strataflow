# 06 — Avatar should open a Strataflow profile, not stock Odoo Discuss

The avatar button in the Strataflow top bar currently navigates the whole browser to `/odoo`, which drops the
user out of the glass shell into the stock Odoo web client on whatever app happens to be first in the menu —
in this database, Discuss. A future session must replace that single mis-aimed navigation with an avatar
**menu** whose first item is a new seventh fullscreen screen, `/odoo/profile`, and whose remaining items are
the things a user actually needs from an avatar: Odoo preferences, sign out, and the deliberate escape hatch
to the stock backend that today's button is the only carrier of. This matters because the avatar is the only
personal control in the product and it is currently the fastest way to leave it by accident; there is no
logout, no preferences and no identity anywhere in the shell.

## The ask

> "9. When avatar clicked it goes to /odoo and opens a discussion page instead of a strataflow profile page"

## What is true today

**The button and its handler.** The avatar is a `<button class="o_sf_round">` in the shell header at
`addons/strataflow_workorder/static/src/core/shell.xml:57-59`. It renders *initials text*, not an image:
`<span class="o_sf_avatar o_sf_avatar--lg"><t t-esc="props.me ? props.me.initials : ''"/></span>`
(`shell.xml:58`). Its click handler is `openOdoo` (`shell.xml:57`), defined at
`addons/strataflow_workorder/static/src/core/shell.js:146-148`:

```js
openOdoo() {
    this.action.doAction({ type: "ir.actions.act_url", url: "/odoo", target: "self" });
}
```

`target: "self"` is a full browser navigation, not a client-side action swap — the OWL shell is torn down.

**Why it lands on Discuss.** `/odoo` is the stock web client entry route
(`addons/web/controllers/home.py:46`, `@http.route(['/web', '/odoo', '/odoo/<path:subpath>', ...])`). With no
action in the URL the web client falls back to the user's home action or the first app in the menu. The
project already recorded this exact behaviour in a docstring:
`addons/strataflow_workorder/controllers/home.py:62-64` — *"Stock sends internal users to `/odoo` with no
action, and the web client then opens the first app in the menu — which in this database is Discuss."* That
comment is about `_login_redirect`; the avatar reproduces the same bug from inside the app.

**The escape hatch is deliberate and must survive.** `addons/strataflow_workorder/controllers/home.py:30-35`
states the rationale: the Home Action was rejected as the landing mechanism *because* it would also hijack
`/odoo`, and *"`/odoo` is the only route back to the stock backend — the shell's avatar button ("Open Odoo",
`core/shell.js` `openOdoo`) goes there, and Odoo 19 has no separate URL for the app switcher to send it to
instead."* Removing `openOdoo` would strand users inside Strataflow. It needs a new home, not deletion.

**There is no user menu at all.** Grepping the module for a dropdown, logout, preferences or user-menu item
returns nothing: the only two round buttons in the header are the avatar (`shell.xml:57`) and the theme
toggle (`shell.xml:60-62`). The stock user menu (`addons/web/static/src/webclient/user_menu/`) is never
mounted, because every Strataflow screen is `static target = "fullscreen"` and paints its own header.

**The six screens and how they are wired.** Each screen is an OWL `Component` that registers itself as a
client action and declares its own URL segment. `screens/invoices.js` is the shortest complete example:

- `static template = "strataflow_workorder.Invoices"` (`screens/invoices.js:13`)
- `static path = "invoices"` (`screens/invoices.js:15`) — the URL segment
- `static components = { StrataflowShell }` (`screens/invoices.js:16`)
- `static props = { ...standardActionServiceProps }` (`screens/invoices.js:17`)
- `static target = "fullscreen"` (`screens/invoices.js:18`)
- data loaded in one `onMounted` (`screens/invoices.js:25`) calling a `load()` that batches
  `this.orm.call(...)` in a `Promise.all` (`screens/invoices.js:28-36`)
- `registry.category("actions").add("strataflow_invoices", InvoicesScreen);` (last line of the file)

`screens/home.js:23-32` is the same shape and carries the comment explaining why its path is `desk`.

**The action records.** `views/strataflow_actions.xml:9-26` holds one `ir.actions.client` per screen with
`name`, `tag` and `path`, plus seven `menuitem` records at lines 28-34 (a Strataflow root plus one per
screen). The file header
(`views/strataflow_actions.xml:3-8`) documents that paths must be unique across every action table, are
lowercase, and may not start with `m-` or `action-`. The file is **not** `noupdate`, so `-u
strataflow_workorder` creates a newly added record.

**Path resolution order — the landmine, verified in this tree.**
`addons/web/static/src/webclient/actions/action_service.js:527-529`:

```js
const [actionRequestKey, clientAction] = actionRegistry.contains(state.action)
    ? [state.action, actionRegistry.get(state.action)]
    : actionRegistry.getEntries().find((a) => a[1].path === state.action) ?? [];
```

The registry **tag** is checked before any component's `static path`. That is why Home is `/odoo/desk`: stock
registers a client action with the tag `home`
(`addons/web/static/src/webclient/actions/client_actions.js:79`).

**I checked the proposed path. Results, verbatim.**

- `grep -rhn 'category("actions").add(' --include="*.js" odoo/addons addons` over the whole tree yields 57
  registration lines / 50 distinct literal tags (the one non-literal is a test module registering a variable
  tag). Neither `profile` nor `strataflow_profile` is among them. The existing six Strataflow tags
  are `strataflow_home`, `strataflow_dispatch`, `strataflow_workorders`, `strataflow_crm`,
  `strataflow_invoices`, `strataflow_locator`.
- `grep -rh '<field name="path">' --include="*.xml" odoo/addons addons` yields 223 distinct action paths
  across all upstream modules (installed or not). `profile` is **not** among them. Near neighbours that
  *are* taken: `my-preferences` (`addons/mail/views/res_users_views.xml:9`), `settings`
  (`addons/base_setup/views/res_config_settings_views.xml:212`), `users`, `internal`, `discuss`.
- `new` is reserved by `odoo/addons/base/models/ir_actions.py:91-92`; the regex at `ir_actions.py:85` is
  `[a-z][a-z0-9_-]*`; uniqueness is re-checked by hand at `ir_actions.py:102` because `ir_actions` is a
  Postgres inheritance parent.

**`profile` is free on both counts.**

**Sign-out, confirmed in this tree.** `addons/web/controllers/session.py:88-91`:

```python
@http.route('/web/session/logout', type='http', auth='none', readonly=True)
def logout(self, redirect='/odoo'):
    request.session.logout(keep_db=True)
    return request.redirect(redirect, 303)
```

The stock user menu drives it with a plain location assignment, not an action
(`addons/web/static/src/webclient/user_menu/user_menu_items.js:119-135`): `browser.location.href = route`
after posting `"user_logout"` to the service worker. There is no service worker in this module, so the
`postMessage` line is not needed.

**Preferences, confirmed in this tree.** Two stock actions exist:

- `base.action_res_users_my` — `target="new"`, a dialog (`odoo/addons/base/views/res_users_views.xml:513-518`).
  `res.users.action_get()` returns exactly this record (`odoo/addons/base/models/res_users.py:731-733`), and
  the stock menu item calls it and sets `res_id` to the current user
  (`addons/web/static/src/webclient/user_menu/user_menu_items.js:58-70`).
- `mail.action_res_users_my_fullpage` — full page, `path` = `my-preferences`
  (`addons/mail/views/res_users_views.xml:4-10`). `mail` is a dependency (`__manifest__.py` `depends`), so
  both exist in this database.

**Avatar image.** `res.users` exposes `avatar_128` and `image_128` to the user's own read
(`odoo/addons/base/models/res_users.py:180-186`, `SELF_READABLE_FIELDS`). The URL form
`/web/image/res.users/<id>/avatar_128` is a live route (`addons/web/controllers/binary.py:171`) and is used
by stock at `addons/auth_timeout/static/src/services/check_identity/check_identity.xml:13`. **But
`avatar_128` is never empty**: `odoo/addons/base/models/avatar_mixin.py:35-43` falls back to a generated
single-letter SVG on a seed-derived hue (`_avatar_generate_svg`, `avatar_mixin.py:65-74`), or a grey
placeholder PNG (`base/static/img/avatar_grey.png`, `avatar_mixin.py:76-81`). Only `image_128` tells you
whether a real photo was uploaded.

**Data seams that already exist.** `strataflow.workorder` carries the screens' RPC endpoints:
`get_board_data` (`models/strataflow_workorder.py:192-216`, returns `me = {id, name, initials,
is_dispatcher}` at `:203`), `get_home_stats` (`models/strataflow_workorder.py:218-239`), `_initials`
(`:165-167`), `_is_dispatcher` (`:169-170`, `has_group('strataflow_workorder.group_strataflow_manager')`).
`OPEN_STATUSES = ('new', 'assigned', 'onsite')` at `models/strataflow_workorder.py:21`. Both Strataflow
groups have read on `strataflow.workorder` (`security/ir.model.access.csv:2-3`), which makes it the right
place to hang a profile RPC.

**Groups.** Two groups, both under one `res.groups.privilege`: `group_strataflow_user` ("Locator") and
`group_strataflow_manager` ("Dispatcher"), `security/strataflow_security.xml:12-26`. The Odoo 19 field is
`privilege_id` (`odoo/addons/base/models/res_groups.py:36`, used at
`security/strataflow_security.xml:15`), and the m2m on the user is `group_ids`
(`odoo/addons/base/models/res_users.py:257`, used at
`models/strataflow_workorder.py:44` in the `locator_id` domain).

**Zones do not exist.** `ARCHITECTURE.md:35` locks the representation — a `strataflow.zone` model, m2m on
`res.users`, matched by postal-code prefix — and explicitly says **"Not built — see `BACKLOG.md`"**. A
repo-wide grep for `zone` in `addons/strataflow_workorder` returns only a demo lead name
(`demo/strataflow_workorder_demo.xml:172`) and a luxon `{ zone: "utc" }` option
(`static/src/core/format.js:8`). There is nothing to show.

**Existing dropdown pattern.** `screens/workorders.js:7-8` imports `Dropdown` and `DropdownItem` from
`@web/core/dropdown/dropdown` and `@web/core/dropdown/dropdown_item`, registers them at
`screens/workorders.js:40`, and drives the menu skin with a `menuClass` getter at `screens/workorders.js:264-266`:

```js
get menuClass() {
    return "o_sf_menu" + (this.theme.theme === "dark" ? " o_sf_theme_dark" : "");
}
```

The template usage is `screens/workorders.xml:48-56`. The menu skin already exists —
`static/src/strataflow.scss:203-206` (`.o_sf_menu`, `.o_sf_menu_item`) — and the theme hook for overlay
containers is at `static/src/strataflow.scss:8-9`: `.o_sf, .o_sf_pop, .o_sf_menu { @include tokens-light; }`
and `.o_sf_menu.o_sf_theme_dark { @include tokens-dark; }`. **This means the avatar dropdown costs almost no
new CSS.**

**Avatar styling.** `.o_sf_round` (the 48px glass circle) at `static/src/strataflow.scss:108`; `.o_sf_avatar`
plus its `--xs/--md/--lg` modifiers at `static/src/strataflow.scss:109-110`. The header sets `active` on the
shell per screen; `screens/locator.xml:5` already passes `active="'locator'"`, a key that is **not** in `NAV`
(`static/src/core/shell.js:8-14`), and the nav simply shows nothing selected. Precedent for a screen outside
the nav exists.

**The ask is accurate.** Nothing in Stefan's sentence is wrong about the code.

## Decision needed

**1. Dropdown menu, or a straight click-through to the profile screen?**

- *Option A — dropdown (recommended).* Clicking the avatar opens an `o_sf_menu` with: **My profile** →
  `/odoo/profile`; **Odoo preferences** → the stock dialog; separator; **Open Odoo backend** → the preserved
  escape hatch; **Sign out**.
- *Option B — direct navigation.* Clicking the avatar goes straight to `/odoo/profile`, and everything else
  lives on that screen.

Recommend **A**. Sign out is the one control that must be reachable in one gesture from any of the six
screens; putting it behind a screen change makes leaving the product slower than it is today. The escape
hatch also reads honestly as a labelled menu item ("Open Odoo backend") instead of an unlabelled avatar that
silently teleports you. The cost is near zero: `Dropdown`, `DropdownItem`, `.o_sf_menu` and the dark-theme
menu class are all already in the codebase (`screens/workorders.js:7-8, 40, 264-266`;
`static/src/strataflow.scss:8-9, 203-206`). If Stefan picks B, step 6 below collapses to a one-line
`doAction` and steps 7-9 move onto the profile screen itself.

**2. Preferences: dialog or full page?**

- *Option A (recommended)* — `res.users.action_get()` → `base.action_res_users_my`, `target="new"`. A dialog
  over the glass shell; the user never leaves Strataflow.
- *Option B* — `mail.action_res_users_my_fullpage` at `/odoo/my-preferences`. A stock full-page form; the
  shell is gone and the user is back in the stock chrome, which is most of the bug being fixed.

Recommend **A**, matching stock's own user menu (`user_menu_items.js:58-70`). Note that the dialog renders in
the stock light palette regardless of the shell's theme (see Landmines).

**3. Anything to show that does not exist yet.** Locator **zone** cannot be shown: `strataflow.zone` is
locked in `ARCHITECTURE.md:35` but not built. Recommendation: ship the profile without a zone row and add it
in the same task that builds zones — do **not** ship a decorative "Zone: —" row.

## Plan

1. **`models/strataflow_workorder.py`** — add one `@api.model` method `get_profile_data(self)` next to
   `get_home_stats` (after `models/strataflow_workorder.py:239`). One round trip, matching the existing
   `get_board_data` / `get_home_stats` / `get_invoice_board` convention. It returns:

   ```python
   {
     'id', 'name', 'login', 'email', 'initials',            # self.env.user, self._initials(user.name)
     'has_photo': bool(user.image_128),                     # NOT avatar_128 — see Landmines
     'is_dispatcher': self._is_dispatcher(),
     'role': 'Dispatcher' | 'Locator',
     'groups': [g.name for g in strataflow groups on the user],   # via privilege_id, see below
     'other_group_count': int,                              # everything else, as a count only
     'company': self.env.company.name,
     'tz': user.tz or '', 'lang': user.lang or '',
     'stats': {'open', 'onsite', 'due_today', 'located_month'},   # scoped to locator_id = user
     'desk_open': int,                                      # desk-wide open, dispatchers only, else None
   }
   ```

   Sources, all confirmed above: `self.env.user` (`login`, `email`, `tz`, `lang`, `image_128` are all in
   `SELF_READABLE_FIELDS`, `odoo/addons/base/models/res_users.py:180-186`); groups from
   `user.group_ids.filtered(lambda g: g.privilege_id == self.env.ref('strataflow_workorder.res_groups_privilege_strataflow'))`
   — the Odoo 19 field is `privilege_id`, `security/strataflow_security.xml:15`; ticket counts from
   `self.search_count([...])` using `OPEN_STATUSES` (`models/strataflow_workorder.py:21`) and
   `locator_id = self.env.user`. Do **not** add an `ir.model.access` line: the method lives on
   `strataflow.workorder`, which both groups already read (`security/ir.model.access.csv:2-3`).

2. **`views/strataflow_actions.xml`** — add, after the locator record (`views/strataflow_actions.xml:24-26`):

   ```xml
   <record id="action_strataflow_profile" model="ir.actions.client">
       <field name="name">Profile</field><field name="tag">strataflow_profile</field><field name="path">profile</field>
   </record>
   ```

   Do **not** add a `menuitem` — profile is reached from the avatar, not from the Odoo app menu.

3. **`static/src/screens/profile.js`** (new) — copy the shape of `screens/invoices.js:12-18` exactly:
   `static template = "strataflow_workorder.Profile"`, `static path = "profile"`,
   `static components = { StrataflowShell }`, `static props = { ...standardActionServiceProps }`,
   `static target = "fullscreen"`; `setup()` gets the `orm` / `action` / `notification` services and
   `useTheme()` from `../core/theme`; `onMounted` does one
   `this.orm.call("strataflow.workorder", "get_profile_data", [])`; the file ends with
   `registry.category("actions").add("strataflow_profile", ProfileScreen);`.
   The three path declarations that must agree: `path` in step 2, `static path` here, and — since profile is
   not a landing target — nothing else. `HOME_URL` in `controllers/home.py:20` stays `/odoo/desk`; do not
   touch it.
   Handlers on the component: `openPreferences()` (step 8's action, so it works from the screen too),
   `openOdoo()`, `signOut()`, `toggleTheme()` re-exported from `../core/theme`.

4. **`static/src/screens/profile.xml`** (new) — `<t t-name="strataflow_workorder.Profile">` wrapping
   `<StrataflowShell active="'profile'" me="state.me" loading="state.loading" skeleton="'grid'"
   bgmap="'home'" scroll="true">`. `active="'profile'"` is deliberately not in `NAV`
   (`static/src/core/shell.js:8-14`); the nav renders with nothing selected, exactly as the Locator screen
   already does (`screens/locator.xml:5`). Do not pass `searchPlaceholder` — there is nothing to search.
   Content, in `.o_sf_panel` cards inside a centred column:

   - **Identity** — a large avatar (`<img src="/web/image/res.users/{id}/avatar_128"/>` when
     `state.data.has_photo`, else the existing `.o_sf_avatar` initials chip at a new `--xl` size), the name,
     the login/email, the role badge (`.o_sf_status`), and the company name.
   - **My work** — four `.o_sf_pill--sm` stat chips: open, on site, due today, located this month. For a
     dispatcher, one extra line "desk-wide: N open". A `.o_sf_btn` "Open my work orders" runs
     `doAction({type: "ir.actions.client", tag: "strataflow_workorders"}, {clearBreadcrumbs: true})` —
     the same call `goNav` makes (`static/src/core/shell.js:134-135`).
   - **Preferences** — the theme control (a light/dark segmented pair calling `toggleTheme()` from
     `static/src/core/theme.js:28-38`), with a one-line note that the theme is stored per device
     (`localStorage` under the key `strataflow.theme`, `theme.js:3, 32`) and that stock Odoo views stay
     light. A "Odoo preferences" button
     (step 8).
   - **Access** — the Strataflow group names as chips, plus "+N other groups", plus the sentence that access
     is changed by an administrator. No editing here.
   - **Session** — "Open Odoo backend" (the escape hatch, with the subtitle "the stock Odoo client — records,
     settings, apps") and "Sign out" as `.o_sf_btn--primary`/danger.

   No zone row (Decision 3).

5. **`static/src/strataflow.scss`** — append a `// ---- profile ----` section next to the home section
   (which runs `static/src/strataflow.scss:208-226`, ending where `// ---- dispatch ----` starts at
   `:227`): `.o_sf_profile` (centred column, `max-width: 760px`, same
   `padding: 130px 24px 90px` as `.o_sf_home` at `:209`), `.o_sf_profile_head`, `.o_sf_profile_grid`, and an
   `&--xl` modifier on `.o_sf_avatar` (`static/src/strataflow.scss:109-110`) at 64px. Reuse `.o_sf_panel`,
   `.o_sf_pill--sm`, `.o_sf_chip`, `.o_sf_btn`, `.o_sf_status`, `.o_sf_eyebrow` rather than inventing new
   primitives. The `static/src/**/*.scss` glob in `__manifest__.py` already sweeps this file — do **not**
   add an `@import`.

6. **`static/src/core/shell.js`** — import `Dropdown` from `@web/core/dropdown/dropdown` and `DropdownItem`
   from `@web/core/dropdown/dropdown_item`, and give `StrataflowShell` a
   `static components = { Dropdown, DropdownItem }` (it declares none today — see `shell.js:44-58`), and add a
   `menuClass` getter copied from `screens/workorders.js:264-266`. Replace `openOdoo`
   (`static/src/core/shell.js:146-148`) with four handlers: `openProfile()`, `openPreferences()`,
   `openOdoo()` (unchanged body — the escape hatch stays), `signOut()`.

7. **`static/src/core/shell.xml`** — replace lines 57-59 with a `<Dropdown menuClass="menuClass"
   position="'bottom-end'">` whose trigger is the same `<button class="o_sf_round">` carrying the same
   `.o_sf_avatar--lg` initials span, and whose `content` slot holds four `<DropdownItem class="'o_sf_menu_item'">`
   entries plus a separator, in this order: **My profile**, **Odoo preferences**, **Open Odoo backend**,
   **Sign out**. Keep an `aria-label` on the trigger ("Account menu"). Give the trigger a real title
   attribute; today's is `title="Open Odoo"` (`shell.xml:57`) and is about to become a lie.

8. **Preferences handler** (`shell.js`, and the same method on `profile.js`) — stock seam,
   `addons/web/static/src/webclient/user_menu/user_menu_items.js:58-70`:

   ```js
   async openPreferences() {
       const action = await this.orm.call("res.users", "action_get", []);
       action.res_id = user.userId;                 // `user` from "@web/core/user"
       this.action.doAction(action);
   }
   ```

   `res.users.action_get` is `odoo/addons/base/models/res_users.py:731-733` and returns
   `base.action_res_users_my`, which is `target="new"` (`odoo/addons/base/views/res_users_views.xml:513-518`)
   — a dialog over the shell. `StrataflowShell` does not currently use the `orm` service
   (`static/src/core/shell.js:60-62`); add `this.orm = useService("orm")` in its `setup`.

9. **Sign-out handler** (`shell.js`, and the same method on `profile.js`) — stock seam,
   `addons/web/controllers/session.py:88-91`:

   ```js
   signOut() {
       browser.location.href = "/web/session/logout?redirect=/";
   }
   ```

   `browser` from `@web/core/browser/browser`, as stock does at `user_menu_items.js:131`. `?redirect=/` is
   explicit on purpose: the route's default is `/odoo`
   (`addons/web/controllers/session.py:89`), and `/` is the route this module already owns
   (`controllers/home.py:48-57`), which sends a signed-out visitor to `/odoo/desk` and therefore to
   `/web/login?redirect=/odoo/desk` — so the next sign-in lands back on the Strataflow Home screen instead of
   the stock backend.

10. **Nothing else changes.** `controllers/home.py` is untouched: `HOME_URL` stays `/odoo/desk`, and no new
    landing behaviour is introduced. `screens/home.js` `APPS` (`screens/home.js:12-21`) does **not** get a
    profile tile — the avatar is the entry point.

## Files

| path | what changes |
|---|---|
| `addons/strataflow_workorder/models/strataflow_workorder.py` | new `@api.model get_profile_data()` after `get_home_stats` (`:239`) |
| `addons/strataflow_workorder/views/strataflow_actions.xml` | new `action_strataflow_profile` record, `tag=strataflow_profile`, `path=profile`; no menuitem |
| `addons/strataflow_workorder/static/src/screens/profile.js` | **new** — `ProfileScreen`, `static path = "profile"`, registers `strataflow_profile` |
| `addons/strataflow_workorder/static/src/screens/profile.xml` | **new** — `strataflow_workorder.Profile` template, five cards inside `StrataflowShell` |
| `addons/strataflow_workorder/static/src/core/shell.js` | `Dropdown`/`DropdownItem` components, `orm` service, `menuClass` getter, `openProfile`/`openPreferences`/`signOut`; `openOdoo` body unchanged |
| `addons/strataflow_workorder/static/src/core/shell.xml` | lines 57-59 become a `Dropdown` with four items; trigger keeps `.o_sf_round` + `.o_sf_avatar--lg` |
| `addons/strataflow_workorder/static/src/strataflow.scss` | new `.o_sf_profile*` section; `&--xl` added to the `.o_sf_avatar` modifier list (`:109-110`) |

No new asset entries: the three `strataflow_workorder/static/src/**/*.scss` / `*.js` / `*.xml` globs in
`__manifest__.py:39-41` already sweep new files in `static/src/screens/`.

## Landmines

- **An action path must be unique across every action table AND must never equal a stock client-action tag.**
  The resolver checks the registry tag first (`addons/web/static/src/webclient/actions/action_service.js:527-529`),
  which is why Home is `/odoo/desk` (`screens/home.js:25-29`). I checked `profile` before writing this brief:
  it is not among the 50 registered action tags, and not among the 223 action `path` values in `odoo/addons`
  + `addons`. Re-run the check if you change the proposed path:
  `grep -rhn 'category("actions").add(' --include="*.js" odoo/addons addons` and
  `grep -rh '<field name="path">' --include="*.xml" odoo/addons addons`.
- **Quote your grep globs in zsh.** Unquoted `--include=*.xml` expands against the cwd and the flag silently
  vanishes, so the two greps above must keep their quotes.
- **The path declarations must stay in step.** Two here: `<field name="path">profile</field>` in
  `views/strataflow_actions.xml` and `static path = "profile"` in `screens/profile.js`. `HOME_URL`
  (`controllers/home.py:20`) is not involved and must not be changed.
- **Sass eats CSS `min()`/`max()` with mixed units.** `min(52%, 460px)` threw *"Incompatible units: px and
  %"*, broke the whole stylesheet bundle, and Odoo then served the **previous** CSS with only a small red
  banner — so a broken build looks exactly like a change that did nothing. The profile column wants a width
  cap; write `max-width: 760px` on a `width: 100%` element, never `width: min(90%, 760px)`. Grep new SCSS for
  `min(` / `max(` before restarting.
- **Odoo forbids `@import` between asset files.** `static/src/strataflow.scss` gets the new rules appended;
  do not create a separate `profile.scss` that imports `tokens.scss`.
- **Odoo compiled CSS is not whitespace-minified.** If you verify the bundle over HTTP, match with a regex
  (`o_sf_profile[^{]*\{`), not an exact substring.
- **Odoo CE has no dark mode.** `ir.http.color_scheme()` is hard-coded to `light`
  (`addons/web/models/ir_http.py:77-78`), and
  `static/src/stock/stock.scss:17` forces `tokens-light` on `.o_web_client`. Consequences here: (a) the
  "Odoo preferences" dialog and the stock backend behind "Open Odoo backend" render light even when the
  shell is dark — expected, not a bug; (b) the profile's theme control must be labelled as affecting the
  Strataflow shell, and (c) the dropdown menu lives in the overlay container **outside** `.o_sf`, so it only
  gets dark tokens through the `menuClass` getter (`static/src/strataflow.scss:9`,
  `.o_sf_menu.o_sf_theme_dark`). Forget the getter and the menu renders light on a dark screen.
- **Never take a stock field or API from memory.** Everything named above was read in this tree:
  `res.users.image_128` / `avatar_128` / `group_ids` (`odoo/addons/base/models/res_users.py:180-186`),
  `res.groups.privilege_id` (`odoo/addons/base/models/res_groups.py:36`), `res.users.action_get`
  (`odoo/addons/base/models/res_users.py:731-733`), `/web/session/logout`
  (`addons/web/controllers/session.py:88`), `/web/image/<model>/<id>/<field>`
  (`addons/web/controllers/binary.py:171`). luxon is a global, not an import
  (`static/src/core/format.js:1`) — not needed here unless you format a date.
- **"Verified server-side" is not verified.** Visual bugs have repeatedly shipped past every HTTP check and
  were caught in the first minute of actually looking — the 2026-09-09 DEVLOG entry lists five found in one
  browser pass. A 200 on `/odoo/profile` proves the action resolved, not that the
  screen renders. Open it.
- **New: `avatar_128` is never falsy.** `odoo/addons/base/models/avatar_mixin.py:35-43` generates a
  single-letter SVG on a seed-derived hue (or a grey PNG placeholder) whenever `image_128` is empty. Testing
  `has_photo` against `avatar_128` therefore always passes and would replace the shell's brand-blue initials
  chip with Odoo's random-hue letter. Test `image_128`.
- **New: the full-page preferences action defeats the purpose.** `mail.action_res_users_my_fullpage`
  (`addons/mail/views/res_users_views.xml:4-10`) navigates to `/odoo/my-preferences` in the stock chrome —
  the same class of exit this task exists to stop. Use the `target="new"` dialog.
- **New: `/web/session/logout` defaults to `redirect='/odoo'`** (`addons/web/controllers/session.py:89`).
  Left at the default, a sign-out bounces through `/odoo` → `/web/login?redirect=/odoo`, which this module's
  `_is_placeholder` (`controllers/home.py:81-87`) happens to neutralise — but relying on that is fragile.
  Pass `?redirect=/` and let `StrataflowHome.index` (`controllers/home.py:48-57`) do the work.
- **New: `views/strataflow_actions.xml` is not `noupdate`**, so `-u strataflow_workorder` creates the new
  action record. (Contrast `data/strataflow_crm_account_data.xml`, which is `noupdate="1"`, and
  `post_init_hook`, which runs on install only — neither is involved here.)

## Acceptance criteria

- [ ] Clicking the avatar in any of the six screens opens a glass dropdown; it never navigates the browser.
- [ ] The dropdown contains exactly: My profile, Odoo preferences, Open Odoo backend, Sign out.
- [ ] "My profile" lands on `/odoo/profile` — the URL bar reads `/odoo/profile`, the glass shell stays
      mounted, and no stock Odoo navbar appears.
- [ ] Reloading `/odoo/profile` directly renders the profile screen (not Discuss, not the app switcher).
- [ ] The profile screen shows: name, login/email, role (Dispatcher or Locator), company, the four personal
      ticket counts, the Strataflow group chips, a theme control, and the Preferences / Open Odoo / Sign out
      actions.
- [ ] A user with no uploaded photo sees the brand-blue initials chip, not Odoo's generated letter SVG.
- [ ] "Odoo preferences" opens the preferences form as a dialog over the shell; closing it leaves the user on
      the same screen.
- [ ] "Open Odoo backend" still reaches the stock web client — the escape hatch documented at
      `controllers/home.py:30-35` survives.
- [ ] "Sign out" ends the session and lands on the Strataflow login page; signing back in returns to
      `/odoo/desk`, not to Discuss.
- [ ] The dropdown renders with dark tokens when the shell is in dark mode.
- [ ] No zone row is present anywhere on the screen.
- [ ] The stylesheet bundle compiles: no red banner, and `.o_sf_profile` rules are present in the served CSS.

## Verification

1. Restart the server with an upgrade — Python, XML, JS and SCSS all changed:

   ```
   .venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
       --dev=xml --http-port=8069 --log-level=warn -u strataflow_workorder
   ```

   Watch the startup log: a Sass error in `strataflow.scss` and an `ir.actions` path-uniqueness
   `ValidationError` both surface here.

2. Confirm the action record landed and the path is unique:

   ```
   psql strataflow_dev -c "select id, path from ir_actions where path in ('profile','desk','invoices');"
   ```

   Exactly one row for `profile`.

3. Confirm the CSS actually rebuilt (regex, not substring — the bundle is not minified):

   ```
   curl -s 'http://localhost:8069/web/assets/any/web.assets_backend.css' | grep -cE 'o_sf_profile'
   ```

   Non-zero.

4. **In the browser automation tab** — this is the only verification that counts; log in as `admin`/`admin`
   by handing the tab a curl session cookie (never type the password), per DEVLOG 2026-09-08:

   - Open `http://localhost:8069/odoo/dispatch`. Click the avatar. A glass menu appears **under** the avatar
     and the URL does not change.
   - Click **My profile**. URL becomes `/odoo/profile`; the glass header is still there; no Odoo navbar; no
     Discuss.
   - Read the page: name, login, role badge, company, four ticket counts, group chips.
   - Hit browser reload on `/odoo/profile`. Same screen (this is the path-resolution check).
   - Flip the theme toggle in the header, then reopen the avatar menu: the menu is dark. Check the profile
     cards read correctly in both themes.
   - Click **Odoo preferences**: a dialog opens over the shell. Close it — you are still on the profile
     screen.
   - Click **Open Odoo backend**: the stock web client loads. Go back to `/odoo/desk`.
   - Click **Sign out**: you land on the Strataflow login page. Sign back in; you land on `/odoo/desk`.
   - Read the console: no OWL errors, no 404 on the avatar image request.

5. Review the finished screen with the `apple-design` skill before and after, per `CLAUDE.md`
   non-negotiables.
