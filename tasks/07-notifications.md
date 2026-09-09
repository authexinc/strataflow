# 07 — Fix notification and toast styling

Toasts are the only Strataflow surface that still renders in stock Odoo light while a dark screen is on
the page, and the one line of CSS meant to restyle them is almost entirely dead — three of its four
declarations lose to stock selectors or to Bootstrap `!important` utilities. A future session must make
the toast a real Strataline glass card that follows the shell's theme in both directions, without
disturbing toasts fired from stock Odoo pages. It is one SCSS block; the work is in getting the scope
and the specificity right, not in the volume of code.

## The ask

> "11. Fix the notification styling"

## What is true today

**There is no custom notification component.** Every toast in the product goes through the stock service:
`registry.category("services").add("notification", notificationService)` at
`addons/web/static/src/core/notifications/notification_service.js:71`. The module has 16 `.add(...)` call
sites across six files (the recon's "21 call sites" counts the six
`this.notification = useService("notification")` assignments at `static/src/core/shell.js:62`,
`static/src/screens/home.js:37`, `dispatch.js:29`, `locator.js:39`, `invoices.js:23`, `workorders.js:47`
as call sites; the real total of lines is 22, of which 6 are the service lookups).

**Where the toast actually mounts — this is the crux, and the recon has it wrong.**
The recon says toasts render "in the Odoo overlay container". They do not. `notificationService.start()`
registers `NotificationContainer` into the **`main_components`** registry, not the overlay service:
`registry.category("main_components").add(this.notificationContainer.name, {...}, { sequence: 100 })` at
`addons/web/static/src/core/notifications/notification_service.js:30-37`. `MainComponentsContainer`
renders every entry of that registry inside `<div class="o-main-components-container">`
(`addons/web/static/src/core/main_components_container.js:18-24`), and `WebClient` renders
`<MainComponentsContainer/>` as a **sibling of `<ActionContainer/>`**
(`addons/web/static/src/webclient/webclient.xml:8-9`). `WebClient` is mounted on `document.body`
(`addons/web/static/src/start.js:40`), and `<body>` carries `o_web_client`
(`addons/web/views/webclient_templates.xml:309`).

The consequence is the same as the recon's conclusion, but for a different reason and with a different
fix: the toast is a sibling of the action container, so it is **structurally incapable** of ever being
inside `.o_sf` — the shell root is rendered by the client action, one branch over. Adding an
`.o_sf .o_notification` rule to `strataflow.scss` could never match. What the toast inherits instead is
the token block on the body: `static/src/stock/stock.scss:17` is `.o_web_client { @include tokens-light; }`.
So a toast fired from a dark Strataflow screen resolves `--glass-80`, `--text`, `--edge` etc. to their
**light** values. That is the visible defect.

Note the overlay container is a *different* main-component (`overlayService` registers `OverlayContainer`
at `addons/web/static/src/core/overlay/overlay_service.js:22-25`); that is where the popover and dropdown
live, which is why `strataflow.scss:8-9` gives `.o_sf_pop` / `.o_sf_menu` their own token declarations.
The toast cannot use that pattern for free because we do not own its markup.

**The existing restyle is one line and it is nearly all dead.**
`static/src/stock/stock.scss:54` is:

```scss
.o_notification { @include glass(var(--glass-80)); border-radius: 16px; box-shadow: var(--shadow-hi); }
```

Declaration by declaration, against the toast root
`<div class="o_notification {{props.className}} d-flex mb-2 position-relative rounded shadow-lg">`
(`addons/web/static/src/core/notifications/notification.xml:5`):

- `background` (from the `glass` mixin, `static/scss/tokens.scss:66`) — **loses.** Stock has
  `.o_notification_manager .o_notification { background-color: var(--Notification__background-color, #{$o-view-background-color}); }`
  at `addons/web/static/src/core/notifications/notification.scss:16`, specificity 0-2-0 against our 0-1-0.
  `--Notification__background-color` is set nowhere in the backend bundle — its only other occurrence in
  the tree is `addons/website/static/src/scss/website.scss:2431`, which is frontend-only and in a module
  this addon does not depend on — so the fallback wins: `$o-view-background-color`, which
  `static/scss/backend_variables.scss:54` sets to `#fbfcfa`. The toast is an opaque near-white card in
  both themes.
- `border-radius: 16px` — **loses.** The root carries Bootstrap's `.rounded` utility, which compiles to
  `border-radius: var(--bs-border-radius) !important` (`addons/web/static/lib/bootstrap/scss/_utilities.scss:711-715`,
  `$enable-important-utilities: true` at `addons/web/static/lib/bootstrap/scss/_variables.scss:385`).
- `box-shadow: var(--shadow-hi)` — **loses**, same reason, to `.shadow-lg` →
  `box-shadow: var(--bs-box-shadow-lg) !important` (`_utilities.scss:76-85`).
- `backdrop-filter` and `border: 0.5px solid var(--edge)` from the mixin — these *do* apply, which is why
  the toast has a hairline today. The blur is invisible because the background behind it is opaque.

**What the stock markup gives us to work with** (`addons/web/static/src/core/notifications/notification.xml`):

| element | classes | line |
| --- | --- | --- |
| root | `o_notification {{props.className}} d-flex mb-2 position-relative rounded shadow-lg` | 5 |
| type bar | `<span class="o_notification_bar bg-{{props.type}} rounded-start">` | 6 |
| body box | `<div class="w-100 py-2 ps-3 pe-5 border border-start-0 rounded-end text-break">` | 7 |
| close | `<button class="o_notification_close btn-close position-absolute top-0 end-0 mt-2 me-2">` | 8 |
| content | `<span class="me-auto o_notification_content w-100">` | 10 |
| buttons | `<div class="o_notification_buttons justify-content-end w-50">` with `btn btn-link` children | 15-16 |
| progress | `<div class="o_notification_progress opacity-75 bg-{{props.type}}">` | 25 |

`bg-success` / `bg-warning` / `bg-danger` / `bg-info` compile to
`background-color: rgba(var(--bs-success-rgb), var(--bs-bg-opacity)) !important`
(`_utilities.scss:662-675`, `addons/web/static/lib/bootstrap/scss/_maps.scss:134`). The `-rgb` custom
properties come from `$success`/`$info`/`$warning`/`$danger`, which
`addons/web/static/src/scss/bootstrap_overridden.scss:35-38` maps to `$o-success`/`$o-info`/`$o-warning`/
`$o-danger`, which `static/scss/backend_variables.scss:40-43` sets to the **light** token values
`#0a9648 / #0b6f99 / #8a6116 / #b1332c`. On a dark glass card `#8a6116` and `#b1332c` are mud.

The body box's `border` resolves `--bs-border-color`, i.e. `$border-color: $o-gray-300`
(`addons/web/static/src/scss/bootstrap_overridden.scss:97`) = `#d9dcd8`
(`static/scss/backend_variables.scss:27`) — a light grey hairline, wrong on dark.

`.btn-close` is a black SVG data-URI at `opacity: .5`
(`addons/web/static/lib/bootstrap/scss/_close.scss:6-26`, `$btn-close-color: $black` at
`_variables.scss:1708`). Bootstrap ships `--bs-btn-close-white-filter` on the element itself
(`_close.scss:15`, value `invert(1) grayscale(100%) brightness(200%)` at `_variables.scss:1715`) — that is
the seam for the dark variant.

**Position.** `.o_notification_manager` is `position: fixed; inset: ($o-navbar-height * 1.15) $o-notification-margin auto $o-notification-margin; z-index: 1055`
(`addons/web/static/src/core/notifications/notification.scss:6-8`; the variables are at
`addons/web/static/src/core/notifications/notification.variables.scss:1-4`), and above `sm` it is
`left: auto; width: 400px` (`notification.scss:10-13`). `$o-navbar-height` is 48px
(`static/scss/backend_variables.scss:66`), so the stack starts at **55.2px**. Strataflow screens are
fullscreen client actions with no navbar; `.o_sf_topbar` is `top: 16px … z-index: 1000`
(`static/src/strataflow.scss:86`) and `.o_sf_pill` is 48px tall (`strataflow.scss:89`), so the top bar
occupies 16–64px. The toast lands **on top of the right-hand top-bar pills** (avatar, theme toggle) — and
because 1055 > 1000, it wins and covers them. `.o_sf_body` starts at 80px (`strataflow.scss:113`), which
is where the toast stack should start.

**Stacking and motion.** Toasts stack in normal flow inside the fixed manager, spaced by `mb-2` on the
root (`notification.xml:5`); newest is appended last, so the stack grows downward. The enter/leave
transition is `@include owl-fade(0.5s, "o_notification")` (`notification.scss:24`) which emits
`.o_notification_fade { transition: all 0.5s; }` and `.o_notification_fade-enter { opacity: 0; }`
(`addons/web/static/src/core/utils/transitions.scss:11-19`). The autoclose progress bar is driven by a
`requestAnimationFrame` loop that writes `style.width` every frame
(`addons/web/static/src/core/notifications/notification.js:67-81`); hovering calls `freeze()` which zeroes
it (`notification.js:48-51`). **Nothing in the stock notification stack honours `prefers-reduced-motion`**
— not `notification.scss`, not `transitions.scss`, not `notification.js`. This module does ship a
`prefers-reduced-motion` block (`static/src/strataflow.scss:380-388`), but every selector in it is scoped
to `.o_sf`, so none of it can reach the toast; the only other reduced-* query we ship is
`prefers-reduced-transparency` inside the `glass` mixin (`static/scss/tokens.scss:71`).

**The 21/22 call sites, audited.** Every one of ours passes an explicit `type`; none passes `sticky`,
`buttons`, `className`, `autocloseDelay` or `onClose`. Exactly one passes a `title`.

| file:line | type | title |
| --- | --- | --- |
| `static/src/core/shell.js:130` | `info` | — |
| `static/src/screens/home.js:89` | `info` | — |
| `static/src/screens/dispatch.js:185` | `success` | — |
| `static/src/screens/dispatch.js:197` | `success` | — |
| `static/src/screens/dispatch.js:217` | `info` | — |
| `static/src/screens/dispatch.js:223` | `warning` | `"Reference only"` |
| `static/src/screens/locator.js:203` | `info` | — |
| `static/src/screens/locator.js:219` | `success` | — |
| `static/src/screens/locator.js:262` | `danger` | — |
| `static/src/screens/locator.js:265` | `success` | — |
| `static/src/screens/locator.js:295` | `success` | — |
| `static/src/screens/locator.js:298` | `danger` | — |
| `static/src/screens/invoices.js:98` | `success` or `info` (computed) | — |
| `static/src/screens/workorders.js:211` | `success` | — |
| `static/src/screens/workorders.js:239` | `success` | — |
| `static/src/screens/workorders.js:296` | `danger` | — |

The stock default is `type: "warning"` (`notification.js:40`), so no call site falls back to it by
accident. `title` is **not** rendered as a heading: the template inlines it as
`<t t-if="props.title"><t t-out="props.title"/>. </t>` before the message (`notification.xml:11-13`, with
stock's own `TODO-IPB` comment saying it should be removed). There is no element to style, so a bold or
stacked title is impossible without inheriting the template.

**The sticky and button variants are never fired by our code but are fired by stock while our screens are
on the page**, so they must be covered:

- `error_handlers.js:106-109` — `"Connection lost. Trying to reconnect..."`, `sticky: true`, no type
  (so `warning`). Fires on any dropped RPC from a Strataflow screen.
- `scss_error_dialog.js:37-43` — `"The style compilation failed…"`, `type: "danger"`, `sticky: true`,
  `title: "Style error"`. **This is the red banner from the SCSS landmine below.**
- `webclient/actions/action_service.js:1166-1169` — popup blocked, `sticky: true`, `type: "warning"`.
- `webclient/actions/action_service.js:1386-1389` — report download message, `sticky: true`,
  `title: "Report"`. No Strataflow screen dispatches an `ir.actions.report`; the locate PDF is a plain
  `window.open` on a controller URL (`static/src/screens/workorders.js:270`), which never goes through the
  action service, so this one only arrives from a stock view opened alongside.
- `core/file_upload/file_upload_service.js:131-134` — upload error, `type: "danger"`, `sticky: true`.

A sticky toast never starts the timer (`notification.js:62-64`), so its progress bar is never given an
inline width; being `position: absolute; left: 0` with no `right` and no content
(`notification.scss:26-31`) it shrink-fits to zero width and is invisible. No special handling needed.

Buttons in a toast are `btn btn-link` (`notification.xml:16`). `static/src/stock/stock.scss:41` already
sets `.o_web_client .btn-link { color: var(--accent); font-weight: 600; }` at specificity 0-2-0, which
beats Bootstrap's `.btn-link`; the colour it resolves depends entirely on which token block is in scope
for the toast — i.e. it is fixed for free by fixing the scope.

**The signal that survives outside the shell already exists.** `holdPageGround()` puts
`o_sf_page` on `<html>` and sets `document.documentElement.dataset.sfTheme = theme`
(`static/src/core/shell.js:29-33`), driven by a `useEffect` keyed on `theme.theme`
(`shell.js:75-80`), so it tracks the toggle live. All six screens render `StrataflowShell`
(`static/src/screens/{home,dispatch,workorders,crm,invoices,locator}.xml:5`), so `o_sf_page` is present
on every Strataflow screen and only there. `releasePageGround()` removes it 600 ms after the last screen
unmounts (`shell.js:36-42`, called from `onWillUnmount` at `shell.js:93`). `static/src/strataflow.scss:33-36` already uses this exact hook to paint the
ground under the web client. That is the scope the toast rules must hang off.

## Decision needed

**The one `title` we pass renders as run-in text, not a heading. Leave it or make it a real title?**

- (a) Leave the stock template alone. `dispatch.js:223` renders as "Reference only. Strataline is a
  reference aid, not a locate. The field locate governs." — one sentence, no visual hierarchy. Zero risk,
  no template inheritance, and stock's own comment says `title` is on its way out.
- (b) Inherit `web.NotificationWowl` with a `t-inherit` xpath to wrap the title in a `<strong>`, and style
  it. Buys a bold lead-in for our one call site plus stock's "Style error" and "Report" toasts, at the
  cost of owning a fork of a stock template that Odoo has flagged as changing.

**Recommendation: (a).** If the run-in title reads badly, fold the words into the message at
`dispatch.js:223` and drop the `title` option — a one-line change with no template fork.

## Plan

Everything is CSS. No JS, no XML, no call-site changes.

1. **`static/src/stock/stock.scss:54`** — replace the single `.o_notification` line with a documented
   block. Keep it in this file (not `strataflow.scss`): the element is a stock component and this file is
   already the "stock views in the Strataline language" file. The base block styles the toast for *every*
   page, light, exactly as the rest of `stock.scss` does. Use the three stock seams instead of fighting
   specificity:
   - set `--Notification__background-color: var(--glass-80)` — stock reads this custom property at
     `addons/web/static/src/core/notifications/notification.scss:16`, so setting the property is the only
     way to change the background without `!important`;
   - set `--bs-border-radius: 16px` and `--bs-box-shadow-lg: var(--shadow-hi)` locally on `.o_notification`
     — the `.rounded` and `.shadow-lg` utilities on the root are `!important`
     (`addons/web/static/lib/bootstrap/scss/_utilities.scss:76-85` and `:711-715`), but they resolve those
     custom properties from the element's own scope, so redefining the property wins;
   - write the glass out by hand rather than `@include glass()`: the mixin's `background` shorthand and its
     `prefers-reduced-transparency` fallback both target `background`, which loses to stock's 2-class
     `background-color` rule. The block needs `backdrop-filter: blur(40px) saturate(180%)` (plus the
     `-webkit-` twin), `border: 0.5px solid var(--edge)`, `overflow: hidden` and `color: var(--text)`.
   - neutralise the children so the clipped root owns the shape: `> .o_notification_bar { --bs-border-radius: 0; }`
     and `> div { --bs-border-radius: 0; --bs-border-color: transparent; }` — the body box's Bootstrap
     `border` (`notification.xml:7`) would otherwise double the root hairline and its `rounded-end` would
     re-round inside the clip.
2. **Same file, immediately after** — add the reduced-transparency fallback as its own media block:
   `--Notification__background-color: var(--bg)` and `backdrop-filter: none` (both `-webkit-` and plain),
   mirroring what the `glass` mixin does at `static/scss/tokens.scss:71` for our own glass surfaces.
3. **Same file** — add the reduced-motion block: `.o_notification_fade { transition: none; }` (the class
   emitted by `@include owl-fade` at `addons/web/static/src/core/utils/transitions.scss:11-19`) and
   `.o_notification_manager .o_notification_progress { display: none; }`. `display` is a different property
   from the inline `width` the rAF loop writes (`notification.js:76`), so the loop keeps running harmlessly
   and the toast still autocloses.
4. **Same file** — add the Strataflow-screen scope, hung off the shell's `<html>` hook:
   - `html.o_sf_page .o_notification_manager { top: 80px; }` — clears the 48px top-bar pills
     (`static/src/strataflow.scss:86,89`) instead of stock's `$o-navbar-height * 1.15` = 55.2px
     (`addons/web/static/src/core/notifications/notification.scss:7`), and lines the stack up with
     `.o_sf_body` (`strataflow.scss:113`). Specificity 0-2-1 beats stock's 0-1-0.
   - `html.o_sf_page[data-sf-theme="dark"] .o_notification_manager { @include tokens-dark; … }` — a
     directly-declared custom property beats one inherited from `.o_web_client` regardless of specificity,
     so every `var(--…)` inside the toast flips. Do **not** add a matching `tokens-light` block: light is
     already inherited from the body and a second copy is 40 dead declarations.
   - Inside that dark block: `.btn-close { filter: var(--bs-btn-close-white-filter); }` — the property is
     already declared on the element by Bootstrap (`addons/web/static/lib/bootstrap/scss/_close.scss:15`),
     so no Sass variable is needed.
   - Inside that dark block, restate the four semantic colours as **raw RGB triplets** so the `bg-*`
     utilities on the type bar and progress bar pick them up:
     `--bs-success-rgb: 34,179,102; --bs-info-rgb: 63,198,255; --bs-warning-rgb: 217,168,63; --bs-danger-rgb: 240,138,138;`
     These are `--ok`, `--cyan`, `--warn-icon`, `--danger` from `tokens-dark`
     (`static/scss/tokens.scss:56-57`) converted to decimal — `rgba(var(--x-rgb), …)` cannot consume a hex
     token, so the duplication is unavoidable. Comment them as "keep in step with `tokens-dark`", the same
     way `strataflow.scss:31-32` documents its literal ground colours.
5. **`static/src/strataflow.scss:3-4`** (comment only) — the header currently says pieces rendering in the
   overlay container carry their own tokens via `.o_sf_pop` / `.o_sf_menu`. Add one clause noting that the
   notification manager is a `main_components` sibling of the action container, cannot be reached from
   `.o_sf` at all, and is themed from `html.o_sf_page[data-sf-theme]` in `stock/stock.scss`. This is the
   note that stops the next session from writing an `.o_sf .o_notification` rule that can never match.

## Files

| path | what changes |
| --- | --- |
| `addons/strataflow_workorder/static/src/stock/stock.scss` | line 54 replaced by the toast block: glass via `--Notification__background-color`, radius/shadow via `--bs-border-radius` / `--bs-box-shadow-lg`, child shape reset, reduced-transparency and reduced-motion blocks, and the `html.o_sf_page` / `[data-sf-theme="dark"]` scope with `top: 80px`, `tokens-dark`, the close-button filter and the four `--bs-*-rgb` overrides |
| `addons/strataflow_workorder/static/src/strataflow.scss` | header comment (lines 3-4) only: record that the toast is a `main_components` sibling, unreachable from `.o_sf`, themed from the `html.o_sf_page` hook |

No new files. No JS, XML, Python or manifest changes.

## Landmines

- **Sass eats CSS `min()`/`max()` with mixed units.** `min(52%, 460px)` once threw
  `Incompatible units: px and %` and killed the whole `web.assets_backend` bundle; Odoo then served the
  **previous** CSS, so the change silently appeared to do nothing. Nothing in this task needs `min()`, so
  do not introduce one — and grep the diff for `min(` / `max(` before restarting.
  The twist specific to this task: the "small red banner" that reports a broken bundle **is a toast** —
  `scss_error_dialog.js:37-43`, `type: "danger"`, `sticky: true`, `title: "Style error"` — and it will be
  painted by the last *working* stylesheet. If your new toast styling appears not to have applied, look for
  that banner before you debug specificity.
- **PREPEND, never append, in the `_assets_*_variables` bundles** — Odoo's declarations are `!default`.
  This task adds nothing to those bundles, so the manifest is untouched; if you find yourself wanting a new
  `$o-notification-*` value, it belongs prepended to `web._assets_primary_variables` alongside
  `static/scss/backend_variables.scss`, not appended.
- **Odoo forbids `@import` between asset files.** `static/scss/tokens.scss` is listed first in
  `web.assets_backend` (`__manifest__.py`), which is the only reason `@include tokens-dark` compiles inside
  `stock/stock.scss`. Do not add an `@import`.
- **Odoo CE has no dark mode** — `ir.http.color_scheme()` is hard-coded to `"light"` and
  `static/src/stock/stock.scss:17` pins `tokens-light` on `.o_web_client`. The dark toast is therefore an
  exception carved out by `html.o_sf_page[data-sf-theme="dark"]` and nothing else; a stock Odoo page must
  keep the light toast. Verify that explicitly, it is half the task.
- **Odoo's compiled CSS is not whitespace-minified**, so if you verify the bundle with `curl`, match with
  regexes, not exact substrings.
- **"Verified server-side" is not verified.** Six visual bugs have shipped past HTTP checks in this repo.
  Fire a toast of every type, in both themes, in a real browser tab.
- **New, found while reading — Bootstrap utilities on stock markup are `!important`.**
  `$enable-important-utilities: true` (`addons/web/static/lib/bootstrap/scss/_variables.scss:385`), and the
  toast root carries `rounded` and `shadow-lg` (`notification.xml:5`) while the bar and progress carry
  `bg-{{type}}` and `opacity-75`. A plain `border-radius` / `box-shadow` / `background-color` declaration
  on those elements is dead code no matter how specific the selector. Steer them through the custom
  property each utility resolves (`--bs-border-radius`, `--bs-box-shadow-lg`, `--bs-*-rgb`) — never reach
  for `!important`.
- **New — a two-class stock selector already owns the toast background.**
  `.o_notification_manager .o_notification { background-color: var(--Notification__background-color, …) }`
  (`notification.scss:16`) beats any single-class rule. Set the custom property; do not try to out-specify
  it, and do not use the `glass()` mixin here, whose `background` shorthand and reduced-transparency
  fallback both lose to it.
- **New — the `o_sf_page` hook lingers 600 ms after the last Strataflow screen unmounts**
  (`static/src/core/shell.js:36-42`). A toast fired in that window while navigating away from a dark screen
  to a stock Odoo page renders dark for up to 600 ms. This is the same tradeoff already accepted for the
  page ground; do not "fix" it by removing the class on unmount, which would reopen the blank-flash gap
  that deferred removal exists to cover.

## Acceptance criteria

- [ ] A toast fired from any Strataflow screen with the shell in **dark** renders on the dark glass:
      computed `background-color` of `.o_notification` is `rgba(23, 29, 35, 0.78)` (`--glass-80` from
      `tokens-dark`), text is `--text` (`#e8ecee`), hairline is `--edge`.
- [ ] The same toast in **light** renders `rgba(255, 255, 255, 0.8)` with `#1a1d21` text.
- [ ] Toggling the theme while a toast is on screen repaints that toast, without remounting it.
- [ ] A toast fired from a **stock Odoo page** (no `o_sf_page` on `<html>`) is light glass and sits at
      55.2px from the top, unchanged from stock geometry.
- [ ] On a Strataflow screen the toast stack starts at `top: 80px` and never covers the top-bar pills.
- [ ] Radius is 16px and the shadow is `--shadow-hi` on the rendered element — not merely present in the
      source. The type bar and body box do not re-round inside the clipped root and there is no doubled
      hairline.
- [ ] All five types are legible in dark: `success`, `warning`, `danger`, `info`, and the no-type default
      (`warning`). The coloured bar and the progress bar use the dark token values, not `#8a6116` /
      `#b1332c`.
- [ ] The close button is visible in dark (white filter applied) and in light.
- [ ] A sticky toast with buttons (e.g. the connection-lost toast) shows no progress bar, does not
      autoclose, and its `btn-link` buttons are `--accent` for the theme in scope.
- [ ] Stacked toasts remain 8px apart (`mb-2`) and draw above the shell chrome (1055 > 1000).
- [ ] With `prefers-reduced-motion: reduce` the fade transition is `none` and the progress bar is not
      rendered; the toast still autocloses.
- [ ] With `prefers-reduced-transparency: reduce` the toast is opaque `--bg` with no `backdrop-filter`.
- [ ] No `!important` was added, and no `.o_sf .o_notification` selector exists anywhere (it can never
      match).
- [ ] No "Style error" toast on load — the bundle compiled.

## Verification

```bash
cd /Users/stefan/strataflow
# guard the SCSS landmine before restarting
grep -nE '(min|max)\(' addons/strataflow_workorder/static/src/stock/stock.scss   # expect no output
# no rule that can never match
grep -n 'o_sf .*o_notification' addons/strataflow_workorder/static/src/*.scss addons/strataflow_workorder/static/src/**/*.scss   # expect no output

.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  --dev=xml --http-port=8069 --log-level=warn -u strataflow_workorder
```

In the browser tab (log in `admin`/`admin`; the agent does not type the password — hand the tab a curl
session cookie, see DEVLOG 2026-09-08):

1. Open `http://localhost:8069/odoo/dispatch`. Confirm **no** red "Style error" toast appears — if it does,
   the bundle is broken and every check below is running on the previous CSS.
2. Click the red **"Reference only — not a locate"** pill in the footer (`static/src/screens/dispatch.xml:91`)
   → a `warning` toast with the run-in title. In light, read the glass and the amber bar.
3. Toggle the theme from the top-bar toggle **while that toast is still up**. It must repaint dark in place.
4. Fire the remaining variants from the devtools console
   (`odoo.__WOWL_DEBUG__` is set at `addons/web/static/src/env.js:247`):

```js
const n = odoo.__WOWL_DEBUG__.root.env.services.notification;
n.add("Success toast", { type: "success" });
n.add("Info toast", { type: "info" });
n.add("Danger toast", { type: "danger" });
n.add("No type given");                       // defaults to warning
n.add("Sticky with buttons", { type: "danger", sticky: true,
      buttons: [{ name: "Retry", primary: true, onClick: () => {} }] });
```

5. Read the computed values in the console, in each theme:

```js
const el = document.querySelector(".o_notification");
getComputedStyle(el).backgroundColor;   // dark: rgba(23, 29, 35, 0.78) | light: rgba(255, 255, 255, 0.8)
getComputedStyle(el).borderRadius;      // 16px
getComputedStyle(el).color;             // dark: rgb(232, 236, 238) | light: rgb(26, 29, 33)
getComputedStyle(el).backdropFilter;    // blur(40px) saturate(180%)
document.querySelector(".o_notification_manager").getBoundingClientRect().top;   // 80
getComputedStyle(document.querySelector(".o_notification_bar")).backgroundColor; // dark danger: rgb(240, 138, 138)
document.documentElement.dataset.sfTheme;  // tracks the toggle
```

6. Visually check the toast does not sit on the avatar / theme-toggle pills at the top right, that stacked
   toasts are evenly spaced, and that the close × is visible in dark.
7. Navigate to a stock page — `http://localhost:8069/odoo/contacts` — wait >1s so `o_sf_page` has been
   released, fire `n.add("Stock page toast", { type: "success" })` from the console, and confirm it is
   **light** glass at `top: 55.2px`, i.e. the stock geometry with the Strataline material.
8. In devtools, toggle **Rendering → Emulate CSS prefers-reduced-motion: reduce**, fire a toast, and confirm
   no fade and no progress bar; then **prefers-reduced-transparency: reduce** and confirm the card is opaque
   `--bg` with `backdrop-filter: none`.
