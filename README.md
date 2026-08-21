# Beep Dev Panel (binject)

A browser extension that injects a floating devtool panel into any page: heuristic
vulnerability scanner, DOM inspector, network snapshot, CSP viewer, a per-site
page-context script editor, and a read-only question reader.

## Install (unpacked)

**Firefox**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on…"
3. Select `extension/manifest.json`

**Chrome / Edge (Manifest V2 support required)**
Chrome removed general Manifest V2 support. This extension is Manifest V2 and
targets Firefox; it will not load in current Chrome/Edge without switching to
Manifest V3 (background service worker, `action` instead of `browser_action`,
and a `browser.*` → `chrome.*` polyfill), which hasn't been done here.

## Permissions

- `activeTab`, `storage` — panel state, per-site editor persistence
- `<all_urls>` — required so the background script can fetch response headers
  (for the CSP/X-Frame-Options checks in the Scanner) regardless of when the
  scan is triggered, and so content scripts can run on any page you open the
  panel on

## Panel pages

| Page | Purpose |
|---|---|
| Home | Quick actions, page info, last scan/CSP summary, activity log |
| Editor | Per-hostname scratchpad; runs the code you write directly in the page's JS context |
| Logs | Streamed page errors, console output, and panel activity |
| Scanner | Heuristic checks: mixed content, inline scripts, missing CSP/X-Frame-Options, exposed debug hooks, deprecated APIs, `eval()` usage |
| DOM | Click-to-inspect: tag, id, classes, text of any element |
| Network | Snapshot of recent `performance` resource entries |
| CSP | Fetches and displays the page's `Content-Security-Policy` header |
| Reader | Read-only question text extraction (see below) |
| Settings | Theme toggle, reset panel position |

## Question Reader

Built for pulling question text off quiz/assignment pages (e.g. WebAssign) into
your own study notes.

**Scope, by design:**
- Extracts visible question text only — plain `innerText` of an element you pick.
- Never reads answer keys, correct-answer markers, grades, or hidden solution data.
- Never fills in, selects, or submits anything on the page.
- Not tied to any specific site's markup — you teach it the pattern.

**How it works:**
1. Click **Pick a question** and click on one question on the page.
2. The extension derives a CSS selector from that element (its class list, or
   a tag scoped under the nearest ancestor with an id) and reports how many
   elements on the page currently match it.
3. Click **Scan all matches** to extract text from every matching element
   (capped at 200, with a count if more were found).
4. **Copy as Markdown** or **Download .md** for your notes.

If the match count looks wrong (0, or way too many), re-pick a more specific
element — e.g. the question's text container rather than its outer wrapper.
Content inside iframes isn't reached yet.

## Editor caution

The per-site Editor runs arbitrary JS directly in the page's context on your
next click of "Run in page." Only use it on pages you trust/control — treat it
like a browser devtools console, not a safe sandbox.
