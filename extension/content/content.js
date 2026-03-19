// Listen for popup messages (open panel, etc.)
browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "open-panel") {
    injectFloatingPanel();
  }

  if (msg.action === "inject") {
    console.log("[Beep Panel] Inject requested (handled via content script).");
  }

  if (msg.action === "unload") {
    console.log("[Beep Panel] Unload requested (no-op in content script).");
  }
});

// Listen for messages from the panel (page context -> content script)
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== "beep-panel") return;

  if (data.type === "run-code") {
    const code = data.code || "";
    try {
      const fn = new Function(code);
      const result = fn();
      window.postMessage(
        {
          source: "beep-panel",
          type: "run-result",
          ok: true,
          result: stringifySafe(result),
        },
        "*"
      );
    } catch (e) {
      window.postMessage(
        {
          source: "beep-panel",
          type: "run-result",
          ok: false,
          error: String(e),
        },
        "*"
      );
    }
  }
});

function stringifySafe(v) {
  try {
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

async function injectFloatingPanel() {
  if (document.getElementById("beep-panel-root")) return;

  const html = await fetch(browser.runtime.getURL("content/panel.html")).then(r => r.text());
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  document.documentElement.appendChild(wrapper);

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = browser.runtime.getURL("content/panel.css");
  document.documentElement.appendChild(css);

  const script = document.createElement("script");
  script.setAttribute("type", "text/javascript");
  script.src = browser.runtime.getURL("content/panel.js");
  document.documentElement.appendChild(script);
}