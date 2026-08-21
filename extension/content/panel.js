(function initPanelScript() {
  function tryInit() {
    const root = document.getElementById("beep-panel-root");
    const collapsed = document.getElementById("beep-panel-collapsed");
    if (!root || !collapsed) {
      setTimeout(tryInit, 100);
      return;
    }
    wirePanel(root, collapsed);
  }

  function wirePanel(root, collapsed) {
    const collapseBtn = root.querySelector(".beep-panel-collapse-btn");
    const navItems = root.querySelectorAll(".beep-panel-nav-item");
    const pages = root.querySelectorAll(".beep-panel-page");
    const titleEl = document.getElementById("beep-panel-page-title");
    const subtitleEl = document.getElementById("beep-panel-page-subtitle");

    const titles = {
      home: { title: "Dashboard", subtitle: "Floating devtool panel." },
      editor: { title: "Editor", subtitle: "Per-site page-context scratchpad." },
      logs: { title: "Logs", subtitle: "Activity, errors, page console." },
      scanner: { title: "Scanner", subtitle: "Heuristic vulnerability scan." },
      dom: { title: "DOM Inspector", subtitle: "Click-to-inspect elements." },
      network: { title: "Network", subtitle: "Recent resource requests." },
      csp: { title: "CSP", subtitle: "Content-Security-Policy for this page." },
      reader: { title: "Question Reader", subtitle: "Read-only question text extraction for study notes." },
      settings: { title: "Settings", subtitle: "Theme and panel behavior." },
      about: { title: "About", subtitle: "Beep · floating devtool panel." }
    };

    const activityLog = document.getElementById("beep-panel-activity-log");
    const logOutput = document.getElementById("beep-panel-log-output");
    const homePageInfo = document.getElementById("beep-panel-home-page-info");
    const homeScanSummary = document.getElementById("beep-panel-home-scan-summary");
    const homeCspSummary = document.getElementById("beep-panel-home-csp-summary");

    function appendLog(target, msg) {
      if (!target) return;
      const text = target.textContent.replace(/\s+$/, "");
      target.textContent = (text ? text + "\n" : "") + msg;
      target.scrollTop = target.scrollHeight;
    }

    function log(msg) {
      const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
      appendLog(activityLog, line);
      appendLog(logOutput, line);
    }

    // Nav switching
    navItems.forEach(btn => {
      btn.addEventListener("click", () => {
        const pageKey = btn.getAttribute("data-page");
        const targetId = `beep-panel-page-${pageKey}`;

        navItems.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        pages.forEach(p => {
          p.classList.toggle("active", p.id === targetId);
        });

        const meta = titles[pageKey];
        if (meta) {
          titleEl.textContent = meta.title;
          subtitleEl.textContent = meta.subtitle;
        }

        if (pageKey === "csp") {
          loadCSP();
        }
      });
    });

    // Collapse / expand
    collapseBtn.addEventListener("click", () => {
      root.style.display = "none";
      collapsed.style.display = "block";
    });

    collapsed.addEventListener("click", () => {
      collapsed.style.display = "none";
      root.style.display = "block";
    });

    // Drag
    const dragRegion = root.querySelector(".beep-panel-drag-region");
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function getRootRect() {
      const rect = root.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    }

    dragRegion.addEventListener("mousedown", (e) => {
      dragging = true;
      const rect = getRootRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      root.style.left = `${startLeft + dx}px`;
      root.style.top = `${startTop + dy}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
    }

    function onUp() {
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    // Home info
    if (homePageInfo) {
      homePageInfo.textContent =
        `URL: ${window.location.href}\nProtocol: ${window.location.protocol}\nHost: ${window.location.host}`;
    }

    // Home quick actions
    const injectBtn = document.getElementById("beep-panel-inject-btn");
    const unloadBtn = document.getElementById("beep-panel-unload-btn");

    if (injectBtn) {
      injectBtn.addEventListener("click", () => {
        browser.runtime.sendMessage({ action: "inject" });
        log("Inject requested from panel.");
      });
    }

    if (unloadBtn) {
      unloadBtn.addEventListener("click", () => {
        browser.runtime.sendMessage({ action: "unload" });
        log("Unload requested from panel.");
      });
    }

    // CSP loader
    const cspOutput = document.getElementById("beep-panel-csp-output");
    const cspRefresh = document.getElementById("beep-panel-csp-refresh");
    const cspCopy = document.getElementById("beep-panel-csp-copy");

    async function loadCSP() {
      if (!cspOutput) return;
      cspOutput.textContent = "Loading CSP...";
      const csp = await browser.runtime.sendMessage({ action: "get-csp" });
      cspOutput.textContent = csp;

      if (homeCspSummary) {
        homeCspSummary.textContent = csp.includes("No Content-Security-Policy")
          ? "No CSP header."
          : "CSP present.";
      }

      log("CSP loaded.");
    }

    if (cspRefresh) {
      cspRefresh.addEventListener("click", loadCSP);
    }

    if (cspCopy) {
      cspCopy.addEventListener("click", async () => {
        if (!cspOutput) return;
        try {
          await navigator.clipboard.writeText(cspOutput.textContent);
          log("CSP copied to clipboard.");
        } catch {
          log("Failed to copy CSP.");
        }
      });
    }

    // Vulnerability scanner
    const scanBtn = document.getElementById("beep-panel-scan-btn");
    const scanResults = document.getElementById("beep-panel-scan-results");

    function severityMeta(sev) {
      if (sev === "high") return { label: "HIGH", emoji: "🔴", cls: "beep-severity-high" };
      if (sev === "medium") return { label: "MEDIUM", emoji: "🟠", cls: "beep-severity-medium" };
      return { label: "LOW", emoji: "🟡", cls: "beep-severity-low" };
    }

    if (scanBtn && scanResults) {
      scanBtn.addEventListener("click", async () => {
        scanResults.innerHTML = "<div class='beep-panel-card'>Scanning…</div>";
        log("Vulnerability scan started.");

        const result = await browser.runtime.sendMessage({ action: "run-vuln-scan" });

        scanResults.innerHTML = "";

        if (!result || !result.length) {
          const card = document.createElement("div");
          card.className = "beep-panel-card wide";
          card.innerHTML = `
            <h2>No obvious issues detected</h2>
            <p>This is a heuristic scan. Always validate with full security tooling.</p>
          `;
          scanResults.appendChild(card);
          if (homeScanSummary) {
            homeScanSummary.textContent = "Last scan: no obvious issues.";
          }
          log("Vulnerability scan completed: no obvious issues.");
          return;
        }

        let summary = [];

        result.forEach(item => {
          const meta = severityMeta(item.severity || "low");
          const card = document.createElement("div");
          card.className = `beep-panel-card wide ${meta.cls}`;
          card.innerHTML = `
            <h2>${meta.emoji} ${meta.label} — ${item.title}</h2>
            <p>${item.detail}</p>
          `;
          scanResults.appendChild(card);
          summary.push(`${meta.label}: ${item.title}`);
          log(`Scanner: ${item.title}`);
        });

        if (homeScanSummary) {
          homeScanSummary.textContent = summary.join("\n");
        }

        log("Vulnerability scan completed with findings.");
      });
    }

    // Editor per-site (page injection)
    const editor = document.getElementById("beep-panel-editor");
    const editorLines = document.getElementById("beep-panel-editor-lines");
    const editorReset = document.getElementById("beep-panel-editor-reset");
    const editorRun = document.getElementById("beep-panel-editor-run");
    const editorKey = `beep-editor:${window.location.hostname}`;

    function updateEditorLines() {
      if (!editor || !editorLines) return;
      const lines = editor.value.split("\n").length || 1;
      editorLines.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
    }

    async function loadEditor() {
      if (!editor) return;
      const stored = await browser.storage.local.get(editorKey);
      editor.value = stored[editorKey] || "";
      updateEditorLines();
    }

    let editorSaveTimeout = null;
    if (editor) {
      editor.addEventListener("input", () => {
        updateEditorLines();
        if (editorSaveTimeout) clearTimeout(editorSaveTimeout);
        editorSaveTimeout = setTimeout(() => {
          const obj = {};
          obj[editorKey] = editor.value;
          browser.storage.local.set(obj);
          log("Editor content saved for this host.");
        }, 400);
      });
    }

    if (editorReset && editor) {
      editorReset.addEventListener("click", async () => {
        editor.value = "";
        updateEditorLines();
        const obj = {};
        obj[editorKey] = "";
        await browser.storage.local.set(obj);
        log("Editor content reset for this host.");
      });
    }

    if (editorRun && editor) {
      editorRun.addEventListener("click", () => {
        browser.runtime.sendMessage({
          action: "inject-editor-code",
          code: editor.value
        });
        log("Editor code injected into page.");
      });
    }

    loadEditor();

    // Logs: clear
    const logsClear = document.getElementById("beep-panel-logs-clear");
    if (logsClear && logOutput) {
      logsClear.addEventListener("click", () => {
        logOutput.textContent = "";
        log("Logs cleared.");
      });
    }

    // DOM inspector
    const domPickBtn = document.getElementById("beep-panel-dom-pick");
    const domOutput = document.getElementById("beep-panel-dom-output");

    if (domPickBtn && domOutput) {
      domPickBtn.addEventListener("click", () => {
        browser.runtime.sendMessage({ action: "start-dom-pick" });
        domOutput.textContent = "Click an element on the page…";
        log("DOM pick mode started.");
      });
    }

    // Question Reader
    const readerPickBtn = document.getElementById("beep-panel-reader-pick");
    const readerScanBtn = document.getElementById("beep-panel-reader-scan");
    const readerCopyBtn = document.getElementById("beep-panel-reader-copy");
    const readerDownloadBtn = document.getElementById("beep-panel-reader-download");
    const readerSelectorOutput = document.getElementById("beep-panel-reader-selector");
    const readerOutput = document.getElementById("beep-panel-reader-output");

    let readerSelector = null;
    let readerItems = [];

    function readerMarkdown() {
      return readerItems.map((text, i) => `**Q${i + 1}.** ${text}`).join("\n\n");
    }

    if (readerPickBtn) {
      readerPickBtn.addEventListener("click", () => {
        browser.runtime.sendMessage({ action: "start-selector-pick" });
        readerSelectorOutput.textContent = "Click a question on the page…";
        log("Reader: picking a question pattern.");
      });
    }

    if (readerScanBtn) {
      readerScanBtn.addEventListener("click", async () => {
        if (!readerSelector) return;
        readerOutput.textContent = "Scanning…";
        const result = await browser.runtime.sendMessage({
          action: "scan-questions",
          selector: readerSelector
        });

        if (!result || result.error) {
          readerOutput.textContent = result?.error || "Scan failed.";
          readerCopyBtn.disabled = true;
          readerDownloadBtn.disabled = true;
          log("Reader: scan failed.");
          return;
        }

        readerItems = result.items;
        if (!readerItems.length) {
          readerOutput.textContent = "No matching elements found. Try picking a different question.";
          readerCopyBtn.disabled = true;
          readerDownloadBtn.disabled = true;
          log("Reader: scan found nothing.");
          return;
        }

        const warning = result.truncated
          ? `\n\n… showing first 200 of ${result.total} matches.`
          : "";
        readerOutput.textContent =
          readerItems.map((text, i) => `Q${i + 1}. ${text}`).join("\n\n") + warning;
        readerCopyBtn.disabled = false;
        readerDownloadBtn.disabled = false;
        log(`Reader: extracted ${readerItems.length} question(s).`);
      });
    }

    if (readerCopyBtn) {
      readerCopyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(readerMarkdown());
          log("Reader: copied questions as Markdown.");
        } catch {
          log("Reader: failed to copy to clipboard.");
        }
      });
    }

    if (readerDownloadBtn) {
      readerDownloadBtn.addEventListener("click", () => {
        const blob = new Blob([readerMarkdown()], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${window.location.hostname}-questions.md`;
        a.click();
        URL.revokeObjectURL(url);
        log("Reader: downloaded questions.md.");
      });
    }

    // Network snapshot
    const netRefresh = document.getElementById("beep-panel-network-refresh");
    const netOutput = document.getElementById("beep-panel-network-output");

    if (netRefresh && netOutput) {
      netRefresh.addEventListener("click", async () => {
        netOutput.textContent = "Loading network entries…";
        const entries = await browser.runtime.sendMessage({ action: "get-network" });
        if (!entries || !entries.length) {
          netOutput.textContent = "No recent resource entries.";
          return;
        }
        const lines = entries.map(e =>
          `${e.type || "resource"} ${e.duration}ms ${Math.round(e.size / 1024)}kb\n${e.name}`
        );
        netOutput.textContent = lines.join("\n\n");
        log("Network snapshot refreshed.");
      });
    }

    // Theme switcher
    const themeToggle = document.getElementById("beep-panel-theme-toggle");
    const themeKey = "beep-theme";

    async function loadTheme() {
      const stored = await browser.storage.local.get(themeKey);
      const theme = stored[themeKey] || "dark";
      root.setAttribute("data-theme", theme);
    }

    if (themeToggle) {
      themeToggle.addEventListener("click", async () => {
        const current = root.getAttribute("data-theme") || "dark";
        const next = current === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        const obj = {};
        obj[themeKey] = next;
        await browser.storage.local.set(obj);
        log(`Theme switched to ${next}.`);
      });
    }

    loadTheme();

    // Reset position
    const resetPos = document.getElementById("beep-panel-reset-position");
    if (resetPos) {
      resetPos.addEventListener("click", () => {
        root.style.left = "";
        root.style.top = "";
        root.style.right = "";
        root.style.bottom = "";
        root.style.inset = "auto auto 40px 40px";
        log("Panel position reset.");
      });
    }

    // Real-time log streaming (errors + console + DOM pick)
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.action === "log-event") {
        const level = msg.level || "info";
        const prefix = level === "error" ? "[error]" :
                       level === "warn" ? "[warn]" :
                       "[info]";
        const src = msg.source ? ` (${msg.source})` : "";
        const line = `${prefix}${src} ${msg.message}`;
        appendLog(logOutput, line);
      }

      if (msg.action === "dom-picked" && domOutput) {
        const info = msg.info;
        domOutput.textContent =
          `Tag: ${info.tag}\n` +
          `ID: ${info.id || "-"}\n` +
          `Classes: ${info.classes || "-"}\n\n` +
          `Text:\n${info.text || "(no text)"}`;
        log("DOM element picked.");
      }

      if (msg.action === "selector-picked" && readerSelectorOutput) {
        readerSelector = msg.selector;
        readerSelectorOutput.textContent = `Pattern: ${msg.selector}\nMatches on page right now: ${msg.count}`;
        readerScanBtn.disabled = msg.count === 0;
        log(`Reader: learned pattern "${msg.selector}" (${msg.count} matches).`);
      }
    });

    // Initial log
    log("Beep panel initialized on this page.");
  }

  tryInit();
})();