// Service worker: faz as chamadas ao LLM (evita CORS no content script)
// e cuida dos lembretes de follow-up com chrome.alarms.
import { getSettings, getFollowups, saveFollowups } from "./storage.js";
import { chat } from "./llm.js";
import { analyzePrompt, replyPrompt } from "./prompts.js";

const handlers = {
  async analyze({ conversation }) {
    const settings = await getSettings();
    return chat(settings, analyzePrompt(settings, conversation), { json: true, temperature: 0.2 });
  },

  async reply({ conversation, instruction }) {
    const settings = await getSettings();
    return chat(settings, replyPrompt(settings, conversation, instruction), { temperature: 0.6 });
  },

  async testKey() {
    const settings = await getSettings();
    return chat(settings, [{ role: "user", content: "Responda apenas: ok" }], { temperature: 0 });
  },

  async listFollowups() {
    return (await getFollowups()).sort((a, b) => a.dueAt - b.dueAt);
  },

  async addFollowup({ chatName, dueAt, note, message }) {
    const item = {
      id: crypto.randomUUID(),
      chatName,
      dueAt,
      note: note || "",
      message: message || "",
      done: false,
      createdAt: Date.now(),
    };
    const list = await getFollowups();
    list.push(item);
    await saveFollowups(list);
    chrome.alarms.create(`fu:${item.id}`, { when: dueAt });
    return item;
  },

  async completeFollowup({ id }) {
    const list = await getFollowups();
    const item = list.find((f) => f.id === id);
    if (item) item.done = true;
    await saveFollowups(list);
    chrome.alarms.clear(`fu:${id}`);
    return true;
  },

  async deleteFollowup({ id }) {
    await saveFollowups((await getFollowups()).filter((f) => f.id !== id));
    chrome.alarms.clear(`fu:${id}`);
    return true;
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler(msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true; // resposta assíncrona
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("fu:")) return;
  const id = alarm.name.slice(3);
  const item = (await getFollowups()).find((f) => f.id === id);
  if (!item || item.done) return;
  chrome.notifications.create(alarm.name, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: `Follow-up: ${item.chatName}`,
    message: item.note || item.message || "Hora de retomar essa conversa.",
    priority: 2,
  });
});

chrome.notifications.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: "https://web.whatsapp.com/" });
  }
});

// Alarmes não sobrevivem a reinstalação: recria os pendentes.
async function restoreAlarms() {
  for (const f of await getFollowups()) {
    if (!f.done) chrome.alarms.create(`fu:${f.id}`, { when: Math.max(f.dueAt, Date.now() + 1000) });
  }
}
chrome.runtime.onInstalled.addListener(restoreAlarms);
chrome.runtime.onStartup.addListener(restoreAlarms);
