# 05 — Theme should keep following the system setting

Turn the shell's two-valued theme (light | dark) into a three-state preference — **system** (default), **light**, **dark** — where "system" keeps tracking the OS for as long as it is selected, including while the app is open. Today the very first press of the toggle writes an explicit value that wins forever and nothing ever listens for an OS change, so a user who once tried dark mode is stuck in it on a light desktop, and a user who never touched the toggle still does not follow the OS after the page has loaded. Everything downstream (the six screens, the MapLibre map style, the popovers) must keep reading a plain resolved `"light" | "dark"`, so this is a change to one module plus the top-bar control.

## The ask

> "17. Theme also needs to reflect system settings on initial load"

## What is true today

**The literal ask is already implemented. The theme does reflect the system setting on initial load.** `readTheme()` in `static/src/core/theme.js:6-16` checks `localStorage["strataflow.theme"]` first (`theme.js:8-11`) and, when nothing valid is stored, returns `window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"` (`theme.js:15`). A user who has never pressed the toggle, on a dark desktop, gets a dark shell on first load. If storage throws (Safari private mode) the `catch` at `theme.js:12-14` falls through to the same matchMedia line. So there is nothing to fix in the initial-load path.

The real gaps are two, and both are about what happens *after* that first load:

1. **The store is two-valued, and one press of the toggle ends system-following permanently.** `toggleTheme()` at `theme.js:28-38` flips `store.theme` between `"dark"` and `"light"` (`theme.js:30`) and writes that literal to `localStorage` at `theme.js:32`. From then on `readTheme()` returns at `theme.js:10` and never reaches the matchMedia line. There is no third value that means "keep asking the OS", and no way back to it from the UI: the only control is `toggleTheme()`, and it only ever writes `"light"` or `"dark"`.
2. **Nothing listens for an OS change.** `matchMedia` is called exactly once, at `theme.js:15`, during module evaluation, and its result is read as a boolean. No `MediaQueryList` is retained and no `change` listener is registered anywhere in the addon (`grep -rn --exclude-dir=lib "prefers-color-scheme"` matches only `theme.js:15`, `static/login/login.scss:26` and a comment at `static/login/login.js:6`; `grep -rn --exclude-dir=lib "matchMedia"` adds only `strataline_map.js:364`, which is `prefers-reduced-motion`). Flipping macOS System Settings › Appearance while a screen is open does nothing until a reload.

Supporting facts, all in this tree:

- The store is a module-load singleton: `const store = reactive({ theme: readTheme(), fading: false })` at `theme.js:19`. There is exactly one for the whole page, deliberately — the comment at `theme.js:18` says it is so navigating between screens never flashes the other theme. Every screen is a separate client action, so components mount and unmount around this store constantly.
- `useTheme()` (`theme.js:23-25`) is `useState(store)`. Its consumers all read the resolved value `.theme` and expect the string `"light"` or `"dark"`:
  - `static/src/core/shell.js:63` → stamped on the shell root as `t-att-data-theme` at `static/src/core/shell.xml:5`, which is what selects `tokens-dark` at `static/src/strataflow.scss:9`.
  - `static/src/core/strataline_map.js:240`, used at `:310` (`GROUND[this.theme.theme]`), `:354` (`buildStyle({ theme: this.theme.theme, … })`) and `:360`.
  - `static/src/screens/workorders.js:48`, used at `:198` (passed as the `theme` prop to the assign popover, stamped at `static/src/screens/workorders.xml:106`) and `:265` (`menuClass` → `o_sf_theme_dark`, the selector at `strataflow.scss:9`, because Odoo renders dropdown menus in the overlay container outside `.o_sf`).
- The toggle button is `static/src/core/shell.xml:60-62`: a single `.o_sf_round` button, `t-on-click="toggleTheme"`, `t-att-aria-pressed="theme.theme === 'dark'"`, `title="Toggle dark mode"`, `aria-label="Toggle dark mode"`, containing one hard-coded moon path (`shell.xml:61`). It calls `StrataflowShell.toggleTheme()` at `shell.js:142-144`, which is a bare passthrough to the imported `toggleTheme` (`shell.js:6`). `toggleTheme` has no other caller in the addon.
- The colour transition is opt-in and time-boxed: `toggleTheme` sets `store.fading = true` (`theme.js:29`) and clears it after `FADE_MS = 480` (`theme.js:4`, `theme.js:36-37`). `fading` becomes the `is-theming` class at `shell.xml:5`, whose rule at `strataflow.scss:51-53` turns on `.45s` colour transitions on the shell and every descendant. The 480 vs 450 is deliberate slack.
- The theme also drives `<html>`: `holdPageGround(theme)` at `shell.js:29-34` adds `o_sf_page` and sets `data-sf-theme`, driven by the `useEffect` at `shell.js:75-80` keyed on `[this.theme.theme]`, released 600 ms after unmount at `shell.js:36-42`. The ground colours are hard literals at `strataflow.scss:33-36` (`#f4f5f3` light, `#14181d` dark) because that rule sits on `<html>`, outside every `.o_sf`.
- A theme change forces a **full MapLibre style rebuild**: the `useEffect` at `strataline_map.js:253-261` sets `this.styleReady = false` (`:256`) and calls `map.setStyle(this.style(), { diff: false })` (`:257`), keyed on `[this.theme.theme, this.props.basemap]` (`:260`).
- **The login page.** `static/login/login.js` is a plain IIFE (not an `@odoo-module`, see its comment at `login.js:8-10`), loaded into `web.assets_frontend` by `__manifest__.py:48` (the bundle is `__manifest__.py:45-49`). It finds `.o_sf_login` (`login.js:13`), reads the same `localStorage` key — **hard-coded as the string `"strataflow.theme"` at `login.js:19`, not imported from `theme.js:3`** — and stamps `data-theme` **only** when the stored value is exactly `"light"` or `"dark"` (`login.js:23-25`). It never calls `matchMedia`. It does not need to: `login.scss` already implements the three states in pure CSS — light tokens on the bare class (`login.scss:11`, `:25`), dark under `@media (prefers-color-scheme: dark)` guarded by `:not([data-theme="light"])` (`login.scss:26-28`), and an explicit `[data-theme="dark"]` override (`login.scss:29`). The markup at `views/strataflow_login.xml:12` carries no `data-theme`, so with nothing stored the media query rules and follows the OS live, with no reload and no JS. **The login page is already three-state and already follows the OS while it is open; the shell is the half that is behind.**
- **Storage is already forward-compatible.** Values `"light"` and `"dark"` mean exactly the same thing under the new scheme (an explicit pick), so there is no data migration to write. The only behaviour change for existing users is that *absent or unrecognised* now means the named mode `"system"` instead of an anonymous fallback.
- Stock pages are unaffected and must stay that way: `static/src/stock/stock.scss:17` pins `@include tokens-light` on `.o_web_client`, and Odoo CE serves one colour scheme (`ir.http.color_scheme()` is hard-coded to `light`; see `BACKLOG.md` "Stock views, dark").
- Stock seams that exist in this tree and this task uses: `Dropdown` (`addons/web/static/src/core/dropdown/dropdown.js:53`, props `menuClass` at `:57` and `position` at `:58`) and `DropdownItem` (`addons/web/static/src/core/dropdown/dropdown_item.js:10`, props `class` at `:17`, `onSelected` at `:21`, `attrs` at `:29`). `DropdownItem`'s template writes `role="menuitem"` at `dropdown_item.xml:11` and then applies `t-att="props.attrs"` at `dropdown_item.xml:13`, so `attrs` can override `role`. `Dropdown` sets `ariaExpanded` on its target element itself (`dropdown.js:267`, `:360`, `:381`) but does **not** set `aria-haspopup`. The addon already uses this exact pair at `static/src/screens/workorders.xml:48-56` with the `menuClass` getter at `workorders.js:265`. `browser.matchMedia` also exists as a patchable seam at `addons/web/static/src/core/browser/browser.js:44`; this addon has no JS tests, so it buys nothing here.
- `.o_sf_menu` styling (the themed dropdown surface) is `strataflow.scss:203-206`; `min-width: 240px` at `:203`, item rows `.o_sf_menu_item` with `b`/`small` at `:204-205`. The round top-bar button is `.o_sf_round` at `strataflow.scss:108`.

## Decision needed

**Does the top-bar control become a three-way cycle button, or a menu?**

- *Cycle* — one click steps system → light → dark → system. Cheapest to build (no new components), keeps the light↔dark flip one click away.
- *Menu* — the button opens a three-item list with the current mode checked. Costs one extra click for a light↔dark flip.

**Recommendation: menu.** A cycle cannot tell the user what state they are in *or* what is next, and the failure it is meant to fix is precisely the user not knowing why the theme is what it is: with an icon-only cycle, "dark because I chose dark" and "dark because my Mac is dark" look identical, and there is no way to discover the third state except by clicking past it. A menu names all three states, shows which is active, and says out loud that system means "follows your device". The cost is one component import — the repo already ships this exact themed-dropdown pattern (`workorders.xml:48-56`, `workorders.js:265`) and the `.o_sf_menu` surface (`strataflow.scss:203-206`), so the menu is roughly ten lines of template.

Two follow-ons, only if you disagree with the defaults below — otherwise treat them as decided:

- Selecting **System** writes the literal string `"system"` to `localStorage["strataflow.theme"]` rather than deleting the key. Recommended: an explicit value is self-describing and distinguishes "chose system" from "never chose" if that ever matters; `login.js:23` already ignores anything that is not `light`/`dark`, so both behave identically today.
- An **OS-driven** flip runs the same 480 ms `is-theming` colour fade as a click. Recommended: yes — an instant hard cut across a full-screen glass UI is more startling than the fade, and the code path is shared.

## Plan

1. **`static/src/core/theme.js` — make the store three-state.** Keep `KEY` (`:3`) and `FADE_MS` (`:4`) as they are.
   - Add a module-scope `const MQ = window.matchMedia?.("(prefers-color-scheme: dark)")`, retained (today the result is read once and dropped at `:15`).
   - Replace `readTheme()` (`:6-16`) with `readMode()`: return the stored value when it is one of `"system" | "light" | "dark"`, else `"system"`. Keep the existing `try/catch` (`:7-14`) — blocked storage must yield `"system"`, not throw.
   - Add `function resolve(mode) { return mode === "system" ? (MQ?.matches ? "dark" : "light") : mode; }`. The `?.` matters: `matchMedia` is optional-chained today at `:15` for environments that lack it, and `resolve` must degrade to `"light"` the same way.
   - Change the store at `:19` to `reactive({ mode, theme: resolve(mode), fading: false })` — `mode` is the preference, `theme` stays the resolved `"light" | "dark"` that every consumer already reads (`shell.xml:5`, `strataline_map.js:310/354/360`, `workorders.js:198/265`). **Do not rename `.theme`.**
   - Add a private `applyResolved(next)`: if `next === store.theme`, return (an OS flip while an explicit mode is selected must not run a fade); else set `store.fading = true`, set `store.theme = next`, and reuse the existing `clearTimeout(fadeTimer)` / `setTimeout(… FADE_MS)` pair from `:36-37`.
   - Export `setThemeMode(mode)`: set `store.mode`, persist it inside the existing `try/catch` shape from `:31-35`, then `applyResolved(resolve(mode))`.
   - **Delete `toggleTheme` (`:28-38`).** Its only caller is `shell.js:143`.
   - Register the listener once, at module scope, immediately after the store: `MQ?.addEventListener?.("change", (ev) => { if (store.mode === "system") { applyResolved(ev.matches ? "dark" : "light"); } });`. **It is never torn down, and that is correct** — the store it writes to is a module-load singleton (`:19`), shared across every screen and outliving every component; a component-scoped listener would be re-registered on each screen swap and absent during the gap between unmount and mount that `shell.js:21-26` documents. The module is evaluated once per page load by `web.assets_backend`, so exactly one listener exists. Optional-chain `addEventListener` so an environment without `MediaQueryList` cannot throw at import time.
   - No migration code. Stored `"light"` / `"dark"` are already valid modes with unchanged meaning; absent/garbage now resolves to `"system"`.
2. **`static/src/core/shell.js` — drive the new control.**
   - `import { setThemeMode, useTheme } from "./theme";` (replaces `:6`), plus `import { Dropdown } from "@web/core/dropdown/dropdown";` and `import { DropdownItem } from "@web/core/dropdown/dropdown_item";` — the stock seams at `addons/web/static/src/core/dropdown/dropdown.js:53` and `dropdown_item.js:10`, already used this way at `workorders.js:7-8`.
   - Add `static components = { Dropdown, DropdownItem };` to `StrataflowShell` (it currently declares none; see `shell.js:44-58`).
   - Add `THEME_MODES = [{ key: "system", label: _t("System"), hint: _t("Follows your device") }, { key: "light", label: _t("Light") }, { key: "dark", label: _t("Dark") }]` beside `NAV` (`shell.js:8-14`), using the already-imported `_t` (`shell.js:3`).
   - Add a `menuClass` getter, identical in shape to `workorders.js:265`: `"o_sf_menu o_sf_menu--sm" + (this.theme.theme === "dark" ? " o_sf_theme_dark" : "")`. Without the theme class the menu paints light on a dark shell, because it renders in Odoo's overlay container outside `.o_sf` (`strataflow.scss:9`).
   - Add a `themeLabel` getter returning the accessible name for the current **mode**, e.g. `_t("Theme: System (follows your device)")` / `_t("Theme: Light")` / `_t("Theme: Dark")`.
   - Replace `toggleTheme()` (`:142-144`) with `setTheme(mode) { setThemeMode(mode); }`.
3. **`static/src/core/shell.xml` — replace the toggle with the menu.** Rewrite `:60-62` as a `<Dropdown menuClass="menuClass" position="'bottom-end'">` whose default slot is the existing `.o_sf_round` button and whose `content` slot holds three `DropdownItem`s.
   - The button: keep `class="o_sf_round"`, add `aria-haspopup="menu"` (stock `Dropdown` manages `aria-expanded` itself at `dropdown.js:267/360/381` but not `haspopup`), set `t-att-aria-label="themeLabel"` and `t-att-title="themeLabel"`, and **remove `aria-pressed`** — `aria-pressed` describes a two-state toggle and would misreport a three-state control.
   - The icon is chosen by `theme.mode`, not `theme.theme`, or "system" is invisible: `t-if="theme.mode === 'light'"` a sun, `t-elif="theme.mode === 'dark'"` the existing moon path from `:61`, `t-else` a half-filled circle (a circle with a half-disc fill) for system. Keep the existing `width="18" height="18" viewBox="0 0 20 20" stroke-width="1.7"` geometry so the three sit identically in the 48 px button (`strataflow.scss:108`).
   - Each item: `<DropdownItem class="'o_sf_menu_item'" attrs="{ role: 'menuitemradio', 'aria-checked': theme.mode === 'system' ? 'true' : 'false' }" onSelected="() => this.setTheme('system')"><b>System</b><small>Follows your device</small></DropdownItem>`, and the same for light/dark (no `<small>`). `attrs` is applied at `dropdown_item.xml:13` *after* the literal `role="menuitem"` at `:11`, so it overrides — confirm in the inspector, do not assume.
   - Render a check mark on the active row (a `<span class="o_sf_menu_check">✓</span>`, hidden with `t-if`) so the state is carried by more than the accessibility tree.
4. **`static/src/strataflow.scss` — two small additions next to `.o_sf_menu` (`:203-206`).** A `--sm` modifier (`min-width: 190px`) so a three-word menu is not 240 px wide, and a row layout for the check mark (`.o_sf_menu_item` is `flex-direction: column` today at `:204`; put the check in a wrapper row or absolutely position it — do not restructure `.o_sf_menu_item`, `workorders.xml:51-54` depends on it). Plain px values only — see Landmines.
5. **`static/login/login.js` — align it, no behaviour change needed.** Verify and document that the guard at `:23` already ignores `"system"` (falling through to the CSS at `login.scss:26-29`, which follows the OS live). Update the comment block at `:1-10` to describe the three modes and to state that this file's hard-coded key string at `:19` mirrors `KEY` in `theme.js:3` and must be changed with it. Optionally make the guard explicit — `if (saved === "light" || saved === "dark") { … } else { root.removeAttribute("data-theme"); }` — belt and braces against a stale attribute; the markup at `views/strataflow_login.xml:12` never sets one.
6. **`static/login/login.scss` — comment only.** The rules at `:25-29` are already correct three-state. Update the comment at `:18-21` to name the app's three modes (`system` / `light` / `dark`) instead of "an explicit choice", so the next reader does not think the two files disagree.
7. **Explicit non-goals.** Do not add a `storage` event listener to sync two open tabs — out of scope. Do not touch `stock.scss:17` or attempt dark stock views; that is the separate `BACKLOG.md` "Stock views, dark" item. When that item lands, whatever cookie it writes must be fed the **resolved** theme and rewritten from the `change` listener added in step 1.

## Files

| path | what changes |
| --- | --- |
| `addons/strataflow_workorder/static/src/core/theme.js` | Three-state store (`mode` + resolved `theme`), retained `MediaQueryList`, module-scope `change` listener, `setThemeMode()` replaces `toggleTheme()` |
| `addons/strataflow_workorder/static/src/core/shell.js` | `Dropdown`/`DropdownItem` components, `THEME_MODES`, `menuClass` and `themeLabel` getters, `setTheme(mode)` replaces `toggleTheme()` |
| `addons/strataflow_workorder/static/src/core/shell.xml` | Top-bar button becomes a Dropdown target with a per-mode icon and accessible label; three `menuitemradio` items in the content slot |
| `addons/strataflow_workorder/static/src/strataflow.scss` | `.o_sf_menu--sm` width modifier and check-mark row styling beside the existing `.o_sf_menu` block |
| `addons/strataflow_workorder/static/login/login.js` | Comment rewritten for three modes + the mirrored-key warning; optional explicit `else removeAttribute` guard |
| `addons/strataflow_workorder/static/login/login.scss` | Comment at the token block rewritten to name the three modes |

No new files. No Python, no XML views, no manifest change — `static/src/**/*.{scss,js,xml}` is already globbed into `web.assets_backend` (`__manifest__.py:39-41`, with `tokens.scss` ahead of them at `:38`) and the login pair into `web.assets_frontend` (`__manifest__.py:47-48`).

## Landmines

- **Sass eats CSS `min()`/`max()` with mixed units.** `min(52%, 460px)` once threw "Incompatible units: px and %" and killed the *entire* stylesheet bundle, after which Odoo silently served the previous CSS behind a small red banner — the change looks like it did nothing. The new `.o_sf_menu--sm` width in step 4 must be a bare `190px`, never `min(190px, 40%)`. Grep any new SCSS for `min(` / `max(` before reloading.
- **Odoo compiled CSS is not whitespace-minified.** Verify the new rules landed with a regex over `document.styleSheets`, not an exact substring match.
- **"Verified server-side" is not verified.** Six visual bugs shipped past every HTTP check here. The core of this task — the live OS flip — cannot be checked by any request: you must actually toggle macOS System Settings › Appearance with the app on screen. Six visual bugs' worth of precedent says do it in the browser.
- **The theme key is mirrored in two files with no shared import.** `theme.js:3` (`const KEY`) and `login.js:19` (the literal `"strataflow.theme"`), in two different asset bundles that cannot import each other. This is the same trap as `projectDrawing` / `controllers/export.py`: they must be changed together or the login page silently stops following the app.
- **The dropdown menu renders outside `.o_sf`.** Odoo mounts it in the overlay container, so it inherits none of the shell's tokens; it only goes dark via the `menuClass` → `o_sf_theme_dark` route (`strataflow.scss:9`, precedent `workorders.js:265`). Forget it and the menu is a white card on a dark shell — and this is the one menu that is *about* dark mode.
- **`map.isStyleLoaded()` is not "the style is ready"; `styleReady` is.** After this change the map's full `setStyle(..., { diff: false })` path at `strataline_map.js:253-261` can be triggered by the *operating system*, not just by a click, and it resets `styleReady = false` at `:256`. Anything you add near the map must be guarded on `styleReady`, and nothing may assume a theme change is user-initiated or that no theme change can arrive while a style is streaming.
- **`holdPageGround` paints `<html>` in the shell theme for 600 ms after unmount** (`shell.js:29-42`, colours at `strataflow.scss:33-36`). It is keyed on the resolved theme (`shell.js:75-80`), so an OS flip repaints it correctly — but it also means an OS flip to dark seconds before leaving Strataflow still hands a stock Odoo page a 600 ms dark ground. That is the existing `BACKLOG.md` flash, unchanged; do not "fix" it here.
- **Odoo CE has no dark mode.** `ir.http.color_scheme()` is hard-coded to `light` and `stock.scss:17` pins `tokens-light` on `.o_web_client`. The three-way menu governs `.o_sf` only; do not let the "System" wording imply stock Odoo pages will follow.
- **Odoo forbids `@import` between asset files.** Everything new here goes into files already in the bundles; do not add an `@import` to reach `tokens.scss`.
- **Quote grep globs in zsh.** `--include=*.scss` unquoted expands and the flag vanishes silently, so you get a "clean" grep that searched nothing. Write `--include="*.scss"`, and `--exclude-dir=lib` to keep `static/lib/maplibre-gl` (32 000 minified lines, several `matchMedia` hits) out of the results.
- **New: a `matchMedia` listener must not be owned by a component.** Every screen is its own client action, so shell components are destroyed and recreated on each navigation and there is a window where none exists (`shell.js:21-26`). Register the listener at module scope alongside the singleton store (`theme.js:19`) and never remove it — it dies with the page.

## Acceptance criteria

- [ ] `localStorage["strataflow.theme"]` accepts exactly `"system"`, `"light"`, `"dark"`; anything else (including absent) is read as `"system"`.
- [ ] A fresh profile with no stored value lands in `system` mode and matches the OS on first paint.
- [ ] An existing stored `"light"` or `"dark"` still loads as that explicit mode after the upgrade, with the corresponding menu item checked. No migration script runs.
- [ ] With `system` selected and the app open, flipping the OS appearance repaints the shell within one animation frame — no reload — running the same 480 ms `is-theming` fade as a click.
- [ ] With `light` or `dark` selected, flipping the OS appearance changes nothing on screen, and `store.fading` never turns on.
- [ ] The top-bar control shows a distinct icon for each of the three modes and its `aria-label`/`title` name the current mode. It no longer carries `aria-pressed`.
- [ ] The menu marks the active mode both visually (check) and programmatically (`aria-checked="true"` on a `menuitemradio`), and picking each of the three modes takes effect immediately and survives a reload.
- [ ] The menu surface itself renders in the current theme (dark card on a dark shell).
- [ ] `toggleTheme` no longer exists in the addon: `grep -rn --exclude-dir=lib "toggleTheme" addons/strataflow_workorder` returns nothing.
- [ ] Every existing consumer still reads a plain `"light" | "dark"` from `.theme` — `shell.xml:5`, `strataline_map.js:310/354/360`, `workorders.js:198/265` are unchanged.
- [ ] The map restyles correctly when the OS flips while Dispatch is open (pins, labels and utility overlay all return).
- [ ] Login page: with `"dark"` stored it renders dark; with `"system"` stored (or nothing) it follows the OS **and reacts to an OS flip live, without a reload**.
- [ ] The SCSS bundle compiles: no red banner, and the new `.o_sf_menu--sm` rule is present in the served CSS.

## Verification

Restart with an update, because JS/XML/SCSS all changed:

```
cd /Users/stefan/strataflow
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  --dev=xml --http-port=8069 --log-level=warn -u strataflow_workorder
```

Static checks before the browser:

```
grep -rn --exclude-dir=lib "toggleTheme" addons/strataflow_workorder            # expect: no output
grep -rn --exclude-dir=lib --include="*.scss" -E "min\(|max\(" addons/strataflow_workorder/static  # expect: no mixed-unit hits
# today this prints ~8 lines, all grid `minmax(...)` plus the warning comment at strataflow.scss:257 — none are mixed-unit min()/max(); anything new must stay that way
grep -n "strataflow.theme" addons/strataflow_workorder/static/src/core/theme.js \
                           addons/strataflow_workorder/static/login/login.js    # expect: the same string in both
```

In the browser at `http://localhost:8069/odoo/desk` (login `admin`/`admin`), with devtools open:

1. **Bundle compiled.** Console:
   `[...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } }).filter(r => /o_sf_menu--sm/.test(r.cssText || "")).length` → non-zero. (Odoo's CSS is not minified, so match with a regex, and a zero here plus a red banner means the SCSS failed and you are looking at the *previous* stylesheet.)
2. **Fresh state.** `localStorage.removeItem("strataflow.theme")`, set macOS to Dark, hard reload → shell is dark, top-bar icon is the system icon, menu shows **System** checked.
3. **Live OS flip, system mode.** Leave the app on screen. System Settings › Appearance → Light. The shell fades to light within the 480 ms window without a reload; `localStorage.getItem("strataflow.theme")` is still `"system"`.
4. **Explicit pin.** Open the menu, pick **Dark**. Flip the OS to Light and back → the shell stays dark throughout. `localStorage.getItem("strataflow.theme")` === `"dark"`. Reload → still dark.
5. **Back to system.** Pick **System** → the shell snaps to the OS value with the fade; reload → still follows the OS.
6. **Legacy value.** `localStorage.setItem("strataflow.theme", "light")`, reload → light, **Light** checked, and an OS flip to dark changes nothing.
7. **Accessibility.** Inspect the top-bar button: `aria-haspopup="menu"`, `aria-label` naming the current mode, **no** `aria-pressed`. Open the menu and inspect a row: `role="menuitemradio"` and `aria-checked="true"` on exactly the active one (this is the `dropdown_item.xml:13` `attrs` override — read it off the live DOM, do not trust the template).
8. **Menu skin.** In dark mode, the open menu node in the overlay container carries `o_sf_theme_dark` and paints as a dark glass card.
9. **Map.** Navigate to `/odoo/dispatch`, select System, flip the OS. The basemap restyles and pins, the selected label and the utility overlay all come back (this exercises the `styleReady` path at `strataline_map.js:253-261`).
10. **Login.** Sign out to `/web/login`. With `"dark"` stored the card is dark; set `"system"` in the console, reload, then flip the OS — the login page follows immediately with no reload. Confirm no `data-theme` attribute is present on `.o_sf_login` in system mode.
