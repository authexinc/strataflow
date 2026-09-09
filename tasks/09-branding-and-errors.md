# 09 — Tab branding, favicon, and a designed 404 page

Two independent pieces of the same complaint: the browser tab still says Odoo and shows Odoo's favicon, and every error a tenant can reach is served by a stock page that carries Odoo's logo in the header and "Powered by Odoo" in the footer. This task produces the module's first image assets (there are none today), wires them through the one stock seam that exists for them, and replaces the reachable error pages with a Strataflow-language page. Two commits: **A — branding**, **B — errors**. Neither depends on the other.

## The ask

> "14. Need to change favicon and odoo branding in tab"

> "13. Design 404 page"

## What is true today

### The module overrides neither, and owns no images

`addons/strataflow_workorder/__manifest__.py:11-19` lists three view files. The only template inherits in the whole module are `views/strataflow_login.xml:6` (`web.login_layout`), and `views/strataflow_workorder_views.xml:63` / `:75` / `:87` (`crm.crm_lead_view_form`, `account.view_move_form`, `base.view_partner_form`). **There is no `web.layout` inheritance and no error template of any kind.**

`find addons/strataflow_workorder/static -name "*.ico" -o -name "*.png" -o -name "*.svg"` returns **zero files**. `static/description/` exists and is empty. `__manifest__.py` declares no `icon` key. `models/__init__.py:1-5` imports `strataflow_utility`, `strataflow_workorder`, `crm_lead`, `account_move`, `res_partner` — there is no `ir_http.py`. `controllers/__init__.py:1-2` imports `export` and `home` only.

### Branding — what actually renders

**The favicon.** `addons/web/views/webclient_templates.xml:17` is `web.layout`; line 23 is the only favicon link in the backend:

```xml
<link type="image/x-icon" rel="shortcut icon" t-att-href="x_icon or '/web/static/img/favicon.ico'"/>
```

`x_icon` is the seam. Its only producers in this tree are `webclient_templates.xml:377` (the scoped-app installer) and `addons/website/views/website_templates.xml:120` (`website` is not installed here), so in practice every page falls through to `/web/static/img/favicon.ico` — `addons/web/static/img/favicon.ico`, 1150 bytes, one 16×16 image (`file` output: "MS Windows icon resource - 1 icon, 16x16, 32 bits/pixel"). There is no `res.company.favicon` field in Odoo 19 CE: `grep -rn favicon --include="*.py" --include="*.xml" odoo/addons/base addons/web addons/portal addons/mail` matches only `webclient_templates.xml:23` and `addons/mail/views/discuss_public_templates.xml:10` (a private copy for the public Discuss page, out of scope). **`x_icon` on `web.layout` is the whole story.**

**The tab title.** `webclient_templates.xml:22` is `<title t-esc="title or 'Odoo'"/>`. `web.webclient_bootstrap` (`:275-311`) sets `head` and `body_classname` and **never sets `title` or `x_icon`**, and `Home.web_client` renders it with `webclient_rendering_context()` (`addons/web/controllers/home.py:68`, `addons/web/models/ir_http.py:71-75`), which returns only `color_scheme` and `session_info`. So the server-rendered first paint of every backend page is literally `<title>Odoo</title>`. `web.login` (`webclient_templates.xml:136`) sets no title either — **the sign-in tab reads "Odoo"**, which is the most visible instance of the complaint since it is the first page a tenant sees.

Once the web client boots, `title_service.js` takes over. `addons/web/static/src/core/browser/title_service.js:36-44`:

```js
const counter = Object.values(titleCounters).reduce((acc, count) => acc + count, 0);
const name = Object.values(titleParts).join(" - ") || "Odoo";
```

Parts are a plain object, so **the tab title is the parts joined by `" - "` in insertion order**, with an unread-counter prefix. `setParts` deletes any key whose value is falsy (`:24-34`). The service is registered at `:60`. In CE there is exactly one writer: `action_service.js:900` and `:1036`, both `setParts({ action: controller.displayName })`. (`addons/mail/static/src/discuss/core/public/discuss_patch.js:13` and `addons/website/.../website_builder_action.js:363` also write `action`, but neither module's code path is reachable here.) **No module JS references `document.title` or the title service** — `grep -rn "document.title\|title_service" static/src` is empty.

Net effect: the six screens' tabs read `Home`, `Dispatch`, `Work Orders`, `CRM`, `Invoices`, `Locator view` — the `name` field of each `ir.actions.client` in `views/strataflow_actions.xml:9-26`. **So the ask is half wrong: after boot the tab does not say "Odoo" on a Strataflow screen; it says the screen name with no brand at all.** The literal string "Odoo" appears in the tab (a) on the login page, (b) for the ~300 ms of server-rendered HTML before the web client boots on every backend load, and (c) on any stock page where the action has no display name yet.

**Other Odoo brand leaks in the same head, all in `web.webclient_bootstrap`:**
- `webclient_templates.xml:279` — `<meta name="theme-color" content="#71639e"/>`, Odoo purple. This paints the browser UI on Android and the title bar of an installed PWA.
- `webclient_templates.xml:281` — `<link rel="apple-touch-icon" href="/web/static/img/odoo-icon-ios.png"/>`.
- `webclient_templates.xml:280` — the PWA manifest. `addons/web/controllers/webmanifest.py:43-61` builds it: `name` comes from the `web.web_app_name` config parameter, defaulting to `'Odoo'` (`:44`); `background_color` and `theme_color` are hard-coded `#714B67` (`:50-51`); icons are `/web/static/img/odoo-icon-192x192.png` and `-512x512.png` (`:55-59`). `_icon_path()` (`:91-92`) returns `web/static/img/odoo-icon-192x192.png` and feeds the offline page (`:94-99`). **`web.web_app_name` is a supported config-parameter seam; the icons need a Python override.**
- The app switcher tile. `addons/web/models/ir_ui_menu.py:66-71`: when a root menu has no `web_icon_data` and no background colour in `web_icon`, `web_icon_data` falls back to `/web/static/img/default_icon_app.png`. `menu_strataflow_root` (`views/strataflow_actions.xml:28`) sets no `web_icon`, so the Strataflow app tile is Odoo's generic placeholder.
- The Apps list. `odoo/modules/module.py:380-396`: with no `icon` in the manifest and no `static/description/icon.png` on disk, `get_module_icon` returns `/base/static/description/icon.png` — Odoo's default. Both conditions hold here.

**The brand mark exists, but only as inline SVG.** `static/src/core/shell.xml:27-31` and `views/strataflow_login.xml:67-71` carry the same three-stroke wave, twice, in `#f2b705` / `#de2d26` / `#0f6ed8` (the APWA yellow and red are the gas and power utility colours in `data/strataflow_utility_data.xml:5` and `:8`, which the locate PDF reads at `controllers/export.py:110`; the blue is `--accent`, `static/scss/tokens.scss:37`), `stroke-width="2"`, `stroke-linecap="round"`, `viewBox="0 0 24 24"`. Its tile in the UI is `--logo-bg: #fbfcfa` with a `--logo-edge` hairline and 12 px radius (`tokens.scss:42`, `static/login/login.scss:132-135`). **There is no file form of it.**

### Errors — what is actually reachable, and what each one renders

`http_routing` **is installed**: `strataflow_workorder` depends on `account` (`__manifest__.py:9`), `account` depends on `portal` (`addons/account/__manifest__.py:17`), `portal` depends on `http_routing` (`addons/portal/__manifest__.py:17`). This matters, because `http_routing` is the module that turns exceptions into HTML pages.

The real hook, found in this tree, is **`ir.http._handle_error`**, not `_handle_exception` (that name is gone in 19). `odoo/http.py:117-120` documents it; it is called from `Request._update_served_exception` at `odoo/http.py:2355` and from `_serve_ir_http_fallback` at `odoo/http.py:2374`. Base implementation: `odoo/addons/base/models/ir_http.py:367-368`, one line, `return request.dispatcher.handle_error(exception)`. `http_routing` extends it at `addons/http_routing/models/ir_http.py:570-607`, and the extension gates on one thing:

```python
is_frontend_request = bool(getattr(request, 'is_frontend', False))
if not is_frontend_request or not isinstance(response, HTTPException):
    return response          # neither handle backend requests nor plain responses
```
(`addons/http_routing/models/ir_http.py:573-576`)

When the gate passes it renders `http_routing.<code>` through `_get_error_html` (`:561-568`), falling back to `http_routing.4xx` for any 4xx with no template. `_get_exception_code_values` (`:525-553`) supplies `exception`, `traceback`, `error_message`, `status_code`, `status_message`. `is_frontend` is set in `_match`: `True` only for routes declared `website=True` (`:375`, `:473`), **or** — critically — `True` unconditionally when nothing matched at all (`:476-480`).

Given that, here is every error a tenant user can actually reach:

**1. An unknown non-`/odoo` path** (a typo'd bookmark, `/dispach`, `/favicon.ico` before it exists). Nothing matches → `is_frontend = True` (`http_routing/models/ir_http.py:478`) → `http_routing.404` renders. That template is `addons/http_routing/views/http_routing_template.xml:119-153`, and it is bad for us in four specific ways:
   - It calls `web.frontend_layout` **without** `no_header`/`no_footer`, so it renders the company-logo header (`webclient_templates.xml:60-63`) and the footer whose copyright block calls `web.brand_promotion` (`:77`) → `web.brand_promotion_message` (`:87-99`) → the words "Powered by" plus `/web/static/img/odoo_logo_tiny.png`. **A tenant's 404 currently advertises Odoo.**
   - `:128` pulls an illustration from `/html_editor/shape/http_routing/404.svg?c2=o-color-2` (route at `addons/html_editor/controllers/main.py:550`; the file is `addons/http_routing/static/shapes/404.svg`).
   - `:134` invites the user to "send us a message on [this page]" linking `/contactus`, **which does not exist in this database** — `website` is not installed, so that link produces a second 404.
   - `:144` offers one button, `<a href="/">Home</a>`. That one is fine here and must be preserved (see Landmines).
   Sibling templates `403` (`:100-117`), `4xx` (`:62-79`) and `http_error` (`:3-14`) have the same header/footer problem. `4xx` reads "Oops! Something went wrong."; `403` reads "403: Forbidden" over "The page you were looking for could not be authorized."; `http_error` renders only `<status_code>: <status_message>`.

**2. An unknown `/odoo/...` path — never a 404 at all.** `addons/web/controllers/home.py:46` routes `['/web', '/odoo', '/odoo/<path:subpath>', '/scoped_app/<path:subpath>']` to `web_client`, so `/odoo/dispach` matches, the web client boots, and resolution happens client-side. `action_service.loadState` (`action_service.js:1769`) calls `doAction`, `/web/action/load` raises `MissingActionError` (`addons/web/controllers/action.py:39`), and `loadState` catches exactly that name (`action_service.js:1791`) and fires `WEBCLIENT:LOAD_DEFAULT_APP` (`:1800`). `webclient.js:56` routes that to `_loadDefaultApp` (`:143-150`), which selects `root.children[0]`.

   **That first child is Discuss, not Strataflow.** `mail.menu_root_discuss` has `sequence="5"` (`addons/mail/views/mail_menus.xml:3-9`) and `menu_strataflow_root` also has `sequence="5"` (`views/strataflow_actions.xml:28`); `ir.ui.menu._order` is `"sequence,id"` (`odoo/addons/base/models/ir_ui_menu.py:19`), and `mail` is installed before `strataflow_workorder`, so mail's id is lower and it wins. **A user who mistypes a screen URL is silently dropped into Discuss with no message.** This is the error case the ask is really about and it is invisible today.

**3. The locate-PDF export with a bad id.** `controllers/export.py:58-59` is `@http.route('/strataflow/workorder/<int:wo_id>/locate.pdf', type='http', auth='user')`; there is no `abort`, no `exists()`, no `try/except`. It is opened by `static/src/screens/workorders.js:270` as `window.open(..., "_blank")`, so any failure surfaces **as a raw page in a new tab**.
   - Nonexistent id: `wo.check_access('read')` (`export.py:61`) passes — `_check_access` (`odoo/orm/models.py:4141-4164`) finds the ACL row `access_strataflow_workorder_user` (`security/ir.model.access.csv:2`) and there are **no `ir.rule` records for this model anywhere in `security/strataflow_security.xml`** — so it returns `None`. The failure happens further down at `wo.name` (`export.py:72`), raising `MissingError("Record does not exist or has been deleted.")` (`odoo/orm/fields.py:1712`).
   - `MissingError.http_status` is 404 (`odoo/exceptions.py:99-106`); it subclasses `UserError`, so `HttpDispatcher.handle_error` converts it to `werkzeug_default_exceptions[404](exc.args[0])` (`odoo/http.py:2534-2538`). The route is not `website=True`, so `is_frontend` is `False` (`http_routing/models/ir_http.py:375`) and the http_routing gate at `:574` returns the exception untouched. **The user gets werkzeug's built-in white page — `<title>404 Not Found</title>`, `<h1>Not Found</h1>`, and the ORM's internal sentence as the body.**
   - A signed-in user without `group_strataflow_user` gets the same treatment with `AccessError` (`http_status` 403, `odoo/exceptions.py:77-84`) and the ACL message.
   - A non-integer segment (`/strataflow/workorder/abc/locate.pdf`) does **not** match the `<int:>` converter, so it falls into case 1 and renders `http_routing.404` — the same URL family, two different-looking errors.

**4. A missing or forbidden record inside a stock view** (reached through the shell's "Open Odoo" escape hatch, `core/shell.js` `openOdoo`). These are `type="jsonrpc"` calls; `JsonRPCDispatcher.handle_error` (`odoo/http.py:2604-2627`) returns a JSON error and the web client shows its own dialog. **Not an HTML page, out of scope for this task.**

**5. `500`.** `http_routing.500` (`http_routing_template.xml:193-245`) carries a standing comment at `:194-198`: it must not use any variable or asset beyond what `_handle_error` provides, because the cursor may be broken while it renders. **Do not touch it.**

### Ground the design must reuse

- `static/scss/tokens.scss` — `@mixin tokens-light` (`:31-48`), `tokens-dark` (`:49-63`), `@mixin glass($bg)` (`:65-72`), `@mixin eyebrow` (`:73`), `@mixin ink-btn` (`:74`), `@mixin accent-btn` (`:77`).
- `static/login/login.scss` is the closest precedent and the only other non-shell surface: card `@include glass(var(--glass-72))`, 392 px wide, 28 px padding, 22 px radius, `box-shadow: var(--shadow-hi)` (`:125-129`); head row with the 36 px logo tile (`:131-135`); `--login-pool` vignette (`:72-75`, token at `:23-24`); `.o_sf_login_haze` dimming layer (`:80-84`); footer rule (`:217-221`); mobile step-down at `:223-225`.
- Three-state theming on the frontend is already solved in CSS: light tokens on the bare class (`login.scss:11` and `:25`), dark under `@media (prefers-color-scheme: dark)` guarded by `:not([data-theme="light"])` (`:26-28`), explicit `[data-theme="dark"]` (`:29`). `static/login/login.js` stamps `data-theme` from `localStorage["strataflow.theme"]` and **returns early if `document.querySelector(".o_sf_login")` is null** (`login.js:13-16`).
- The frontend bundle is `__manifest__.py:45-49`: `tokens.scss`, then `login/login.scss`, then `login/login.js`. Anything added to it must come **after** `tokens.scss` (Odoo forbids `@import` between asset files — the manifest comment at `:36-37` says so).

## Decision needed

**1. What is the favicon, exactly?** There is no logo file in the repo, so it must be produced. Options:
   - *(a)* The three-stroke wave on the `#fbfcfa` rounded tile, exactly as the shell and login render it — a scaled-up `shell.xml:27-31`.
   - *(b)* The wave with no tile, transparent background.
   - *(c)* A new mark drawn for small sizes.

   **Recommendation: (a).** It is already the brand in two places, the tile is what keeps a light-stroked mark legible against a dark browser tab strip (which (b) is not), and it needs no new design work. At 16 px the 2/24 stroke renders soft (verified by rasterising and inspecting), so the 16 and 32 px entries should be authored from a *separate* SVG with `stroke-width` around 3 and the three waves pulled to y = 6.5 / 12 / 17.5 — same mark, tuned for the size. That is a rendering detail, not a design change.

**2. Dark-mode favicon variant?** An `.ico` cannot react to the browser theme; an SVG favicon can (`@media (prefers-color-scheme: dark)` inside the file, honoured by Chrome and Firefox, ignored by Safari). Options: ship only the light-tile `.ico`, or ship `.ico` + a theme-reactive `.svg` and add a second `<link>`.
   **Recommendation: ship only the light-tile `.ico` (plus a plain `.svg` for crispness, not a theme-reactive one).** The tile is near-white and reads correctly on both light and dark tab strips; a theme-reactive favicon would be the only theme-aware surface in a product whose stock views are pinned light on Stefan's own call (`static/src/stock/stock.scss:15-17`, and `ir.http.color_scheme()` is hard-coded `"light"` in `addons/web/models/ir_http.py:77-78`).

**3. Does the 404 page carry the animated login map, or a calm ground?** The login page paints a full-bleed drifting street grid with travelling utility pulses (`views/strataflow_login.xml:16-63`, `login.scss:33-124`).
   **Recommendation: calm ground** — the same `--bg`, the two static glow blobs, no drift, no pulses, and the same glass card. An error page is not a place to draw the eye, reusing the login SVG means either duplicating 60 lines of markup or refactoring a design-reviewed template that currently works, and the shared tokens alone already make the two pages read as the same product.

**4. For a mistyped in-app URL (`/odoo/dispach`), notification or full page?** Options: *(a)* land on Home and raise a notification ("That page doesn't exist — showing Home"), *(b)* build a seventh in-shell screen that renders a 404 inside the glass shell.
   **Recommendation: (a).** It is ~15 lines against ~150, and it fixes the actual defect, which is that the user currently ends up in Discuss with no explanation. (b) can follow later if Stefan wants the in-app case to look like the public one.

## Plan

### Commit A — branding

1. **Author the mark as SVG.** New `static/img/favicon.svg`: `viewBox="0 0 24 24"`, a `<rect rx="5.4">` filled `#fbfcfa`, then the three paths copied verbatim from `static/src/core/shell.xml:28-30`. New `static/img/favicon-small.svg`: same tile, `stroke-width="3"`, waves at y = 6.5 / 12 / 17.5, for the 16/32 px raster entries only.

2. **Rasterise.** **ImageMagick alone will not do this** — `magick mark.svg out.png` on this machine has no rsvg delegate and silently drops every stroked path, producing a blank tile (verified). Use macOS QuickLook, which renders through WebKit, then ImageMagick only for resizing and packing:
   ```
   qlmanage -t -s 512 -o /tmp/sfico static/img/favicon.svg          # → /tmp/sfico/favicon.svg.png, 512×512
   qlmanage -t -s 512 -o /tmp/sfico static/img/favicon-small.svg
   magick /tmp/sfico/favicon-small.svg.png -define icon:auto-resize=16,32 /tmp/sfico/small.ico
   magick /tmp/sfico/favicon.svg.png      -define icon:auto-resize=48   /tmp/sfico/large.ico
   magick /tmp/sfico/small.ico /tmp/sfico/large.ico static/img/favicon.ico   # 16, 32, 48 in one file
   magick /tmp/sfico/favicon.svg.png -resize 192x192 static/img/icon-192.png
   magick /tmp/sfico/favicon.svg.png -resize 512x512 static/img/icon-512.png
   magick /tmp/sfico/favicon.svg.png -resize 180x180 static/img/icon-apple-touch.png
   magick /tmp/sfico/favicon.svg.png -resize 140x140 static/description/icon.png
   ```
   Verify each with `magick identify` and **open the 16 px entry enlarged with `-filter point` and look at it** before committing.

3. **New `views/strataflow_branding.xml` — the `web.layout` seam.** One template inheriting `web.layout` (`addons/web/views/webclient_templates.xml:17`), two `position="attributes"` xpaths and nothing else:
   - on `//title` (`:22`) → `<attribute name="t-esc">title or 'Strataflow'</attribute>`
   - on `//link[@rel='shortcut icon']` (`:23`) → `<attribute name="t-att-href">x_icon or '/strataflow_workorder/static/img/favicon.ico'</attribute>`

   This is the single change that fixes the login tab, the backend first paint, and the favicon everywhere in one place, and it leaves `x_icon` working for anyone who sets it. **Use `position="attributes"`, never `position="after"` on that link**: `web.frontend_layout` (`:38`, `primary="True"`, so it is built from the *combined* `web.layout` arch) anchors its own xpaths on `//head/meta[last()]` (`:39`) and `//head/link[last()]` (`:42`); inserting a new `<link>` into `web.layout` moves that anchor.

4. **Same file — `web.webclient_bootstrap` head (backend only).** Inherit `web.webclient_bootstrap` (`webclient_templates.xml:275`) and rewrite two attributes inside `head_web`: `//meta[@name='theme-color']` (`:279`) `content` → `#f4f5f3` (the light `--bg`, `tokens.scss:34`), and `//link[@rel='apple-touch-icon']` (`:281`) `href` → `/strataflow_workorder/static/img/icon-apple-touch.png`.

5. **New `data/strataflow_branding_data.xml`** — one `ir.config_parameter` record, key `web.web_app_name`, value `Strataflow`. This is the stock seam read at `addons/web/controllers/webmanifest.py:44`. Not `noupdate`; it is brand, and `-u` should keep it correct.

6. **`controllers/` — the PWA icons.** Add `controllers/webmanifest.py` (and the import in `controllers/__init__.py`) subclassing `odoo.addons.web.controllers.webmanifest.WebManifest`: override `_icon_path()` (stock at `webmanifest.py:91-92`) to return `strataflow_workorder/static/img/icon-192.png`, and override `_get_webmanifest()` to call `super()` and then replace `background_color` / `theme_color` (`#f4f5f3`) and the two `icons` entries with `/strataflow_workorder/static/img/icon-192.png` and `-512.png`. Nothing else in that dict changes.

7. **`views/strataflow_actions.xml:28`** — add `web_icon="strataflow_workorder,static/description/icon.png"` to `menu_strataflow_root`, so the app switcher stops rendering `/web/static/img/default_icon_app.png` (`addons/web/models/ir_ui_menu.py:71`). The file is not `noupdate`, so `-u` applies it.

8. **`static/src/core/shell.js` — per-screen tab titles.** Add `LABELS = { home: "Home", dispatch: "Dispatch", workorders: "Work Orders", crm: "CRM", invoices: "Invoices", locator: "Locator view" }` beside the existing `NAV` (`shell.js:8-14`; note `locator` is deliberately absent from `NAV`, so it needs its own entry). In `setup()` (`shell.js:60`) add `this.title = useService("title")` and, inside the existing `onMounted` (`shell.js:68`, currently a one-expression arrow — give it a body), `this.title.setParts({ action: LABELS[this.props.active] ?? "", brand: "Strataflow" })`. Result: `Dispatch - Strataflow`.
   Why it is written this way: `title_service.js:38` joins parts in **object insertion order**, and `action_service.js:1036` writes the `action` key on controller mount. Writing `action` ourselves first guarantees `brand` lands second whichever of the two runs first — a later `setParts({action: …})` updates the value in place and does not move the key. The separator is a hard-coded `" - "` (`title_service.js:38`); do not try to change it. Note that on a stock page opened cold (no shell mounts) the title is still just the action name, and that `brand` persists once set, so leaving a Strataflow screen for a stock view via "Open Odoo" reads e.g. `Leads - Strataflow`. Both are acceptable.

9. **`__manifest__.py`** — add `'views/strataflow_branding.xml'` and `'data/strataflow_branding_data.xml'` to `data`. Images under `static/` need no declaration.

### Commit B — errors

10. **Add `'http_routing'` to `depends` in `__manifest__.py:9`.** Commit B inherits templates owned by that module. It is already installed transitively (`account` → `portal` → `http_routing`), so this changes nothing at runtime, but an XML inherit of a module absent from `depends` has no guaranteed load order and is a latent install failure.

11. **New `views/strataflow_errors.xml` — one page, three entry points.**
    - `<template id="error_page">`: `t-call="web.frontend_layout"`, and inside it **`<t t-set="no_header" t-value="True"/>` and `<t t-set="no_footer" t-value="True"/>`** — this is what removes the company-logo header (`webclient_templates.xml:60-63`) and the "Powered by Odoo" footer (`:68-82`), exactly as `web.login_layout:114-115` does. Also `<t t-set="title">…</t>` and `<t t-set="body_classname" t-value="'o_sf_err_body'"/>`. Body: a root `<div class="o_sf_err">` holding the calm ground (`.o_sf_err_glow` + `.o_sf_err_vignette`), then a `<main class="o_sf_err_card">` with the same head row as the login card (36 px logo tile with the three-stroke SVG, "Strataflow" / "by Strataline"), a big `<t t-esc="status_code"/>` in `--mono`, a headline, one sentence, and the actions. Show `error_message` only under `t-if="debug"`.
    - Actions: primary `<a href="/">Back to Strataflow</a>` and a secondary "Go back" (`history.back()`). **Link `/`, never `/odoo/desk`** — `controllers/home.py:48-57` already resolves `/` correctly for a Strataflow user (→ `HOME_URL`, `home.py:20`), for an anonymous visitor (→ `HOME_URL` → `/web/login?redirect=…`), and for a non-Strataflow internal user (→ `super()`, stock behaviour). A hard-coded `/odoo/desk` breaks the third case.
    - Three inherits, each replacing the stock template's whole `<t t-call="web.frontend_layout">` node with `<t t-call="strataflow_workorder.error_page"/>` — `error_page` calls `web.frontend_layout` itself, so replacing only the body inside that node would nest one layout inside the other: `http_routing.404` (`http_routing_template.xml:119`), `http_routing.403` (`:100`), `http_routing.4xx` (`:62`). **Do not touch `http_routing.500` (`:193`)** — its comment at `:194-198` forbids assets and extra variables because the cursor may be broken while it renders.
    - Copy per code: 404 "We couldn't find that page." / 403 "You don't have access to that." / generic "Something went wrong." Drive it off `status_code`, which `_get_exception_code_values` always supplies (`http_routing/models/ir_http.py:548-551`), and **delete the `/contactus` link** — that route does not exist in this database.

12. **New `static/error/error.scss`**, added to `web.assets_frontend` in `__manifest__.py` **after** `static/scss/tokens.scss` and after `login/login.scss`. Kept outside `static/src/` so the backend globs (`__manifest__.py:39-41`) never sweep it into `web.assets_backend`, for the same reason the manifest comment at `:43-44` gives for the login files. Structure it exactly like `login.scss:11-29`: `.o_sf_err { @include tokens-light; … }`, then `@media (prefers-color-scheme: dark) { .o_sf_err:not([data-theme="light"]) { @include tokens-dark; } }`, then `.o_sf_err[data-theme="dark"] { @include tokens-dark; }`. Card: `@include glass(var(--glass-72))`, 420 px, 28 px padding, 22 px radius, `var(--shadow-hi)`. Reuse `@include eyebrow` for the "by Strataline" line and `@include accent-btn` for the primary action.

13. **`static/login/login.js:13`** — widen the guard to `document.querySelector(".o_sf_login, .o_sf_err")` so a stored theme choice is honoured on the error page too. One line; the rest of the file already does the right thing.

14. **`controllers/export.py:58-61` — make the export route fail into that page.** Before touching the record:
    ```python
    wo = request.env['strataflow.workorder'].browse(wo_id).exists()
    if not wo or not wo.has_access('read'):
        return request.render('strataflow_workorder.error_page',
                              {'status_code': 404 if not wo else 403, 'status_message': ...},
                              status=404 if not wo else 403)
    ```
    `has_access` is the boolean twin of `check_access` (`odoo/orm/models.py:4123-4128`); `request.render` forwards `**kw` to the werkzeug Response, so `status=` works (`odoo/http.py:2116-2129`). Keep `wo.check_access('read')` afterwards or drop it — `has_access` has already made the same check. This is the only way to get a designed page here: the route is not `website=True`, so `is_frontend` is `False` and `http_routing._handle_error` deliberately declines to render anything (`http_routing/models/ir_http.py:573-576`). **Do not add `website=True` to the route to get around that** — it also enables the multilang URL-rewrite redirect in `_pre_dispatch` (`:493-513`), which would start rewriting this URL.

15. **New `static/src/core/webclient_patch.js` — the mistyped in-app URL.**
    ```js
    import { patch } from "@web/core/utils/patch";
    import { WebClient } from "@web/webclient/webclient";
    import { router } from "@web/core/browser/router";
    ```
    Patch `_loadDefaultApp`: if `router.current.action` is truthy — i.e. the URL named an action that failed to resolve, as opposed to a bare `/odoo` with no state (`webclient.js:137-139`) — show a `notification` ("That page doesn't exist — showing Home.", `type: "warning"`) and `doAction("strataflow_workorder.action_strataflow_home")`; otherwise `super._loadDefaultApp(...arguments)`. The file is swept into `web.assets_backend` by the existing `static/src/**/*.js` glob (`__manifest__.py:41`); no manifest change. This is what stops a typo landing the user in Discuss (`addons/mail/views/mail_menus.xml:3-9` vs `views/strataflow_actions.xml:28`, tied at `sequence="5"`, broken by id per `ir.ui.menu._order`, `odoo/addons/base/models/ir_ui_menu.py:19`).

## Files

| path | what changes |
| --- | --- |
| `addons/strataflow_workorder/static/img/favicon.svg` | **new** — the three-stroke mark on the `#fbfcfa` tile, master source |
| `addons/strataflow_workorder/static/img/favicon-small.svg` | **new** — same mark, heavier strokes, source for the 16/32 px raster |
| `addons/strataflow_workorder/static/img/favicon.ico` | **new** — 16 + 32 + 48 px, the `x_icon` target |
| `addons/strataflow_workorder/static/img/icon-192.png` | **new** — PWA manifest icon |
| `addons/strataflow_workorder/static/img/icon-512.png` | **new** — PWA manifest icon |
| `addons/strataflow_workorder/static/img/icon-apple-touch.png` | **new** — 180 px, `apple-touch-icon` |
| `addons/strataflow_workorder/static/description/icon.png` | **new** — 140 px; Apps list icon and the app-switcher tile |
| `addons/strataflow_workorder/views/strataflow_branding.xml` | **new** — inherits `web.layout` (title fallback + favicon) and `web.webclient_bootstrap` (theme-color, apple-touch-icon) |
| `addons/strataflow_workorder/data/strataflow_branding_data.xml` | **new** — `ir.config_parameter` `web.web_app_name` = `Strataflow` |
| `addons/strataflow_workorder/controllers/webmanifest.py` | **new** — overrides `_get_webmanifest` and `_icon_path` for the PWA icons and colours |
| `addons/strataflow_workorder/controllers/__init__.py` | add `from . import webmanifest` |
| `addons/strataflow_workorder/views/strataflow_actions.xml` | `web_icon` on `menu_strataflow_root` (line 28) |
| `addons/strataflow_workorder/static/src/core/shell.js` | `LABELS` map; `title` service; `setParts({action, brand})` on mount |
| `addons/strataflow_workorder/views/strataflow_errors.xml` | **new** — `error_page` template plus inherits of `http_routing.404`, `.403`, `.4xx` |
| `addons/strataflow_workorder/static/error/error.scss` | **new** — the error page in the glass language, three-state theming |
| `addons/strataflow_workorder/static/login/login.js` | widen the root selector to `.o_sf_login, .o_sf_err` (line 13) |
| `addons/strataflow_workorder/controllers/export.py` | `exists()` + `has_access` guard, render `error_page` with a real status (lines 58-61) |
| `addons/strataflow_workorder/static/src/core/webclient_patch.js` | **new** — `_loadDefaultApp` patch for a mistyped `/odoo/...` URL |
| `addons/strataflow_workorder/__manifest__.py` | `http_routing` in `depends`; two new `data` entries; `error.scss` in `web.assets_frontend` |

## Landmines

- **Sass eats `min()` / `max()` with mixed units.** `min(52%, 460px)` once threw *"Incompatible units: px and %"*, killed the whole stylesheet bundle, and Odoo then served the **previous** CSS with only a small red banner — so the change looks like it did nothing. The error-page card wants exactly that shape (`width: 420px; max-width: calc(100vw - 32px)` is how `login.scss:127` avoids it). Grep the new SCSS for `min(` / `max(` with mixed units before running the server.
- **Odoo compiled CSS is not whitespace-minified.** Verify the new stylesheet actually landed with a regex (`grep -E '\.o_sf_err'`), never an exact substring match against the bundle.
- **Never insert a node into `web.layout`.** `web.frontend_layout` (`webclient_templates.xml:38`) is `primary="True"` and therefore built from the combined arch, and its own xpaths anchor on `//head/meta[last()]` and `//head/link[last()]`. Adding a `<link>` in `web.layout` silently moves where the fontawesome preload and the frontend asset bundle get inserted. Use `position="attributes"` on the existing nodes; put any *additional* icon links in `web.webclient_bootstrap` instead.
- **The shell home is `/odoo/desk`, not `/odoo/home`,** and the error page must not link to either. Link `/`. `controllers/home.py:20` explains the path choice (stock registers a client action with the *tag* `home`, and tag resolution beats action-path resolution, so `/odoo/home` was a reload loop); `home.py:48-57` is what makes `/` correct for signed-in, signed-out, and non-Strataflow users alike.
- **Do not touch `http_routing.500`** (`http_routing_template.xml:193`). Its comment at `:194-198` says the cursor can be broken while it renders, which is why it inlines Bootstrap from `/web/static/lib` and uses no assets and no extra variables.
- **`is_frontend` decides whether a pretty error page renders at all.** It is `True` only for `website=True` routes or when nothing matched (`http_routing/models/ir_http.py:375`, `:478`). Any route this module owns is `False`, so a controller must render the page itself — and adding `website=True` to buy the pretty page also buys the multilang URL rewrite at `:493-513`.
- **`post_init_hook` runs on install, never on `-u`.** The `ir.config_parameter` for `web.web_app_name` therefore has to be a data record, not hook code, or an existing database never gets it. Keep it out of `data/strataflow_crm_account_data.xml`, which is `noupdate="1"`.
- **Quote grep globs in zsh.** `--include=*.xml` unquoted expands and the flag silently vanishes; every grep in this brief was run with it quoted.
- **"Verified server-side" is not verified.** Six visual bugs have shipped past HTTP checks in this repo. A favicon in particular cannot be confirmed by curl — the browser caches it aggressively per-origin and will keep showing Odoo's until a hard reload. Look at the tab strip.
- **New, found while writing this:** ImageMagick on this machine has no SVG delegate. `magick favicon.svg out.png` produces a correctly-sized, **completely blank** tile — the fill renders, every stroked path is dropped, and the command exits 0. Rasterise with `qlmanage -t` (WebKit) and use `magick` only for resize and `.ico` packing.
- **New:** `magick a.png b.png c.png -resize 48x48 out.ico` applies the resize to *all* inputs and writes three 48×48 frames. Use `-define icon:auto-resize=16,32,48` instead, and confirm with `magick identify favicon.ico`.

## Acceptance criteria

- [ ] `/web/login` serves `<title>Strataflow</title>` and a `shortcut icon` link pointing at `/strataflow_workorder/static/img/favicon.ico`; the string `Odoo` appears nowhere in that page's `<head>`.
- [ ] `addons/strataflow_workorder/static/img/favicon.ico` contains 16, 32 and 48 px frames, and the 16 px frame is a recognisable three-stroke mark when viewed enlarged — not a blank tile.
- [ ] Every backend page's server-rendered first paint says `Strataflow`, and after boot each of the six screens' tab reads `<Screen> - Strataflow` (`Home`, `Dispatch`, `Work Orders`, `CRM`, `Invoices`, `Locator view`).
- [ ] `/web/manifest.webmanifest` returns `"name": "Strataflow"` and two icon entries under `/strataflow_workorder/static/img/`.
- [ ] The Strataflow tile in the app switcher is the brand mark, not `default_icon_app.png`, and the Apps list shows the mark, not `/base/static/description/icon.png`.
- [ ] An unknown path (`/nope`) returns HTTP 404 and renders the Strataflow error card. The response body contains neither `Powered by` nor `/contactus` nor `odoo_logo_tiny.png`.
- [ ] The error page honours light, dark and system theme the same way the login page does, and follows a stored `strataflow.theme` choice.
- [ ] `/strataflow/workorder/999999/locate.pdf` returns HTTP 404 and renders the same card — not werkzeug's white page, and not the sentence "Record does not exist or has been deleted."
- [ ] A signed-in user without `group_strataflow_user` hitting that URL gets HTTP 403 and the same card.
- [ ] `/odoo/dispach` lands on the Home screen with a warning notification, never in Discuss.
- [ ] `http_routing.500` is unmodified, and a deliberate server error still renders the stock 500 page.
- [ ] No SCSS compile error: the frontend CSS bundle contains rules matching `\.o_sf_err`, and the login page is visually unchanged.

## Verification

Run the server after every Python/XML/JS/SCSS change — a plain reload can serve a stale JS bundle:

```
cd /Users/stefan/strataflow
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  --dev=xml --http-port=8069 --log-level=warn -u strataflow_workorder
```

Commit A, over HTTP:

```
curl -sI  http://localhost:8069/strataflow_workorder/static/img/favicon.ico | head -3
curl -s   http://localhost:8069/web/login | grep -oE '<title>[^<]*</title>'
curl -s   http://localhost:8069/web/login | grep -oE 'rel="shortcut icon"[^>]*'
curl -s   http://localhost:8069/web/login | sed -n '/<head>/,/<\/head>/p' | grep -c 'Odoo'   # expect 0
curl -s   http://localhost:8069/web/manifest.webmanifest | python3 -m json.tool | head -20
magick identify addons/strataflow_workorder/static/img/favicon.ico  # 16x16, 32x32, 48x48
```

Commit B, over HTTP:

```
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8069/definitely-not-a-page   # 404
curl -s http://localhost:8069/definitely-not-a-page > /tmp/404.html
grep -c 'Powered by\|contactus\|odoo_logo_tiny' /tmp/404.html                           # 0
grep -oE 'o_sf_err[a-z_]*' /tmp/404.html | sort -u
# the stylesheet actually compiled (regex, not substring — Odoo CSS is not minified):
BUNDLE=$(curl -s http://localhost:8069/web/login | grep -oE '/web/assets/[^"]+assets_frontend[^"]*\.css' | head -1)
curl -s "http://localhost:8069$BUNDLE" | grep -cE '\.o_sf_err'                          # > 0
# the export route, with a real session (JSON-RPC, never typing the password in the browser):
curl -s -c /tmp/sf.cookies -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"call","params":{"db":"strataflow_dev","login":"admin","password":"admin"}}' \
  http://localhost:8069/web/session/authenticate > /dev/null
curl -s -b /tmp/sf.cookies -o /tmp/pdf404.html -w '%{http_code}\n' \
  http://localhost:8069/strataflow/workorder/999999/locate.pdf                          # 404
grep -c 'o_sf_err' /tmp/pdf404.html                                                     # > 0
```

Then in the browser automation tab — this is the part that counts, none of the above proves a pixel:

1. Open `http://localhost:8069/web/login` in a **fresh tab after a hard reload** (favicons cache per origin and will otherwise still show Odoo's). Confirm the tab icon is the three-stroke mark and the tab text reads `Strataflow`. Sign in as `admin`/`admin` by handing the tab the curl session cookie above.
2. Visit `/odoo/desk`, `/odoo/dispatch`, `/odoo/workorders`, `/odoo/pipeline`, `/odoo/invoices`, `/odoo/locator` in turn and read the **tab title** each time: `Home - Strataflow` … `Locator view - Strataflow`. Watch the title during load — the pre-boot flash must say `Strataflow`, not `Odoo`.
3. Open the app switcher (avatar → "Open Odoo") and look at the Strataflow tile: the brand mark, not the grey placeholder.
4. Visit `/nope`. Read the whole page: no Odoo logo at the top, no "Powered by Odoo" at the bottom, no broken illustration, one primary button. Click it and confirm it lands on `/odoo/desk`.
5. Sign out, visit `/nope` again, click the same button, and confirm it goes to the Strataflow login rather than the stock backend.
6. With the page open, toggle the OS appearance (System Settings → Appearance) and confirm the error card follows; then set `localStorage["strataflow.theme"] = "dark"` in the shell, reload `/nope`, and confirm it stays dark on a light desktop.
7. On the Work Orders screen, select a ticket and print the locate PDF once to confirm the happy path still works, then visit `/strataflow/workorder/999999/locate.pdf` directly and confirm the designed card, not werkzeug's white page.
8. Type `/odoo/dispach` into the address bar. Confirm the Home screen with a warning notification — and specifically that you do **not** land in Discuss.
9. Resize to 375 px wide on the 404 and confirm the card steps down and nothing scrolls sideways.
