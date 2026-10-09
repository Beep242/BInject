# CLAUDE.md

## What this is

**Beep Dev Panel** (repo `binject`, manifest version 1.3) — a Manifest V2 **Firefox** extension that injects
a floating, draggable devtool panel into any page: heuristic vulnerability scanner, DOM inspector,
`performance` network snapshot, CSP viewer, per-site page-context script editor, and a read-only
question-text reader (for pulling quiz questions off pages like WebAssign into study notes).

## Layout

Nine files under `extension/`; the repo root holds only `README.md` and this file.

- `manifest.json` — MV2: `activeTab` + `storage` + `<all_urls>`, `browser_action` popup, background
  `scripts`, `content/panel.html` + `panel.css` as web-accessible resources
- `background/background.js` — message hub; the only place that `fetch()`es the page URL
- `content/content.js` — panel injection, scan heuristics, element pickers, page-context injection
- `content/panel.js` — all panel UI wiring (nav, drag, every page's buttons)
- `content/panel.html` — panel markup, `fetch`ed via `runtime.getURL`
- `content/panel.css` — panel styles, added as a `<link rel="stylesheet">` pointing at `runtime.getURL`
  (not fetched) — so `unload` never removes it and the vars below outlive the panel
- `popup/` — toolbar popup; three buttons (open panel / inject / unload)

## Commands

None. No `package.json`, Makefile, CI, bundler, tests, or linter — plain JS loaded unpacked.
Firefox: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → `extension/manifest.json`.
MV2 plus `browser.*`-only code, so it will not load in current Chrome/Edge without an MV3 port.

## Architecture notes

- Everything uses the `browser.*` promise API. There is no `chrome.*` polyfill — do not write callback code.
- `content.js` and `panel.js` sit in one `content_scripts` entry, so they run on `<all_urls>` at every page
  load **and share one isolated-world global**. No `all_frames`, so top frame only — nothing reaches
  iframe content. The panel DOM does not exist until an `inject` / `open-panel` message arrives;
  `panel.js` copes by polling `tryInit()` every 100 ms until both elements appear.
- Panel → page requests route in a star through the background: `panel.js` → `runtime.sendMessage` →
  `background.js` → `tabs.sendMessage` → `content.js`, whose return value is the reply. **A new DOM-touching
  action must be added to the forwarding `if` list in `background.js` or the message dies there.** The popup
  is the exception — `popup.js` calls `tabs.sendMessage` straight at the active tab for `open-panel` /
  `inject` / `unload`, so those three have two independent entry points.
- Results flow back (`dom-picked`, `selector-picked`, `log-event`) as fire-and-forget `runtime.sendMessage`
  from `content.js` to `runtime.onMessage` in `panel.js` — but `runtime.sendMessage` targets extension
  pages, not content scripts, and `background.js` has no branch for `dom-picked` / `selector-picked` at all
  (`log-event` it merely re-broadcasts the same way). If a picker result or the Logs pane never updates, fix
  that hop (route it via `tabs.sendMessage`) before suspecting the picker. `panel.js`'s own `log()` writes
  straight to the DOM, so panel-originated activity lines always show.
- Panel DOM is built by `fetch`ing `panel.html` into a detached div, then appending its `firstElementChild`
  (`#beep-panel-root`) and `lastElementChild` (`#beep-panel-collapsed`) to `document.documentElement` — so
  `panel.html` must stay exactly those two top-level elements, in that order.
- The Scanner is split in two: header checks (missing CSP / X-Frame-Options) come from a background
  `fetch(tab.url)` — a **second GET**, not the tab's actual response — while the DOM checks (mixed content,
  inline scripts, debug globals, `webkitRequestFileSystem`, `eval()`) run in `scan-page` in `content.js`.
  The CSP page fires its own separate `fetch(tab.url)` in `get-csp`.
- `inject-editor-code` appends a `<script>` whose `textContent` is the user's code in a try/catch IIFE, then
  removes the node — the only page-context escape hatch. `browser.storage.local` holds just two key shapes:
  `beep-editor:<hostname>` (editor text, debounced 400 ms) and `beep-theme` (`dark` | `light`). Panel
  position is not persisted.

## Conventions & gotchas

- **Unload then re-inject leaves a dead panel.** `tryInit()` / `wirePanel()` run once per page load;
  `unload` removes the DOM and `inject` rebuilds it, but nothing re-wires it. Fixes belong in `panel.js` init.
- `panel.css` defines the dark palette (`--bg`, `--panel`, `--card`, `--border`, `--accent`, `--accent-soft`,
  `--text`, `--muted`) on `:root` — the **host page's** `<html>` — so those variable names leak into every
  page. Light theme is properly scoped to `#beep-panel-root[data-theme="light"]`: theming is that attribute,
  not `prefers-color-scheme`, and `dark` is hardcoded on the root element in `panel.html`.
- All injected ids/classes are namespaced `beep-`; the panel sits at `z-index: 2147483647` (pick overlays
  one below). Keep the prefix — this markup lands in arbitrary third-party pages.
- Panel nav is data-driven across three places: a `data-page="x"` nav button **and** a `#beep-panel-page-x`
  section in `panel.html` **and** an entry in the `titles` map in `panel.js`. Ten pages today, all three
  lists in sync. Miss the section and the tab renders blank; miss the `titles` entry and the header silently
  keeps the previous page's title.
- `patchConsole()` in `content.js` patches the content script's own `console`, despite the
  `// console patch (page context)` comment above it — it never sees the page's `console` calls. Page
  failures still surface via the `window` `error` / `unhandledrejection` listeners.
- The Question Reader extracts plain `innerText` of the picked selector, capped at 200 matches;
  `buildRepeatSelector()` derives it from the clicked element's class list, or its tag scoped under the
  nearest ancestor with an id. There is no autofill or submit code anywhere — but the "never reads answers
  or grades" line in `panel.html`/README is UI copy, not an enforced filter. Keep it that way.
- No env vars, no secrets, no backend, no telemetry. The only outbound requests are the two `fetch(tab.url)`
  calls in `background.js`; the rest is extension-local (`content.js` `fetch`es `content/panel.html`, and
  the injected `<link>` loads `content/panel.css`).
