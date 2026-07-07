browser.runtime.onInstalled.addListener(() => {
  console.log("Beep Dev Panel installed");
});

browser.runtime.onMessage.addListener((msg, sender) => {
  // Vulnerability scan: background fetch + DOM heuristics in content script
  if (msg.action === "run-vuln-scan") {
    return (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) return [];

      let headersObj = null;
      try {
        const res = await fetch(tab.url, { method: "GET" });
        headersObj = Object.fromEntries(res.headers.entries());
      } catch (e) {
        headersObj = null;
      }

      return browser.tabs.sendMessage(tab.id, {
        action: "scan-page",
        headers: headersObj
      });
    })();
  }

  // CSP fetch
  if (msg.action === "get-csp") {
    return (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) return "No active tab";

      try {
        const res = await fetch(tab.url, { method: "GET" });
        const headers = Object.fromEntries(res.headers.entries());
        const csp = headers["content-security-policy"] || headers["Content-Security-Policy"];
        return csp || "No Content-Security-Policy header present.";
      } catch (e) {
        return `Failed to fetch CSP: ${e}`;
      }
    })();
  }

  // Forward panel → content actions that need DOM access
  if (
    msg.action === "start-dom-pick" ||
    msg.action === "get-network" ||
    msg.action === "inject" ||
    msg.action === "unload" ||
    msg.action === "open-panel" ||
    msg.action === "inject-editor-code"
  ) {
    return (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      return browser.tabs.sendMessage(tab.id, msg);
    })();
  }

  // Log events from content/page → broadcast to all listeners (panel)
  if (msg.action === "log-event") {
    browser.runtime.sendMessage(msg);
  }

  return undefined;
});