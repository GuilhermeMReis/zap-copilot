document.getElementById("wa").onclick = async () => {
  const [tab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tab) await chrome.tabs.update(tab.id, { active: true });
  else await chrome.tabs.create({ url: "https://web.whatsapp.com/" });
  window.close();
};
document.getElementById("opt").onclick = () => chrome.runtime.openOptionsPage();
