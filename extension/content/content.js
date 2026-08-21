let panelInjected = false;
let stylesInjected = false;
let domPicking = false;
let selectorPicking = false;

// Builds a CSS selector that matches "elements like this one" so a single
// click can target every repeated instance of a question/list-item pattern.
// Prefers the clicked element's own class list; falls back to tag name
// scoped under the nearest ancestor with a stable-looking id.
function buildRepeatSelector(el) {
  if (el.className && typeof el.className === "string" && el.className.trim()) {
    const classes = el.className.trim().split(/\s+/).map(c => `.${CSS.escape(c)}`).join("");
    return `${el.tagName.toLowerCase()}${classes}`;
  }

  let ancestor = el.parentElement;
  while (ancestor && !ancestor.id) {
    ancestor = ancestor.parentElement;
  }

  if (ancestor && ancestor.id) {
    return `#${CSS.escape(ancestor.id)} ${el.tagName.toLowerCase()}`;
  }

  return el.tagName.toLowerCase();
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = browser.runtime.getURL("content/panel.css");
  document.documentElement.appendChild(link);
}

async function injectPanel() {
  if (panelInjected) return;
  panelInjected = true;

  injectStyles();

  const htmlUrl = browser.runtime.getURL("content/panel.html");
  const html = await fetch(htmlUrl).then(r => r.text());

  const container = document.createElement("div");
  container.innerHTML = html;
  const root = container.firstElementChild;
  const collapsed = container.lastElementChild;

  document.documentElement.appendChild(root);
  document.documentElement.appendChild(collapsed);
}

function unloadPanel() {
  const root = document.getElementById("beep-panel-root");
  const collapsed = document.getElementById("beep-panel-collapsed");
  if (root) root.remove();
  if (collapsed) collapsed.remove();
  panelInjected = false;
}

function openPanel() {
  const root = document.getElementById("beep-panel-root");
  const collapsed = document.getElementById("beep-panel-collapsed");

  if (root) {
    root.style.display = "block";
    if (collapsed) collapsed.style.display = "none";
  } else {
    injectPanel();
  }
}

// page error streaming
window.addEventListener("error", (e) => {
  browser.runtime.sendMessage({
    action: "log-event",
    level: "error",
    message: e.message,
    source: e.filename,
    line: e.lineno,
    col: e.colno
  });
});

window.addEventListener("unhandledrejection", (e) => {
  browser.runtime.sendMessage({
    action: "log-event",
    level: "error",
    message: String(e.reason),
    source: "unhandledrejection"
  });
});

// console patch (page context)
function patchConsole() {
  if (window.__beepConsolePatched) return;
  window.__beepConsolePatched = true;

  const send = (level, args) => {
    browser.runtime.sendMessage({
      action: "log-event",
      level,
      message: args.map(a => {
        try { return typeof a === "object" ? JSON.stringify(a) : String(a); }
        catch { return String(a); }
      }).join(" ")
    });
  };

  ["log", "warn", "error"].forEach(level => {
    const orig = console[level];
    console[level] = function (...args) {
      send(level, args);
      orig.apply(console, args);
    };
  });
}

patchConsole();

browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === "inject") {
    injectPanel();
  }

  if (msg.action === "unload") {
    unloadPanel();
  }

  if (msg.action === "open-panel") {
    openPanel();
  }

  if (msg.action === "scan-page") {
    const results = [];

    if (location.protocol === "https:") {
      const mixed = [...document.querySelectorAll("img,script,link,iframe")]
        .filter(el => (el.src && el.src.startsWith("http:")) || (el.href && el.href.startsWith("http:")));
      if (mixed.length > 0) {
        results.push({
          title: "Mixed Content",
          detail: `${mixed.length} insecure resources loaded over HTTP`,
          severity: "high"
        });
      }
    }

    const inlineScripts = [...document.scripts].filter(s => !s.src);
    if (inlineScripts.length > 0) {
      results.push({
        title: "Inline Scripts Detected",
        detail: `${inlineScripts.length} inline <script> tags found`,
        severity: "medium"
      });
    }

    const debugGlobals = ["__REDUX_DEVTOOLS_EXTENSION__", "__VUE_DEVTOOLS_GLOBAL_HOOK__"];
    const foundDebug = debugGlobals.filter(g => window[g]);
    if (foundDebug.length > 0) {
      results.push({
        title: "Debug Hooks Exposed",
        detail: foundDebug.join(", "),
        severity: "medium"
      });
    }

    if (msg.headers) {
      const lower = {};
      for (const k in msg.headers) lower[k.toLowerCase()] = msg.headers[k];

      if (!lower["content-security-policy"]) {
        results.push({
          title: "Missing CSP",
          detail: "No Content-Security-Policy header detected",
          severity: "high"
        });
      }

      if (!lower["x-frame-options"]) {
        results.push({
          title: "Missing X-Frame-Options",
          detail: "Page may be vulnerable to clickjacking",
          severity: "high"
        });
      }
    }

    if ("webkitRequestFileSystem" in window) {
      results.push({
        title: "Deprecated API",
        detail: "webkitRequestFileSystem is deprecated and unsafe",
        severity: "high"
      });
    }

    const inlineScripts2 = [...document.scripts].filter(s => !s.src);
    const evalCount = inlineScripts2.filter(s => s.textContent.includes("eval(")).length;
    if (evalCount > 0) {
      results.push({
        title: "Eval Usage",
        detail: `${evalCount} inline scripts contain eval()`,
        severity: "high"
      });
    }

    return Promise.resolve(results);
  }

  if (msg.action === "start-dom-pick") {
    if (domPicking) return;
    domPicking = true;

    const overlay = document.createElement("div");
    overlay.id = "beep-dom-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      pointerEvents: "none",
      border: "2px solid #4cc9ff",
      background: "rgba(76, 201, 255, 0.15)",
      zIndex: "2147483646"
    });
    document.documentElement.appendChild(overlay);

    function moveOverlay(el) {
      if (!el || el === document.documentElement || el === document.body) return;
      const rect = el.getBoundingClientRect();
      overlay.style.left = rect.left + "px";
      overlay.style.top = rect.top + "px";
      overlay.style.width = rect.width + "px";
      overlay.style.height = rect.height + "px";
    }

    function onMove(e) {
      moveOverlay(e.target);
    }

    function onClick(e) {
      e.preventDefault();
      e.stopPropagation();
      domPicking = false;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      overlay.remove();

      const el = e.target;
      const info = {
        tag: el.tagName,
        id: el.id || null,
        classes: el.className || null,
        text: (el.innerText || "").trim().slice(0, 200)
      };

      browser.runtime.sendMessage({
        action: "dom-picked",
        info
      });
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
  }

  if (msg.action === "start-selector-pick") {
    if (selectorPicking) return;
    selectorPicking = true;

    const overlay = document.createElement("div");
    overlay.id = "beep-selector-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      pointerEvents: "none",
      border: "2px solid #22c55e",
      background: "rgba(34, 197, 94, 0.15)",
      zIndex: "2147483646"
    });
    document.documentElement.appendChild(overlay);

    function moveOverlay(el) {
      if (!el || el === document.documentElement || el === document.body) return;
      const rect = el.getBoundingClientRect();
      overlay.style.left = rect.left + "px";
      overlay.style.top = rect.top + "px";
      overlay.style.width = rect.width + "px";
      overlay.style.height = rect.height + "px";
    }

    function onMove(e) {
      moveOverlay(e.target);
    }

    function onClick(e) {
      e.preventDefault();
      e.stopPropagation();
      selectorPicking = false;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      overlay.remove();

      const selector = buildRepeatSelector(e.target);
      let count = 0;
      try {
        count = document.querySelectorAll(selector).length;
      } catch {
        count = 0;
      }

      browser.runtime.sendMessage({
        action: "selector-picked",
        selector,
        count
      });
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
  }

  if (msg.action === "scan-questions") {
    const selector = msg.selector || "";
    let items = [];

    try {
      items = [...document.querySelectorAll(selector)]
        .map(el => (el.innerText || "").trim())
        .filter(Boolean);
    } catch (e) {
      return Promise.resolve({ error: `Invalid selector: ${e.message}` });
    }

    const truncated = items.length > 200;
    return Promise.resolve({
      items: items.slice(0, 200),
      truncated,
      total: items.length
    });
  }

  if (msg.action === "get-network") {
    const entries = performance.getEntriesByType("resource") || [];
    const simplified = entries.slice(-100).map(e => ({
      name: e.name,
      type: e.initiatorType,
      duration: Math.round(e.duration),
      size: e.transferSize || e.encodedBodySize || 0
    }));
    return Promise.resolve(simplified);
  }

  if (msg.action === "inject-editor-code") {
    const code = msg.code || "";
    const script = document.createElement("script");
    script.textContent = `
      (function() {
        try {
          ${code}
        } catch (err) {
          console.error("Editor script error:", err);
        }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
  }

  return undefined;
});