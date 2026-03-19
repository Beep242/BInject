function getActiveTab() {
  return browser.tabs.query({ active: true, currentWindow: true }).then(tabs => tabs[0]);
}

document.getElementById("openPanel").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  browser.tabs.sendMessage(tab.id, { action: "open-panel" });
});

document.getElementById("inject").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  browser.tabs.sendMessage(tab.id, { action: "inject" });
});

document.getElementById("unload").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  browser.tabs.sendMessage(tab.id, { action: "unload" });
});