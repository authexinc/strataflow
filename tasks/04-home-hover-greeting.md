# 04 — Home screen: hover animation and rotating time-aware greeting

Two small changes to the Home screen (`/odoo/desk`): replace the app-tile hover treatment with something
that reads as motion without moving the click target, and make the `<h1>` greeting rotate through a pool of
phrases instead of showing the same three strings forever. The greeting is *already* time-aware — the real
gaps are variety and the fact that it reads the browser clock rather than the Odoo user's timezone. Both
changes are confined to `screens/home.js`, `screens/home.xml` and `src/strataflow.scss`; no Python, no
manifest edit.

## The ask

> 4. Change hover animation on Home Screen

> 16. The "Good morning" on the Home Screen needs to switch between different greetings and also look at the time of day, it's current.

## What is true today

**The greeting is already time-aware. Item 16 is wrong on that point.**

- `addons/strataflow_workorder/static/src/screens/home.js:50-53` is the whole greeting:
  `const h = DateTime.local().hour;` then `h < 12 ? _t("Good morning") : h < 17 ? _t("Good afternoon") : _t("Good evening")`,
  then `` `${part}, ${(user.name || "").split(" ")[0]}` ``. It already buckets by hour and appends the first name.
- It is rendered once, at `addons/strataflow_workorder/static/src/screens/home.xml:8`, `<h1 class="o_sf_home_h1" t-esc="greeting"/>`.
- `luxon` is a bare global, not an import: `const { DateTime } = luxon;` at `home.js:10`. Same pattern at
  `addons/strataflow_workorder/static/src/core/format.js:1`. Those two files are the module's only luxon consumers.

So what is actually missing is (a) **variety** — there are exactly three phrases and they never rotate inside a
bucket — and (b) **correctness of the clock source**: `DateTime.local()` is the browser's zone, not the Odoo user's.

**The user timezone IS reachable client-side in this tree.** Confirmed end to end:

- `odoo/addons/base/models/res_users.py:700` — `context_get()` does `self.env.user.read(['lang', 'tz'], load=False)[0]`.
- `addons/web/models/ir_http.py:90` and `:108` — that context is put on the session and shipped as `"user_context"` in `session_info`.
- `addons/web/static/src/core/user.js:177-179` — `get tz() { return this.context.tz; }`. `user` is already imported at `home.js:6`.
- Odoo never sets luxon's default zone in shipped code. The only two `Settings.defaultZone` references under
  `addons/web/static/src` are reads, in `views/calendar/calendar_year/calendar_year_renderer.js:68` and
  `views/calendar/calendar_common/calendar_common_renderer.js:143` (test helpers under `addons/web/static/tests`
  do assign it, but none of those load in the served backend bundle).
  `addons/web/static/src/core/l10n/localization_service.js:107,110`
  set only `defaultLocale` and `defaultNumberingSystem`. So luxon's `"default"` zone is the browser zone, and
  Odoo's own date helpers (`dates.js:434,488,691` and `:711`, all `setZone(options.tz || "default")` — `:711`
  spells it `options?.tz`, and the parse path passes `zone: options.tz || "default"` at `:611`) are browser-local
  too unless a caller passes `tz`. Reading `user.tz` is the deliberate, non-default choice here.

**`_t` on a module-level pool works.** `addons/web/static/src/core/l10n/translation.js:95-116` — `_t()` returns a
`TranslatedString` (a `String` subclass declared at `:134`) that is *lazy* when translations have not loaded yet
(`:154`) and resolves on `valueOf()`/`toString()` (`:159-163`). The `APPS` array at `home.js:13-21` already calls `_t()` at module load for exactly this
reason and works. A pool of `_t(...)` phrases in a module-level const behaves identically and is picked up by
the standard JS term extractor, which scans `_t(` call sites statically.

**The re-render trap.** `greeting` is a plain getter (`home.js:50`), so OWL re-evaluates it on every render of
`HomeScreen`. The component renders at least twice on every visit: once with `state.loading === true` (set in
`setup()`, `home.js:38`) and again when `onMounted` resolves the two ORM calls and flips `loading` to `false`
(`home.js:39-47`). A `Math.random()` pick would visibly swap the phrase the moment the skeleton is replaced.

**Hover today**, all in `addons/strataflow_workorder/static/src/strataflow.scss`:

- `:213` — `.o_sf_apps` is `grid-template-columns: repeat(auto-fill, minmax(228px, 1fr)); gap: 12px;`.
- `:214` — `.o_sf_app` is `@include glass(var(--glass-72))`, `display: block`, `border-radius: 24px`, and
  `transition: box-shadow .2s ease, border-color .2s ease`. **It has no `position` and no `isolation`.**
- `:215` — its resting background is `linear-gradient(150deg, color-mix(in srgb, var(--hue) 9%, transparent), transparent 55%), var(--glass-72)`
  plus `box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,.25)`.
- `:216-218` — a comment recording the decision: *"Hover washes the glass in the tile's own hue and rings it,
  rather than lifting the card: the tiles sit on a 12px grid, so a translate moves the pointer target out from
  under the cursor and nudges its neighbours."*
- `:219-220` — the hover rule: `border-color: color-mix(in srgb, var(--hue) 40%, var(--edge))` plus a four-part
  `box-shadow` whose third part, `inset 0 0 0 999px color-mix(in srgb, var(--hue) 7%, transparent)`, is the hue
  wash and whose fourth is a 1px hue ring.
- `:221` — `&:hover .o_sf_app_icon { transform: scale(1.05); }`. `:223` declares that icon's
  `transition: transform .2s ease` (transform only — **no box-shadow transition on the icon today**).
- `:222` — `&.is-soon { opacity: .72; }`.
- `--hue` arrives as an inline style per tile from `home.xml:18` (`t-attf-style="--hue: {{ app.hue }}"`),
  values listed at `home.js:13-21`.

**The recorded rejection has a source.** `DEVLOG.md:531-537`: hover *was* `translateY(-3px)` plus a bigger shadow;
it was removed after an `apple-design` review, quoting the pointer guidance *"reserve scaling for elements that
can increase in size without crowding nearby elements"*. Note that quote condemns **scaling**, not only translation
— so "scale the card instead of translating it" is not a loophole, it is the same objection.

**Reduced motion**, `strataflow.scss:380-388`: `.o_sf_app, .o_sf_lead { transition: none; }` (`:382`),
`.o_sf_app_icon { transition: none; }` (`:383`), `.o_sf_app:hover .o_sf_app_icon { transform: none; }` (`:384`).
Any new animated property must be neutralised in this block too.

**The codebase is already inconsistent.** `strataflow.scss:304` — `.o_sf_lead` (CRM kanban cards) does
`transition: transform .15s ease, box-shadow .15s ease; &:hover { transform: translateY(-2px); box-shadow: var(--shadow-hi); }`.
Those live in a vertical scrolling column, not a tight two-axis grid, which is the defensible difference; it is
still worth deciding whether to keep it.

**Two adjacent facts found while reading, neither in the ask:**

1. `.o_sf_app:hover` (specificity 0,2,0) sets `box-shadow` and therefore **wipes the focus ring** from
   `strataflow.scss:46`, `:where(button, input, a, [tabindex]):focus-visible { outline: none; box-shadow: var(--focus); }`.
   `:where()` contributes nothing, but that rule is nested inside `.o_sf` (opened at `:37`), so it compiles to
   `.o_sf :where(…):focus-visible` — also (0,2,0). The tie is broken by source order and the hover rule is 173 lines
   later, so it wins. A keyboard-focused tile that is also hovered loses its ring today.
2. `home.js:57` — `dateLine` reads `user.context?.company_name`. `company_name` is **never** in the user context:
   `context_get` returns only `lang`, `tz`, `uid` (`res_users.py:700-721`) plus `allowed_company_ids` added
   client-side in `user.js`. The `|| "Calgary + area"` fallback therefore always wins. Out of scope here; noted so
   the next reader does not chase it.

## Decision needed

**1. Which hover treatment?** Item 4 names no target look. Three concrete options, all of which honour the
`:216-218` no-translate decision. Exact CSS below, all for `strataflow.scss`.

*Option A — turn up what is already there (CSS only, ~4 lines changed).* Deeper wash, hue-tinted ambient shadow,
a slightly bigger icon that also lifts its own shadow:

```scss
&:hover, &:focus-visible {
  border-color: color-mix(in srgb, var(--hue) 55%, var(--edge));
  box-shadow: var(--shadow-hi),
              inset 0 1px 0 rgba(255,255,255,.32),
              inset 0 0 0 999px color-mix(in srgb, var(--hue) 11%, transparent),
              0 0 0 1px color-mix(in srgb, var(--hue) 32%, transparent),
              0 10px 26px color-mix(in srgb, var(--hue) 22%, transparent);
}
&:hover .o_sf_app_icon, &:focus-visible .o_sf_app_icon {
  transform: scale(1.08) translateY(-1px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.4), 0 8px 18px color-mix(in srgb, var(--hue) 45%, transparent);
}
// and at :223, extend the icon's transition:
.o_sf_app_icon { transition: transform .2s ease, box-shadow .2s ease; /* …rest unchanged… */ }
```

Cheapest and safest, but it is the same idea louder — Stefan may not read it as "changed".

*Option B — pointer-tracked hue spotlight (RECOMMENDED).* A radial highlight in the tile's own hue follows the
cursor across the glass. Genuinely different, unmistakably animated, and **nothing moves**: no layout box, no
hit target, no neighbour.

```scss
// .o_sf_app gains: position: relative; isolation: isolate;
.o_sf_app::before {
  content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit; pointer-events: none;
  opacity: 0; transition: opacity .18s ease;
  background: radial-gradient(circle 200px at var(--mx, 50%) var(--my, 50%),
                              color-mix(in srgb, var(--hue) 22%, transparent), transparent 68%);
}
.o_sf_app:hover::before, .o_sf_app:focus-visible::before { opacity: 1; }
```

Costs ~8 lines of JS (a single delegated `mousemove` on the grid, step 6 below). Keep the existing `:219-220`
static wash underneath it, so reduced motion and touch devices still get a hover state with the pseudo-element
switched off entirely.

*Option C — sheen sweep.* A diagonal white highlight that travels once across the tile per hover-in:

```scss
.o_sf_app::before { /* same box as B */ background: linear-gradient(105deg, transparent 35%,
    rgba(255,255,255,.22) 50%, transparent 65%); transform: translateX(-100%); }
.o_sf_app:hover::before { animation: o_sf_sheen .6s ease forwards; }
@keyframes o_sf_sheen { to { transform: translateX(100%); } }
```

Not recommended: it is decoration rather than feedback, it does not persist while the cursor rests on the tile,
and re-triggering on a second hover needs an animation restart hack.

*Explicitly not offered as a default:* re-adding `transform: translateY(-2px)` or `scale(1.01)` on the card.
That was removed on purpose (`strataflow.scss:216-218`, `DEVLOG.md:531-537`) and the guidance cited there
rules out scaling as well as translation. **If Stefan wants the lift back, it is his call to overturn — say so
explicitly, and the implementer must update the comment at `:216-218` and the DEVLOG rather than silently
deleting a recorded decision.**

**2. Keep three time buckets, or add a late-night one?** Today: `<12`, `<17`, else (`home.js:51`). A fourth
bucket (`hour < 5` → "Still up", "Burning the midnight oil") is cute but expands the translation surface for a
case a dispatcher rarely sees. **Recommendation: keep three.**

**3. Should the phrase change while a tab sits open across a bucket boundary?** Adding a timer means the heading
can mutate under someone who is reading it. **Recommendation: no timer.** The greeting is correct as of page load
and re-renders naturally on navigation.

**4. Should `.o_sf_lead` (CRM cards, `strataflow.scss:304`) keep its `translateY(-2px)`?**
**Recommendation: yes, leave it.** Those cards are in a one-dimensional scrolling column, not on a two-axis
12px grid, so the "nudges its neighbours" objection does not apply. Answer only so the inconsistency is on record.

## Plan

Steps 1–4 are item 16, steps 5–7 are item 4 (step 6 and the SCSS in step 5 depend on decision 1; the text below
assumes **Option B**).

1. **`static/src/screens/home.js`** — add a module-level phrase pool immediately below `APPS` (`:21`), using the
   same lazy-`_t` pattern that `APPS` already relies on:

   ```js
   // Lazy _t at module load, exactly like APPS above: _t returns a TranslatedString that resolves
   // on toString(), so these are safe to build before translations land.
   const GREETINGS = {
       morning:   [_t("Good morning"), _t("Morning"), _t("Rise and shine"), _t("Up early")],
       afternoon: [_t("Good afternoon"), _t("Afternoon"), _t("Hope the day's going well")],
       evening:   [_t("Good evening"), _t("Evening"), _t("Winding down")],
   };
   ```
   Keep `Good morning` / `Good afternoon` / `Good evening` as the first entry of each list so nothing that exists
   today is lost from the PO files.

2. **`static/src/screens/home.js`** — add an exported pure helper above the class, so it is testable from the
   browser console (see Verification) and has no dependency on component state:

   ```js
   export function greetingFor(now) {
       const h = now.hour;
       const bucket = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
       const pool = GREETINGS[bucket];
       // Stable within a (day, bucket): same phrase across every re-render AND across reloads.
       // `now.ordinal` is luxon's day-of-year (1..366). Step by 1 per day, not by 3: a multiple of 3
       // is invisible modulo the three-entry afternoon and evening pools, which would pin those two
       // buckets to one phrase for a whole year.
       const seed = now.year * 366 + now.ordinal + ["morning", "afternoon", "evening"].indexOf(bucket);
       return pool[seed % pool.length];
   }
   ```
   Deterministic, so the OWL double render at `home.js:38-47` cannot flip the phrase, and F5 cannot either.

3. **`static/src/screens/home.js:50-53`** — rewrite the getter to use the user timezone and the helper:

   ```js
   get now() {
       // user.tz is res.users.tz via session user_context (web/static/src/core/user.js:177).
       // It is `false` when the user has no timezone set, and luxon turns a non-null non-string
       // zone into an InvalidZone, so guard before falling back to the browser zone.
       const dt = DateTime.local().setZone(user.tz || "default");
       return dt.isValid ? dt : DateTime.local();
   }
   get greeting() {
       return `${greetingFor(this.now)}, ${(user.name || "").split(" ")[0]}`;
   }
   ```

4. **`static/src/screens/home.js:57`** — point `dateLine` at the same clock (`this.now.toFormat("cccc, LLLL d")`)
   so the date and the greeting cannot disagree about which day it is across a midnight boundary. Leave the
   `company_name` fallback alone.

5. **`static/src/strataflow.scss:214-223`** — add `position: relative; isolation: isolate;` to `.o_sf_app`,
   add the `::before` spotlight and its `:hover`/`:focus-visible` rule from Option B, and extend the existing
   `:219` selector to `&:hover, &:focus-visible` so keyboard users get the same treatment. Add, after it,
   `&:focus-visible { box-shadow: /* same list as hover */, var(--focus); }` to fix the ring that the hover
   `box-shadow` currently eats (see "What is true today", adjacent fact 1). **Rewrite the comment at `:216-218`**
   so it still explains the standing decision and now also explains why the spotlight is allowed under it.

6. **`static/src/screens/home.xml:16` and `static/src/screens/home.js`** — one delegated listener, on the grid
   rather than on each of the eight tiles:

   ```xml
   <div class="o_sf_apps" t-on-mousemove="onAppMove">
   ```
   ```js
   onAppMove(ev) {
       const tile = ev.target.closest(".o_sf_app");
       if (!tile) { return; }
       const r = tile.getBoundingClientRect();
       tile.style.setProperty("--mx", `${ev.clientX - r.left}px`);
       tile.style.setProperty("--my", `${ev.clientY - r.top}px`);
   }
   ```
   No `onWillUnmount` cleanup is needed: OWL owns the listener because it is declared in the template.

7. **`static/src/strataflow.scss:380-388`** — inside the existing `prefers-reduced-motion` block, add
   `.o_sf_app::before { display: none; }`. That kills the tracking and the fade in one line and leaves the
   static hue wash from `:219-220` as the hover state, which is what Reduce Motion asks for. Leave `:382-384`
   as they are.

**Stock Odoo seams used** (read-only, nothing upstream is edited):
`user.tz` — `addons/web/static/src/core/user.js:177-179`; `_t` — `addons/web/static/src/core/l10n/translation.js:95`;
`luxon` as a global, loaded into the backend by the `web._assets_core` bundle at
`addons/web/__manifest__.py:366` (`web/static/lib/luxon/luxon.js`), which `web.assets_backend` includes at `:58`.

**No manifest change.** `addons/strataflow_workorder/__manifest__.py:38-41` globs
`static/scss/tokens.scss`, `static/src/**/*.scss`, `static/src/**/*.js`, `static/src/**/*.xml` into
`web.assets_backend`, so edited files are picked up without touching the manifest.

## Files

| path | what changes |
| --- | --- |
| `addons/strataflow_workorder/static/src/screens/home.js` | `GREETINGS` pool + exported `greetingFor()` helper; `now` getter reading `user.tz`; `greeting` and `dateLine` rewired to it; `onAppMove` handler (Option B only) |
| `addons/strataflow_workorder/static/src/screens/home.xml` | `t-on-mousemove="onAppMove"` on `.o_sf_apps` at `:16` (Option B only) |
| `addons/strataflow_workorder/static/src/strataflow.scss` | `.o_sf_app` gains `position: relative; isolation: isolate;` and a `::before` spotlight; `:hover` extended to `:focus-visible` and a focus-ring rule added; the `:216-218` comment rewritten; `::before { display: none }` added to the reduced-motion block at `:380-388` |

No new files.

## Landmines

- **Sass eats `min()`/`max()` with mixed units.** `min(52%, 460px)` once threw *"Incompatible units: px and %"*
  and killed the entire stylesheet bundle — and Odoo then serves the **previous** CSS behind a small red banner,
  so the change looks like it simply did nothing. The spotlight radius is the obvious temptation here
  (`radial-gradient(circle min(200px, 60%) at …)`). **Do not.** Use a plain `200px`. Grep the diff for
  `min(` / `max(` before restarting.
- **Odoo's compiled CSS is not whitespace-minified.** Verify the rule shipped with a regex over the served
  bundle, never an exact substring match.
- **`user.tz` is `false`, not `undefined`, when unset.** `luxon.js:1632-1648` `normalizeZone` returns the default
  zone only for `undefined`/`null`; anything else non-string non-number falls through to
  `new InvalidZone(input)`. `DateTime.local().setZone(false).hour` is `NaN`, and `NaN < 12` and `NaN < 17` are both
  false — so the greeting would silently pin to "Good evening" forever. The `user.tz || "default"` plus
  `isValid` guard in step 3 is mandatory, not defensive padding.
- **`isolation: isolate` is load-bearing for the `z-index: -1` pseudo-element.** The tile establishes a stacking
  context today only through `backdrop-filter` in the `glass` mixin (`static/scss/tokens.scss:65-72`) — and that
  mixin *drops* `backdrop-filter` under `@media (prefers-reduced-transparency: reduce)` (`tokens.scss:71`). Without
  an explicit `isolation: isolate`, the spotlight would vanish behind the card for exactly those users. There is
  in-repo precedent for this fix at `strataflow.scss:233` (`.o_sf_map`).
- **OWL rewrites the tile's `style` attribute on patch.** `--hue` comes from `t-attf-style` at `home.xml:18`; a
  re-render sets the whole `style` attribute and drops the `--mx`/`--my` the mousemove handler wrote. Harmless
  (the next mousemove restores them, and the fallback `50% 50%` is a centred glow), but do not build anything
  that assumes those custom properties survive a render.
- **Quote grep globs in zsh.** `--include=*.scss` unquoted expands and the flag silently disappears; write
  `--include='*.scss'`.
- **"Verified server-side" is not verified.** Six visual bugs have already shipped past HTTP-level checks on this
  project and were caught in the first minute of actually looking at the screen. Hover states in particular cannot
  be verified any other way.
- **Do not silently reverse the recorded decision** at `strataflow.scss:216-218` / `DEVLOG.md:531-537`. If
  decision 1 lands on re-adding a card transform, update that comment and add a DEVLOG entry saying who
  overturned it and why.

## Acceptance criteria

- [ ] The Home `<h1>` shows one of at least three distinct phrases per time bucket, name appended, still going
      through `_t`.
- [ ] The phrase does **not** change when the skeleton is replaced by the loaded content (the OWL render at
      `home.js:39-47`), and does **not** change across repeated reloads within the same hour.
- [ ] The phrase does change when the day changes, and when the hour crosses a bucket boundary.
- [ ] The bucket is computed from `res.users.tz`, not the browser clock: changing the logged-in user's timezone
      in Settings changes the greeting without touching the machine clock.
- [ ] A user with no timezone set still gets a correct greeting (browser-zone fallback), never a permanent
      "Good evening".
- [ ] Hovering an app tile produces a visibly different treatment from today's static wash, and the tile's
      bounding box, the eight tiles' positions and the pointer target are all **pixel-identical** to the resting
      state (verify by hovering the very edge of a tile — the cursor must not "fall off" it).
- [ ] Keyboard `Tab` to a tile shows the focus ring, and the ring is still visible when that tile is also hovered.
- [ ] With Reduce Motion on (macOS System Settings → Accessibility → Display → Reduce motion), no tracking, no
      fade and no icon scale occur; a static hover state remains.
- [ ] The stylesheet bundle compiles: no red banner on the page, no `Incompatible units` in the server log.
- [ ] `apple-design` review passed both before implementing and on the finished screen (CLAUDE.md non-negotiable).
- [ ] `git diff --stat` touches only the three files in the Files table.

## Verification

1. Run the `apple-design` skill against the current Home screen **before** writing code, and again on the
   finished result. This is a CLAUDE.md non-negotiable and it is the review that produced the standing
   no-translate decision in the first place.

2. Restart with an update so the JS/XML/SCSS bundles rebuild (a plain reload can serve a stale JS bundle):

   ```
   cd /Users/stefan/strataflow
   .venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
       -u strataflow_workorder --dev=xml --http-port=8069 --log-level=warn
   ```
   Watch the startup output for `Incompatible units` or any Sass error. Silence is the pass condition; a Sass
   failure will otherwise show only as a small red banner in the browser while the old CSS keeps rendering.

3. Before restarting, sanity-grep the diff for the bundle-killer:

   ```
   grep -n 'min(\|max(' /Users/stefan/strataflow/addons/strataflow_workorder/static/src/strataflow.scss
   ```
   Any hit with mixed `px`/`%` units must go.

4. Confirm the rule actually shipped in the compiled CSS. Compiled Odoo CSS is not whitespace-minified, so use a
   regex, not a substring. In the browser tab's console on `/odoo/desk`:

   ```js
   [...document.styleSheets].map(s => s.href).filter(h => h && h.includes("assets_backend"))
   ```
   then `curl -s "<that URL>" | grep -Eo 'o_sf_app::?before[^}]{0,200}'`.

5. **Look at it in the browser automation tab.** Open `http://localhost:8069/odoo/desk` (login `admin`/`admin`;
   the agent does not type passwords — hand the tab a curl session cookie, see `DEVLOG.md` 2026-09-08).
   - Watch the load: the greeting must not change when the skeleton gives way to the tiles.
   - Reload five times: same phrase every time.
   - Hover each of the eight tiles. Check the effect follows the cursor (Option B), that the tile's edges do not
     move, and that hovering right at a tile's border does not cause a hover flicker.
   - `Tab` into the grid and confirm the focus ring; then hover the focused tile and confirm the ring survives.
   - Toggle the shell's dark theme and re-check the hover in both themes (Odoo CE has no dark mode of its own —
     `ir.http.color_scheme()` is hard-coded to `light` and `stock/stock.scss:17` forces `tokens-light` on
     `.o_web_client`; the shell's own toggle is what matters here).

6. Exercise the greeting without waiting for the clock, in the same console:

   ```js
   const m = odoo.loader.modules.get("@strataflow_workorder/screens/home");
   [0, 8, 13, 20].map(h => String(m.greetingFor(luxon.DateTime.local().set({ hour: h }))));
   // → morning, morning, afternoon, evening — hour 0 falls in the `h < 12` morning bucket
   [0, 1, 2, 3].map(d => String(m.greetingFor(luxon.DateTime.local().set({ hour: 9 }).plus({ days: d }))));
   // → the morning phrase rotates day to day
   ```

7. Verify the timezone path is live, not just written: in Settings → Users → Administrator, set Timezone to
   `Pacific/Auckland`, reload `/odoo/desk`, and confirm the greeting moves to a different bucket than the machine
   clock's. Then clear the timezone entirely and confirm the greeting is still sensible (browser-zone fallback,
   not a stuck "Good evening"). Restore the original timezone afterwards.

8. Enable macOS Reduce Motion and reload: hovering a tile must produce a static state with no tracking, no fade
   and no icon scale.
