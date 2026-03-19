(function () {
  const STORAGE_KEY = "beep_panel_state_v1";
  const SCRIPT_KEY_PREFIX = "beep_panel_script_";

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveState(partial) {
    const next = { ...loadState(), ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function scriptKey() {
    return SCRIPT_KEY_PREFIX + location.origin;
  }

  function loadScript() {
    return localStorage.getItem(scriptKey()) || "";
  }

  function saveScript(code) {
    localStorage.setItem(scriptKey(), code);
  }

  function init() {
    const root = document.getElementById("beep-panel-root");
    const collapsed = document.getElementById("beep-panel-collapsed");
    if (!root || !collapsed) return;

    const dragRegion = root.querySelector(".beep-panel-drag-region");
    const collapseBtn = root.querySelector(".beep-panel-collapse-btn");
    const resizeHandle = root.querySelector(".beep-panel-resize-handle");

    const navItems = [...root.querySelectorAll(".beep-panel-nav-item")];
    const pages = [...root.querySelectorAll(".beep-panel-page")];
    const title = root.querySelector("#beep-panel-page-title");
    const subtitle = root.querySelector("#beep-panel-page-subtitle");

    const injectBtn = root.querySelector("#beep-panel-inject-btn");
    const unloadBtn = root.querySelector("#beep-panel-unload-btn");
    const activityLog = root.querySelector("#beep-panel-activity-log");
    const logOut = root.querySelector("#beep-panel-log-output");
    const cspOut = root.querySelector("#beep-panel-csp-output");
    const editorContainer = root.querySelector("#beep-panel-editor");

    const state = loadState();

    // Restore collapsed
    if (state.collapsed) {
      root.style.display = "none";
      collapsed.style.display = "inline-flex";
      if (state.left != null && state.top != null) {
        collapsed.style.left = state.left + "px";
        collapsed.style.top = state.top + "px";
      }
    }

    // Dragging
    let dragging = false;
    let dx = 0, dy = 0;

    dragRegion.addEventListener("mousedown", e => {
      dragging = true;
      const rect = root.getBoundingClientRect();
      dx = e.clientX - rect.left;
      dy = e.clientY - rect.top;
      e.preventDefault();
    });

    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      const x = e.clientX - dx;
      const y = e.clientY - dy;
      root.style.left = x + "px";
      root.style.top = y + "px";
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      const rect = root.getBoundingClientRect();
      saveState({ left: rect.left, top: rect.top });
    });

    // Resize
    let resizing = false;
    let sx = 0, sy = 0, sw = 0, sh = 0;

    resizeHandle.addEventListener("mousedown", e => {
      resizing = true;
      const rect = root.getBoundingClientRect();
      sw = rect.width;
      sh = rect.height;
      sx = e.clientX;
      sy = e.clientY;
      e.preventDefault();
    });

    window.addEventListener("mousemove", e => {
      if (!resizing) return;
      const w = Math.max(400, sw + (e.clientX - sx));
      const h = Math.max(260, sh + (e.clientY - sy));
      root.style.width = w + "px";
      root.style.height = h + "px";
    });

    window.addEventListener("mouseup", () => {
      if (!resizing) return;
      resizing = false;
      const rect = root.getBoundingClientRect();
      saveState({ width: rect.width, height: rect.height });
    });

    // Collapse
    collapseBtn.addEventListener("click", () => {
      const rect = root.getBoundingClientRect();
      root.style.display = "none";
      collapsed.style.display = "inline-flex";
      collapsed.style.left = rect.left + "px";
      collapsed.style.top = rect.top + "px";
      saveState({ collapsed: true, left: rect.left, top: rect.top });
    });

    collapsed.addEventListener("click", () => {
      collapsed.style.display = "none";
      root.style.display = "block";
      saveState({ collapsed: false });
    });

    // Tabs
    function setPage(page) {
      navItems.forEach(btn => btn.classList.toggle("active", btn.dataset.page === page));
      pages.forEach(p => p.classList.toggle("active", p.id === "beep-panel-page-" + page));

      const titles = {
        home: ["Dashboard", "Floating devtool panel."],
        editor: ["Editor", "Per-site script, runs in content script."],
        logs: ["Logs", "Mirrored console output + run results."],
        csp: ["CSP", "What this page exposes."],
        settings: ["Settings", "Panel preferences."],
        about: ["About", "Bee[ · experimental devtool."]
      };

      if (titles[page]) {
        title.textContent = titles[page][0];
        subtitle.textContent = titles[page][1];
      }

      saveState({ activePage: page });
    }

    navItems.forEach(btn => {
      btn.addEventListener("click", () => setPage(btn.dataset.page));
    });

    if (state.activePage) setPage(state.activePage);

    // Activity log
    function logActivity(msg) {
      activityLog.textContent += "\n" + msg;
      activityLog.scrollTop = activityLog.scrollHeight;
    }

    // Logs tab helper
    function logToPanel(msg) {
      logOut.textContent += "\n" + msg;
      logOut.scrollTop = logOut.scrollHeight;
    }

    // Mirror console.log
    (function () {
      const orig = console.log;
      console.log = function (...args) {
        try {
          const text = args.map(a => {
            try {
              return typeof a === "string" ? a : JSON.stringify(a);
            } catch {
              return String(a);
            }
          }).join(" ");
          logToPanel("[log] " + text);
        } catch {}
        orig.apply(console, args);
      };
    })();

    // CSP
    if (cspOut) {
      try {
        const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        if (meta && meta.content) {
          cspOut.textContent = meta.content;
        } else {
          cspOut.textContent = "No CSP meta tag found.\n\nHeaders are not visible from page JS.";
        }
      } catch {
        cspOut.textContent = "Unable to read CSP information.";
      }
    }

    // Editor (textarea)
    const editor = document.createElement("textarea");
    editor.value = loadScript();
    editor.style.cssText = `
      width:100%; height:100%; resize:none; border:none; outline:none;
      background:#020617; color:#e5e7eb; padding:8px;
      font-family:"JetBrains Mono", monospace; font-size:12px;
    `;
    editorContainer.appendChild(editor);

    editor.addEventListener("input", () => saveScript(editor.value));

    // Listen for run results from content script
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.source !== "beep-panel") return;

      if (data.type === "run-result") {
        if (data.ok) {
          logActivity("[result] " + (data.result ?? "undefined"));
        } else {
          logActivity("[error] " + data.error);
        }
      }
    });

    // Inject: send code to content script to run in its context
    injectBtn.addEventListener("click", () => {
      const code = (editor.value || "").trim();
      if (!code) {
        logActivity("[warn] No code to run.");
        return;
      }
      logActivity("[action] Running code in content script context...");
      window.postMessage(
        {
          source: "beep-panel",
          type: "run-code",
          code
        },
        "*"
      );
    });

    // Unload: still just a log (no auto-unpatch)
    unloadBtn.addEventListener("click", () => {
      logActivity("[action] Unload requested (no auto-unpatch).");
    });

    logActivity("[info] Beep panel initialized on " + location.origin);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();