# 08 — CRM board: fix the chrome and make cards draggable between stages

The pipeline screen at `/odoo/pipeline` is a read-only board: every card is a `<button>` that opens the stock
`crm.lead` form, and there is no drag code anywhere in the module. This task adds stage-to-stage drag with the
same stock hook Odoo's own kanban uses (`useSortable`), and rebuilds the board chrome, which currently stacks a
glass card inside a glass column and reads muddy. The two halves are not independent: the column is a
`.o_sf_panel`, and `.o_sf_panel` carries `backdrop-filter`, which makes it a containing block for the
`position: fixed` element the drag hook creates. **The chrome fix is a prerequisite for the drag working at all.**
Everything is confined to `screens/crm.js`, `screens/crm.xml`, `src/strataflow.scss` and three new tokens in
`scss/tokens.scss`. No Python, no manifest edit.

## The ask

> 12. Fix the ugly shit around the CRM boxes. Also make it so it has the same draggable functionality as the actual CRM app

## What is true today

### The screen

- The whole screen is `addons/strataflow_workorder/static/src/screens/crm.js` (73 lines) and
  `screens/crm.xml` (44 lines). It is registered as a client action at `crm.js:73`,
  `registry.category("actions").add("strataflow_crm", CrmScreen)`, with `static path = "pipeline"` at `crm.js:15`.
- Data loads once, on mount, `crm.js:24-32`: `crm.lead.get_pipeline` and `strataflow.workorder.get_board_data`
  in parallel; the payload is dropped into `this.state.pipeline` (`crm.js:29`) and `this.state.me` (`crm.js:30`).
  `this.state` is `useState(...)` at `crm.js:23`, so nested mutations are reactive.
- `get_pipeline` is ours, at `addons/strataflow_workorder/models/crm_lead.py:22-43`. It returns
  `{stages: [{id, name, is_won}], leads: [{id, company, summary, stage_id, amount, recurring, plan, currency,
  tags, owner, age_days, tickets}]}`. Stages come from `self.env['crm.stage'].search([])` (`crm_lead.py:26`) —
  **all** stages, unfiltered by sales team. Leads come from `self.search([('type','=','opportunity')])`
  (`crm_lead.py:27`), so they arrive in `crm.lead._order`, which is `"priority desc, id desc"`
  (`addons/crm/models/crm_lead.py:87`).
- `get columns` (`crm.js:39-55`) derives the board from `state.pipeline` on every render: filter leads by
  `stage_id` and the search query (`crm.js:44`), decorate each into a card (`crm.js:45-51`), sum a total
  (`crm.js:52`), attach a dot colour (`crm.js:53`). Because it is a getter over reactive state, **any mutation
  of `state.pipeline.leads[n].stage_id` re-renders the board and recomputes counts and totals for free.**
- `open(lead)` (`crm.js:57-59`) is the only interaction: `doAction` into the stock `crm.lead` form,
  `target: "current"`. It is wired at `crm.xml:21` as `t-on-click` on a `<button type="button" class="o_sf_lead">`.

### Drag: there is none

- Grepping the module for `sortable`, `draggable`, `dragstart`, `pointerdown` returns nothing. Zero drag support.
- The card is a `<button>` (`crm.xml:21`). Two things follow. First, the drag hook's placeholder is
  `current.element.cloneNode(false)` (`addons/web/static/src/core/utils/sortable.js:324`) — a shallow clone —
  so a `<button>` card produces a stray empty focusable `<button>` in the DOM for the length of every drag.
  Second, a `<button>` gets the module's zero-specificity reset at `strataflow.scss:44`
  (`:where(button) { … cursor: pointer; text-align: inherit; }`); anything else has to state those itself.

### The stock seam exists and Odoo's own kanban uses it

- `useSortable` is exported from `addons/web/static/src/core/utils/sortable_owl.js:13`. It wraps
  `nativeUseSortable` from `sortable.js` with the OWL lifecycle hooks (`useExternalListener`, `useEffect`,
  `onWillUnmount`, `useThrottleForAnimation`, `reactive`).
- Both files reach the backend bundle through `web._assets_core`, which globs `web/static/src/core/**/*`
  (`addons/web/__manifest__.py:373`), and `web.assets_backend` includes `web._assets_core`
  (`addons/web/__manifest__.py:58`). `draggable_hook_builder.scss` — which defines
  `.o_dragged { z-index: 1000; pointer-events: none }` — comes in the same way. Nothing to add to our manifest.
- The kanban renderer's own call is `addons/web/static/src/views/kanban/kanban_renderer.js:100-126`:
  `enable`, `ref`, `elements: ".o_draggable"`, `ignore`, `groups`, `connectGroups`, `cursor: "move"`,
  `placeholderClasses: ["visible", "opacity-50", "my-2"]`, and the handlers `onDragStart`, `onDragEnd`,
  `onGroupEnter`, `onGroupLeave`, `onDrop`. Those are the real option names in this tree; the full typed list is
  the `SortableParams` typedef at `sortable.js:10-60` plus `DEFAULT_ACCEPTED_PARAMS` at
  `draggable_hook_builder.js:88-102`.
- Defaults that matter (`draggable_hook_builder.js:103-115`): `delay: 0`, `touchDelay: 300`, `tolerance: 10`,
  `edgeScrolling: {speed: 10, threshold: 30}`. Sortable's own defaults (`sortable.js:87-95`):
  `connectGroups: false`, `clone: true`, `applyChangeOnDrop: false`, `edgeScrolling: {speed: 20, threshold: 60}`.
- `followCursor` is **not** an accepted parameter (it is missing from both accepted-param lists; it is hard-set
  `true` at `draggable_hook_builder.js:981`). You cannot opt out of the `position: fixed !important` treatment.

### The blocker nobody has hit yet: `backdrop-filter` on the column

- On drag start the hook writes `position: fixed !important`, plus a pinned width/height, onto the card
  (`draggable_hook_builder.js:528-539`), then sets `left`/`top` from **viewport** coordinates on every pointer
  move (`updateElementPosition`, `draggable_hook_builder.js:834-844`; `ctx.pointer` is `ev.clientX/clientY`,
  `draggable_hook_builder.js:851-853`).
- The card's ancestors today are `.o_sf_cards` → `section.o_sf_panel.o_sf_column` → `.o_sf_board` → `.o_sf`.
- `.o_sf_panel` is `@include glass(var(--glass-72))` at `strataflow.scss:114`, and the `glass` mixin sets
  `backdrop-filter: blur(40px) saturate(180%)` (`static/scss/tokens.scss:65-72`). A non-`none` `backdrop-filter`
  makes the element a containing block for `position: fixed` descendants. So the dragged card would be
  positioned relative to its own column instead of the viewport — it would sit metres away from the cursor — and
  `.o_sf_panel`'s `overflow: hidden` (same line) would then clip it, so it would vanish the moment it left the
  column. **This is why the chrome work is a hard prerequisite, not a nice-to-have.**
- `.o_sf_board` (`strataflow.scss:298`) and `.o_sf` (`strataflow.scss:37-54`) have no `transform`, `filter`,
  `backdrop-filter`, `perspective`, `contain` or `will-change`, so neither is a containing block.
  `.o_sf`'s `overflow: hidden` does not clip a fixed descendant, because `.o_sf` is not that descendant's
  containing block. `.o_sf > :not(…) { animation: o_sf_enter .16s }` (`strataflow.scss:24-27`) animates only
  `opacity` and creates no containing block either.

### Click vs drag is already solved by the stock hook

- `tolerance: 10` (`draggable_hook_builder.js:113`) means a press that moves less than 10px never starts a drag,
  so an ordinary click is untouched.
- Once a drag has started, `.o_dragged { pointer-events: none }` (`draggable_hook_builder.scss:17-20`) makes the
  card transparent to hit-testing, so the `pointerup` target is never the card; the browser therefore fires
  `click` on a common ancestor, not on the card, and the card's own `t-on-click` does not run.
- Belt and braces on top of that: `dragEnd` sets `preventClick = true` (`draggable_hook_builder.js:580`), and a
  `click` listener bound on `ref.el` (`draggable_hook_builder.js:1063`) calls `safePrevent(ev, {stop: true})`
  (`draggable_hook_builder.js:656-660`). Note it is a **bubble-phase** listener on the ref, so it stops
  propagation *after* any descendant handler — it is a backstop, not the primary mechanism.
- Stock's kanban card has no drag guard of its own: `onGlobalClick` (`kanban_record.js:279-311`) opens the record
  with no reference to the drag state — its only early returns are for cancel-click targets, an active
  multi-selection and alt-click. Same-behaviour parity is fine.

### `pointer-events` during a drag is handled for you

`dragStart` puts `pe-none` on `<body>` (`draggable_hook_builder.js:542`), and `pointer-events` inherits — but the
hook's own `addListener` helper restores it: every element it binds a pointer listener to also gets an inline
`pointer-events: auto` (`draggable_hook_builder.js:226-229`, comment: *"Restore pointer events on elements
listening on mouse/pointer/touch events"*). Do not add `pointer-events` rules of your own to `.o_sf_lead`,
`.o_sf_cards` or `.o_sf_board`; you will fight this.

### Intra-column reordering is not persistable, in stock or here

- `crm.lead` has no `sequence` field (grep of `addons/crm/models/crm_lead.py` finds `sequence` only on
  `crm.stage` reads). `DynamicList.canResequence()` is `!!this.handleField` (`dynamic_list.js:87-88`), and
  `handleField` falls back to `"sequence"` only when that field exists (`dynamic_list.js:25-29`).
  `_resequence` therefore returns immediately for `crm.lead` (`dynamic_list.js:437-440`).
- So **in the real CRM app, dragging a card up or down inside its own column already does nothing and the card
  snaps back.** "The same draggable functionality as the actual CRM app" means cross-column moves only. Do not
  build persisted manual ordering.

### The write the stock kanban performs

`KanbanRenderer.sortRecordDrop` (`kanban_renderer.js:594-620`) calls `list.moveRecord(...)`, which for a
cross-group move does `record.update({[groupByField]: value}, {save: true})` — i.e. a plain write of `stage_id`
— with an explicit `revert()` closure that restores the record to its old group on failure
(`dynamic_group_list.js:118-152`). Server side, `crm.lead.write` (`addons/crm/models/crm_lead.py:829-891`)
already does the right things on a stage change: it stamps `date_last_stage_update` (`:838-840`), and for a
stage with `is_won` it forces `active: True, probability: 100, automated_probability: 100` (`:841-845`), which is
what keeps the `_check_won_validity` constraint (`crm_lead.py:262-266`) satisfied. `_track_duration_field =
'stage_id'` (`crm_lead.py:98`) means the move is tracked in the chatter. **A bare
`orm.write("crm.lead", [id], {stage_id})` is the complete and correct write path.** None of the fields the board
displays change as a result, so no refetch is needed.

### The chrome, item by item

- `.o_sf_board` — `strataflow.scss:298`: `position: absolute; top: 80px; left/right: 16px; bottom: 58px;
  z-index: 10; display: flex; gap: 12px; overflow-x: auto`.
- `.o_sf_column` — `strataflow.scss:299`: only `flex: 1 1 0; min-width: 250px`. Everything else (the glass,
  `display: flex`, `flex-direction: column`, `border-radius: 22px`, `overflow: hidden`, `min-height: 0`) comes
  from `.o_sf_panel` at `strataflow.scss:114`, applied in the markup at `crm.xml:11`.
- `.o_sf_column_head` — `strataflow.scss:300`: `padding: 15px 16px 11px` and
  `border-bottom: 0.5px solid var(--hairline-soft)`. That hairline sits ~44px below `.o_sf_panel`'s own
  `0.5px solid var(--edge)` border (15px padding + a ~18px text row + 11px padding), so the top of every column
  carries two near-identical hairlines a head's height apart. 0.5px borders also round to 1px or disappear
  entirely at 1× device pixel ratio.
- `.o_sf_column_name` — `strataflow.scss:301`: `flex: 1; font-size: 13px; font-weight: 800`. No `min-width: 0`
  and no ellipsis, so a long stage name pushes the count and the total out of the head.
- Count and total — `crm.xml:15-16` render `<span class="o_sf_mono o_sf_note">` (11px, `--muted`,
  `strataflow.scss:58`) immediately followed by `<span class="o_sf_mono o_sf_column_total">` (10.5px, weight 600,
  `--muted`, `strataflow.scss:302`), 8px apart. Two grey monospace numbers of near-identical size sitting side by
  side: nothing tells the reader which is a count and which is money. 10.5px is ≈7.9pt, below the 10pt desktop
  minimum in *Design Guideline — Accessibility > Vision*, for the one number on the column people actually scan.
- `.o_sf_cards` — `strataflow.scss:303`: `padding: 10px`, `gap: 8px`. The head pads to 16px on the left, the
  cards to 10px, so the card edges do not line up with the stage name above them.
- `.o_sf_lead` — `strataflow.scss:304`: `@include glass(var(--glass-80))`. So each card is a **second**
  `backdrop-filter: blur(40px) saturate(180%)` surface, with its own `0.5px solid var(--edge)` border and the
  full three-layer `var(--shadow)`, sitting on top of the column's glass. That is the ugliness: two identical
  materials stacked with nothing between them read as haze, not as depth — *Design Guideline — Materials*:
  "Use materials to create visual separation and hierarchy between UI layers." It is also one backdrop-filtered
  layer per card — dozens on a normal board, on top of one per column — which is the most expensive thing on
  the screen.
- Card hover — `strataflow.scss:304`: `transform: translateY(-2px)` plus `var(--shadow-hi)`, over `.15s`.
  Every card lifts on pointer-over on a board you scan by sweeping the pointer across it —
  *Design Guideline — Motion*: "In apps, generally avoid adding motion to UI interactions that occur frequently."
- Empty state — `crm.xml:19` `<p class="o_sf_empty">Nothing here.</p>`, styled at `strataflow.scss:59` as
  `padding: 18px; font-size: 12.5px; color: var(--muted)`. A short grey sentence pinned to the top-left of an
  otherwise blank 700px-tall column. Once columns are drop targets it also has to read as one —
  *Design Guideline — Drag and drop > Providing feedback*: "Show people whether a destination can accept dragged
  content."
- Reduced motion — `strataflow.scss:380-388`, specifically `:382` `.o_sf_app, .o_sf_lead { transition: none; }`.
  That kills the card transition but nothing about the drag, which is correct: direct manipulation is not
  decorative motion.
- Dark mode: `.o_sf[data-theme="dark"]` swaps the token block (`strataflow.scss:9`, tokens at `scss/tokens.scss:49-63`). `--glass-80` is `rgba(255,255,255,.80)` in light but `rgba(23,29,35,.78)` in dark,
  and `--glass-72` is `rgba(23,29,35,.72)` — i.e. in dark the card is *darker* than the panel behind it, so the
  cards recede instead of standing forward. Any replacement must be a token pair, not a literal.

### Two things the board gets wrong that are worth fixing while you are in here

1. **The column total is not a stage total.** `crm.js:52` sums `cards`, which is the *search-filtered* list, so
   typing in the search box silently changes every column's headline figure. It also adds
   `l.recurring || l.amount` — `recurring_revenue` is a figure over the lead's recurring plan period
   (`crm.recurring.plan.number_of_months`, `addons/crm/models/crm_recurring_plan.py`) while `expected_revenue`
   is a one-off, so the sum mixes two units. (The per-card badge at `crm.js:47` compounds this by hard-labelling
   any recurring figure `/yr` regardless of the plan.) And the currency symbol is taken from
   `cards[0]?.currency` (`crm.js:53`), so a column whose first card happens to be in EUR labels the whole
   column €.
2. **The stage dot colour is derived from column index, not from the stage.** `crm.js:53` does
   `STAGE_DOT[i % STAGE_DOT.length]` over `["new","onsite","assigned","located"]` (`crm.js:9`). Add a stage in
   the CRM app and every dot to its right changes colour; green ("located", `--ok`, `strataflow.scss:135`) lands
   on whichever column happens to be fourth rather than on the won stage. `get_pipeline` already returns
   `is_won` per stage (`models/crm_lead.py:30`), which is the honest input.

## Decision needed

1. **Should the column total keep counting only the filtered cards, or always the whole stage?**
   Options: (a) keep as is; (b) always total the full stage and dim the number while a search is active;
   (c) show `filtered / stage` when a search is active. **Recommendation: (b)** — the total is a pipeline fact,
   not a search result, and (c) puts a third number in a head that already has too many.
2. **Should the total keep mixing one-off `expected_revenue` and per-plan-period `recurring_revenue`?**
   Options: (a) keep the mixed sum; (b) total `expected_revenue` only and leave recurring to the per-card
   badge. **Recommendation: (b)**; it is one line (`crm.js:52`) and it stops the header lying.
3. **Should the board only offer stages the lead's sales team can use?** `get_pipeline` returns every
   `crm.stage` (`models/crm_lead.py:26`), including team-scoped ones (`crm.stage.team_ids`,
   `addons/crm/models/crm_stage.py:31`), so a drop can move a lead into a stage the stock kanban would never
   have shown it. Options: (a) leave it — the board is a company-wide view and Strataflow is single-team today;
   (b) filter stages by the lead's team, which means changing the payload shape and the column set per lead.
   **Recommendation: (a)**, and revisit if multi-team ever lands.
4. **Anything for keyboard users beyond "open the card and change the stage there"?** WCAG 2.2 SC 2.5.7 and
   *Design Guideline — Drag and drop > Best practices* ("Offer alternative ways to accomplish drag-and-drop
   actions") are satisfied by click/Enter → the stock form, which is exactly what the real CRM kanban offers.
   Options: (a) rely on the form; (b) add a stage `<select>` to each card. **Recommendation: (a)** — (b) puts a
   focusable control inside a drag source and buys nothing the form does not already give.

## Plan

1. **`static/scss/tokens.scss`** — add three variables to `@mixin tokens-light` (after the `--glass*` line, `:35`) and the matching three to `@mixin tokens-dark` (after its `--glass*` line, `:51`), so the card surface is a token pair and
   not a literal:
   - light: `--card: rgba(255,255,255,.86); --card-hi: #fff; --card-edge: rgba(28,33,36,.10);`
   - dark: `--card: rgba(255,255,255,.055); --card-hi: rgba(255,255,255,.09); --card-edge: rgba(255,255,255,.13);`
   In dark the card is a *lighter* overlay on the dark panel, which is the opposite of what `--glass-80` does
   today. Mixins emit no CSS, so this costs three declarations per bundle. Do not touch the `glass` mixin.

2. **`static/src/strataflow.scss:299` — take the column off `.o_sf_panel` and move its glass to a pseudo-element.**
   This is the change that makes the drag possible. Replace line 299 with:
   ```scss
   .o_sf_column { position: relative; flex: 1 1 0; min-width: 250px; display: flex; flex-direction: column;
     min-height: 0; border-radius: 22px;
     &::before { content: ""; position: absolute; inset: 0; z-index: -1; box-sizing: border-box;
                 border-radius: inherit; @include glass(var(--glass-72)); } }
   ```
   The pseudo-element is not an ancestor of the cards, so its `backdrop-filter` cannot become their containing
   block. `z-index: -1` paints it behind the column's content and stays inside `.o_sf_board`'s stacking context
   (`.o_sf_board` is `position: absolute; z-index: 10`, `strataflow.scss:298`), and `.o_sf_column` itself must
   *not* get a `z-index` or it becomes a stacking context and swallows the pseudo. `box-sizing` must be stated
   explicitly: `.o_sf { * { box-sizing: border-box } }` (`strataflow.scss:42`) does not match pseudo-elements.
   Do **not** carry `overflow: hidden` over from `.o_sf_panel` — it would clip the pseudo-element's drop shadow.

3. **`static/src/screens/crm.xml:11`** — drop `o_sf_panel` from the section, keep `o_sf_column`, and add a
   stable stage id for the drop handler:
   `<section class="o_sf_column" t-att-data-stage-id="col.id" t-att-aria-label="col.name">`.

4. **`static/src/strataflow.scss:300-303` — rebuild the head and the card well.**
   ```scss
   .o_sf_column_head { display: flex; align-items: center; gap: 8px; padding: 14px 14px 8px; flex: none; }
   .o_sf_column_name { flex: 0 1 auto; min-width: 0; font-size: 13px; font-weight: 700; letter-spacing: -.01em;
                       overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
   .o_sf_column_count { flex: none; min-width: 20px; height: 18px; padding: 0 6px; border-radius: 9px;
                        display: grid; place-items: center; background: var(--chip-bg); color: var(--text-2);
                        font-size: 10.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
   .o_sf_column_total { flex: none; font-size: 12px; font-weight: 600; color: var(--text-2);
                        font-variant-numeric: tabular-nums; }
   .o_sf_cards { flex: 1; overflow-y: auto; min-height: 0; padding: 2px 14px 14px; display: flex;
                 flex-direction: column; gap: 8px; border-radius: 0 0 22px 22px; }
   ```
   The head border-bottom is gone (the panel edge and the whitespace already separate head from cards —
   *Design Guideline — Layout > Best practices*: "use negative space, background shapes, colors, materials, or
   separator lines"; two hairlines a head's height apart is not separation). Head and cards now share a 14px left edge, so
   the card edge lines up under the stage name — *Design Guideline — Layout > Visual hierarchy*: "Align
   components with one another." The count becomes a chip and the total a slightly larger, higher-contrast
   figure, so the two numbers stop reading as one pair. `.o_sf_cards`'s own `border-radius` clips scrolled cards
   to the column's bottom corners, which is what `.o_sf_panel { overflow: hidden }` used to do; `overflow` is not
   in the list of properties that create a containing block, so this is safe for the dragged card.

5. **`static/src/screens/crm.xml:12-17`** — reorder the head so the two numbers separate, and stop deriving the
   dot from the column index:
   ```xml
   <div class="o_sf_column_head">
       <span class="o_sf_dot" t-attf-class="o_sf_dot--{{ col.dot }}" aria-hidden="true"/>
       <span class="o_sf_column_name" t-esc="col.name"/>
       <span class="o_sf_column_count" t-esc="col.cards.length"/>
       <span class="o_sf_spacer"/>
       <span class="o_sf_mono o_sf_column_total" t-esc="col.total"/>
   </div>
   ```
   In `crm.js`, delete `STAGE_DOT` (`crm.js:9`) and replace `dot: STAGE_DOT[i % STAGE_DOT.length]` (`crm.js:53`)
   with a stage-derived value: `s.is_won ? "located" : i === 0 ? "new" : "assigned"`. `is_won` is already in the
   payload (`models/crm_lead.py:30`). The dot modifiers used here all exist at `strataflow.scss:134-136`.
   The column total on the same line (`crm.js:52-53`) changes here too, once Decisions 1 and 2 are answered:
   that is the only edit those two decisions imply.

6. **`static/src/strataflow.scss:304` — one material per layer.** Replace the card rule:
   ```scss
   .o_sf_lead { display: block; width: 100%; padding: 12px 13px; border-radius: 15px; text-align: left;
     cursor: pointer; background: var(--card); border: 1px solid var(--card-edge);
     transition: background-color .15s ease, border-color .15s ease;
     &:hover { background: var(--card-hi); border-color: var(--edge); } }
   ```
   No `backdrop-filter`, no `box-shadow`, no `translateY`. `cursor` and `text-align` are now stated explicitly
   because the element stops being a `<button>` in step 7 and so loses the `:where(button)` reset at
   `strataflow.scss:44`. The transition list must never contain `all`, `transform`, `left` or `top`: the hook
   writes `left`/`top` inline on every pointer move (`draggable_hook_builder.js:840-843`) and a transition on
   them makes the dragged card lag the cursor. `1px` rather than `0.5px` because a hairline that renders at 1×
   and vanishes at some scale factors is the wrong tool for the *only* thing now separating card from panel.

7. **`static/src/screens/crm.xml:21` — make the card a drag source that is still a keyboard control.**
   ```xml
   <article class="o_sf_lead" role="button" tabindex="0" t-att-data-lead-id="card.id"
            t-on-click="() => this.open(card)"
            t-on-keydown="(ev) => this.onCardKeydown(ev, card)">
   ```
   `<article>` mirrors the stock kanban card (`addons/web/static/src/views/kanban/kanban_record.xml:5-9`, an
   `<article role="link" t-att-data-id t-att-tabindex>`) and, unlike a `<button>`, produces a placeholder with
   no native activation behaviour when the hook shallow-clones it (`sortable.js:324`) — the clone does still
   carry the copied `role`/`tabindex`, see Landmines. The focus ring still applies: `strataflow.scss:46` is
   `:where(button, input, a, [tabindex]):focus-visible { box-shadow: var(--focus) }`. Add to `crm.js`:
   ```js
   onCardKeydown(ev, lead) {
       if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); this.open(lead); }
   }
   ```
   Click and drag are disambiguated entirely by the stock hook — see *"Click vs drag is already solved"* above;
   add no guard of your own. If the browser check in Verification shows a drop opening the form, the minimal fix
   is a `this.justDragged` flag set in `onDragEnd` and cleared on the next macrotask, checked at the top of
   `open()`; do not reach for it pre-emptively.

8. **`static/src/screens/crm.js` — wire `useSortable`.** Imports: add `useRef` to the `@odoo/owl` import
   (`crm.js:1`) and `import { useSortable } from "@web/core/utils/sortable_owl";`. In `setup()`, after the
   `useState` at `crm.js:23`:
   ```js
   this.notification = useService("notification");
   this.boardRef = useRef("board");
   let dragLeadId = null;
   useSortable({
       ref: this.boardRef,
       elements: ".o_sf_lead",
       groups: ".o_sf_cards",
       connectGroups: true,
       cursor: "move",
       enable: () => !this.state.loading && !this.env.isSmall,
       placeholderClasses: ["o_sf_lead_ph"],
       onDragStart: ({ element }) => { dragLeadId = Number(element.dataset.leadId); },
       onGroupEnter: ({ group }) => group.classList.add("is-drop"),
       onGroupLeave: ({ group }) => group.classList.remove("is-drop"),
       onDragEnd: () => {
           for (const el of this.boardRef.el.querySelectorAll(".is-drop")) el.classList.remove("is-drop");
       },
       onDrop: ({ parent }) => this.moveLead(dragLeadId, Number(parent?.closest(".o_sf_column")?.dataset.stageId)),
   });
   ```
   Every option name here is from this tree — `SortableParams` at `sortable.js:10-60` and
   `DEFAULT_ACCEPTED_PARAMS` at `draggable_hook_builder.js:88-102`. Notes on the choices:
   - `groups` must be `.o_sf_cards`, **not** `.o_sf_column`. When the pointer enters a group the hook does
     `group.appendChild(current.placeHolder)` (`sortable.js:231`); with `.o_sf_column` the placeholder would
     land after `.o_sf_cards`, outside the card list. In stock the group element *is* the direct parent of the
     records (`kanban_renderer.xml:13` and `:40-57`), and `.o_sf_cards` is our equivalent.
   - `connectGroups: true` is what binds the group `pointerenter`/`pointerleave` listeners at all
     (`sortable.js:258-263`) and what stops `current.container` being narrowed to the source group
     (`sortable.js:316-320`), so the card can be dragged across the whole board.
   - `ref` is `.o_sf_board`, which becomes `ctx.current.container` (`draggable_hook_builder.js:920`); the dragged
     card is clamped to its rect (`:840-843`) and the board's horizontal `overflow-x: auto`
     (`strataflow.scss:298`) becomes the edge-scroll surface — *Design Guideline — Drag and drop > Accepting
     drops*: "Scroll the contents of a destination when necessary." Vertical auto-scroll inside a tall column
     does not happen, because `getScrollParents` is computed from the container, not from the pointer; stock has
     the same limitation.
   - Read the dragged lead's id from `onDragStart`'s `element`, never by querying the DOM at drop time: with
     `clone: true` (the default, `sortable.js:91`) the placeholder is a shallow clone that carries the same
     `data-lead-id`, so `querySelector` would be ambiguous. This is exactly what stock does at
     `kanban_renderer.js:111-114`.
   - Leave `clone`, `applyChangeOnDrop`, `delay`, `tolerance` and `touchDelay` at their defaults. In particular
     `applyChangeOnDrop` stays `false` so the hook does not touch the DOM on drop — OWL re-renders from state
     instead, and the two never fight.

9. **`static/src/screens/crm.xml:9`** — `<div class="o_sf_board" t-ref="board">`.

10. **`static/src/screens/crm.js` — the optimistic write.** Add:
    ```js
    async moveLead(leadId, stageId) {
        const lead = this.state.pipeline.leads.find((l) => l.id === leadId);
        if (!lead || !stageId || lead.stage_id === stageId) return;   // same column: nothing to persist
        const prev = lead.stage_id;
        lead.stage_id = stageId;                                       // reactive; board repaints immediately
        try {
            await this.orm.write("crm.lead", [leadId], { stage_id: stageId });
        } catch (e) {
            lead.stage_id = prev;
            this.notification.add(_t("Could not move that deal. It is back where it was."), { type: "danger" });
            throw e;
        }
    }
    ```
    Optimistic with rollback, mirroring stock's `revert()` closure (`dynamic_group_list.js:138-152`) — the board
    must not stall on a round trip during direct manipulation, and *Design Guideline — Feedback*: "Show people
    when a command can't be carried out." Because `columns` (`crm.js:39-55`) is a getter over reactive state,
    the card, both column counts and both column totals update from that one assignment; nothing else to touch,
    and no refetch — `orm.write` on `stage_id` changes no field the board renders
    (`addons/crm/models/crm_lead.py:829-891`). The same-stage early return is what makes an intra-column drop a
    silent no-op, matching the real CRM app (see *"Intra-column reordering"* above).
    `_t` is already imported at `crm.js:3`; `useService` at `crm.js:4`.

11. **`static/src/strataflow.scss` — drag and drop-target styling**, added next to the board rules
    (after the new `.o_sf_lead` block):
    ```scss
    .o_sf_cards.is-drop { background: var(--accent-soft); }
    .o_sf .o_sf_lead_ph { visibility: visible !important; background: var(--accent-soft);
                          border: 1px dashed var(--accent); }
    .o_sf .o_dragged { box-shadow: var(--shadow-hi); border-color: var(--accent); }
    ```
    The `!important` on `visibility` is mandatory and not optional style: with `clone: true` the hook writes
    `visibility: hidden` inline on the placeholder (`sortable.js:248-255`). Stock solves the same problem by
    putting Bootstrap's `.visible` in `placeholderClasses` (`kanban_renderer.js:109`). `.o_sf .o_dragged` is two
    classes, enough to beat `.o_sf_lead`; no rotation — stock's `-3deg` (`kanban_controller.scss:173-175`) is an
    extra composited transform on a translucent card for no information gain, and
    *Design Guideline — Drag and drop > Providing feedback* asks only for a distinguishable drag image, which the
    shadow and accent border give. Highlighting only the hovered column and clearing it on leave is that same
    guideline's "Display highlighting or other visual cues only while the content is positioned above the
    destination."

12. **`static/src/strataflow.scss:59` and `crm.xml:19` — make the empty state a drop target.**
    ```scss
    .o_sf_empty--drop { flex: 1; min-height: 88px; display: grid; place-items: center; margin: 2px 0 0;
                        padding: 12px; text-align: center; border: 1px dashed var(--hairline-soft);
                        border-radius: 15px; }
    ```
    and `<p t-if="!col.cards.length" class="o_sf_empty o_sf_empty--drop">Drop a deal here</p>`. Leave
    `.o_sf_empty` at `:59` alone — it is used by other screens.

13. **`static/src/strataflow.scss:382`** — leave `.o_sf_app, .o_sf_lead { transition: none; }` exactly as it is.
    It now suppresses a colour transition instead of a translate, which is still correct, and it must not be
    extended to `.o_dragged`: dragging is direct manipulation, not decorative motion.

14. **Run the `apple-design` skill against the finished screen** (CLAUDE.md, "Non-negotiables": review UI work
    with it before *and* after). This brief is the "before" pass.

## Files

| path | what changes |
| --- | --- |
| `addons/strataflow_workorder/static/scss/tokens.scss` | three new variables (`--card`, `--card-hi`, `--card-edge`) in both `tokens-light` and `tokens-dark`; `glass` mixin untouched |
| `addons/strataflow_workorder/static/src/strataflow.scss` | `.o_sf_column` off `.o_sf_panel` and onto a `::before` glass backdrop; head/name/count/total/cards rules rebuilt; `.o_sf_lead` loses its glass, shadow and hover translate; new `.o_sf_column_count`, `.o_sf_cards.is-drop`, `.o_sf_lead_ph`, `.o_dragged`, `.o_sf_empty--drop` |
| `addons/strataflow_workorder/static/src/screens/crm.js` | `useRef` + `useSortable` + `notification`; `moveLead()`; `onCardKeydown()`; `STAGE_DOT` deleted and the dot derived from `is_won`; column total fixed per Decisions 1–2 |
| `addons/strataflow_workorder/static/src/screens/crm.xml` | `t-ref="board"`; section drops `o_sf_panel` and gains `data-stage-id`; head reordered with `.o_sf_column_count` + spacer; card `<button>` → `<article role="button" tabindex="0" data-lead-id>` with a keydown handler; empty state becomes a drop zone |

No new files. No Python. No `__manifest__.py` edit — `sortable_owl.js` and `draggable_hook_builder.scss` already
reach the backend bundle through `web._assets_core` (`addons/web/__manifest__.py:58`, `:373`).

## Landmines

- **`backdrop-filter` is a containing block for `position: fixed`.** This is the whole reason step 2 exists. If
  you leave `.o_sf_panel` on the column (`crm.xml:11` + `strataflow.scss:114`), the dragged card will be offset
  by the column's origin and then clipped out of existence by the panel's `overflow: hidden`. The same trap
  applies to any `transform`, `filter`, `perspective`, `contain` or `will-change` you add to `.o_sf_board`,
  `.o_sf_column`, `.o_sf_cards` or `.o_sf` while doing the chrome work. Check the whole ancestor chain, not just
  the rule you edited.
- **Sass eats CSS `min()`/`max()` with mixed units.** `min(52%, 460px)` threw *"Incompatible units: px and %"*
  and took down the entire stylesheet bundle, after which Odoo served the **previous** CSS with only a small red
  banner — so it looks exactly like your change did nothing. None of the CSS in this brief needs `min()`/`max()`;
  if you reach for one while tuning column widths, grep the file for `min(`/`max(` with mixed units before
  reloading, and if the board looks unchanged after a hard reload, suspect a Sass error before suspecting your
  selector.
- **Odoo compiled CSS is not whitespace-minified.** If you verify a rule landed by curling the bundle, match
  with a regex, not an exact substring.
- **Odoo CE has no dark mode**; `ir.http.color_scheme()` is hard-coded to `"light"` and `stock.scss:17` forces
  `tokens-light` on `.o_web_client`. The shell's own dark toggle (`data-theme="dark"` on `.o_sf`,
  `strataflow.scss:9`) is the only dark path, so both new token blocks must be checked through that toggle on
  the board itself — the browser's OS dark setting will not exercise them.
- **Quote grep globs in zsh**: `--include=*.xml` unquoted expands and the flag silently vanishes.
- **"Verified server-side" is not verified.** Six visual bugs shipped past every HTTP check and were caught in
  the first minute of actually looking. Drag behaviour cannot be verified any other way at all: open the browser
  automation tab.
- **`-u strataflow_workorder` after every JS/XML/SCSS change.** A plain reload serves a stale bundle, and a
  stale JS bundle here means the drag hook is simply absent with no error.
- **New, discovered while reading:** `.o_sf { * { box-sizing: border-box } }` (`strataflow.scss:42`) does not
  reach pseudo-elements — the CSS universal selector matches elements only. The `.o_sf_column::before` in step 2
  must declare `box-sizing: border-box` itself or its `0.5px` border will push it 1px past the column on each
  side.
- **New:** with `clone: true` the sortable placeholder is a shallow clone of the dragged card
  (`sortable.js:324`) and therefore carries a duplicate `data-lead-id` and the card's `tabindex`/`role` for the
  duration of the drag. Never look the dragged record up by DOM query at drop time; capture it in `onDragStart`.
- **New:** the drag hook's `click` backstop is bound on `ref.el` in the **bubble** phase
  (`draggable_hook_builder.js:1063`), so it fires *after* a descendant's `t-on-click`. What actually protects
  `open()` is `.o_dragged { pointer-events: none }` retargeting the click away from the card, plus the 10px
  `tolerance`. Do not "help" by adding `pointer-events` rules of your own — the hook writes inline
  `pointer-events: auto` onto every element it binds (`draggable_hook_builder.js:226-229`) and yours will fight it.

## Acceptance criteria

- [ ] Dragging a card from one stage column to another moves it: the card is rendered in the target column
      immediately, and `crm.lead.stage_id` is persisted for that lead.
- [ ] The move is visible in the stock CRM kanban (`Open in CRM →`, `crm.xml:39`) after a reload, and appears in
      the lead's chatter as a stage change.
- [ ] The source and target column counts and totals both update on drop, with no refetch and no full reload.
- [ ] A failed write rolls the card back to its original column and raises a danger notification.
- [ ] Dragging a card within its own column changes nothing and persists nothing — same as the stock CRM kanban.
- [ ] While dragging, the card follows the cursor exactly (no offset), stays visible when it leaves its column,
      and can be dropped on an empty column.
- [ ] The column under the pointer is highlighted, and only that column; the highlight clears on leave and on
      drop, including when the drag is cancelled with Escape or the pointer is released outside the window.
- [ ] Clicking a card still opens the `crm.lead` form. Dragging a card never opens it.
- [ ] The card is reachable with Tab, shows the `var(--focus)` ring, and opens with Enter and with Space.
- [ ] No element between `.o_sf` and `.o_sf_lead` has `backdrop-filter`, `filter`, `transform`, `perspective`,
      `contain` or `will-change` in the computed style.
- [ ] There is exactly one `backdrop-filter` layer per column (the `::before`), and none on the cards.
- [ ] Cards read as sitting *on* the column in both light and dark: lighter than the panel in both themes.
- [ ] The column head has no bottom border; the stage name, the count chip and the total are three visually
      distinct things; the left edge of a card lines up with the left edge of the stage name.
- [ ] A long stage name ellipsises instead of pushing the count or the total out of the head.
- [ ] An empty column shows a dashed "Drop a deal here" zone that fills the column and accepts a drop.
- [ ] No card moves on hover.
- [ ] With `prefers-reduced-motion: reduce`, cards have no transition and dragging still works normally.
- [ ] The stage dot colour follows the stage (`is_won` → green), not the column's position.
- [ ] The column total no longer changes when a search filters the board (per Decision 1) and no longer mixes
      one-off and recurring revenue (per Decision 2).
- [ ] The SCSS bundle compiles: no Sass error banner, and the new selectors are present in the served CSS.

## Verification

```bash
# 1. rebuild the assets and start the server (from /Users/stefan/strataflow)
.venv/bin/python odoo-bin -d strataflow_dev --db_host=localhost --addons-path=addons \
  --dev=xml --http-port=8069 --log-level=warn -u strataflow_workorder

# 2. confirm the new rules are in the SCSS source. (These read the source, not the bundle —
#    whether it compiled is answered by the browser checks below. If you do curl the bundle,
#    note Odoo's compiled CSS is not whitespace-minified, so match with regexes, never substrings,
#    and remember the nested `&::before` compiles to `.o_sf_column::before` only in the output.)
grep -nE 'min\(|max\(' addons/strataflow_workorder/static/src/strataflow.scss \
  addons/strataflow_workorder/static/scss/tokens.scss          # expect: no mixed px/% hits
grep -nE 'o_sf_column|&::before|o_sf_lead_ph|o_sf_column_count|--card:' \
  addons/strataflow_workorder/static/src/strataflow.scss \
  addons/strataflow_workorder/static/scss/tokens.scss

# 3. confirm nothing accidentally kept the panel on the column
grep -n 'o_sf_panel' addons/strataflow_workorder/static/src/screens/crm.xml   # expect: no match
```

Then, in the browser automation tab (this is the only real verification — a stage move that "worked over RPC"
is not a working board):

1. Open `http://localhost:8069/odoo/pipeline`, logged in as `admin`. Do not type the password in the tab; hand
   the tab a JSON-RPC session cookie (DEVLOG 2026-09-08).
2. **Chrome, light.** Screenshot the whole board. Check: one glass surface per column and none on the cards;
   no line under the column head; card left edges aligned under the stage name; count chip and money total
   clearly different objects; nothing moves when you sweep the pointer across the cards.
3. **Chrome, dark.** Hit the theme toggle in the top bar (`shell.xml:60`) — not the OS setting, which Odoo CE
   ignores — and screenshot again. Cards must be *lighter* than the column, not darker.
4. **Containing-block check.** In the console:
   `let e = document.querySelector('.o_sf_lead'), o = []; while (e = e.parentElement) { const s = getComputedStyle(e); o.push([e.className, s.backdropFilter, s.filter, s.transform, s.contain, s.willChange]); } console.table(o)`
   Everything up to `.o_sf` must be `none`/`normal`/`auto`.
5. **Cross-column drag.** Press on a card in the first column, move it into the third, and watch: the card must
   track the cursor with no offset, remain visible over the gap between columns, and the third column must
   highlight while the pointer is over it and unhighlight when it leaves. Drop it. The card must appear in the
   third column instantly, and both column counts and totals must change.
6. Reload the page. The card is still in the third column. Then click **Open in CRM →** (`crm.xml:39`) and
   confirm the stock kanban agrees; open the lead and confirm the chatter logged the stage change.
7. **Failure path.** Re-run the drag with the network throttled to offline in devtools (or block
   `/web/dataset/call_kw` with a request-blocking rule). The card must snap back to its original column and a
   red notification must appear.
8. **Same-column drag.** Drag a card up two positions inside its own column and drop. Nothing persists; a
   reload shows the original order. Confirm no `call_kw` for `write` was issued (network tab).
9. **Empty column.** Search for a string that empties one column, or drag its last card out. The dashed
   "Drop a deal here" zone must fill the column, and dropping a card onto that zone must work.
10. **Click vs drag.** (a) Click a card without moving: the `crm.lead` form opens. (b) Drag a card to another
    column and release: the form must **not** open. (c) Press a card, jog the pointer ~4px, release: the form
    opens (below the 10px `tolerance`).
11. **Keyboard.** Tab to a card: the `var(--focus)` ring shows. Enter opens the form; go back, Space opens it too.
12. **Reduced motion.** In devtools Rendering, force `prefers-reduced-motion: reduce`. Cards must not transition
    on hover, and a cross-column drag must still work exactly as in step 5.
13. **Long stage name.** In the CRM app, rename a stage to ~40 characters, reload `/odoo/pipeline`, and confirm
    the name ellipsises with the count and total still in place.
14. Console must be clean throughout — no OWL errors, no `Error in hook useSortable: …` (the hook's own
    validation message, `draggable_hook_builder.js:446`).
