// Service worker: faz as chamadas ao LLM (evita CORS no content script)
// e cuida dos lembretes de follow-up com chrome.alarms.
import { getSettings, getFollowups, saveFollowups } from "./storage.js";
import { chat, listModels } from "./llm.js";
import { analyzePrompt, replyPrompt, followupPrompt, cadencePrompt } from "./prompts.js";

const handlers = {
  async analyze({ conversation }) {
    const settings = await getSettings();
    return chat(settings, analyzePrompt(settings, conversation), { json: true, temperature: 0.2 });
  },

  async reply({ conversation, instruction }) {
    const settings = await getSettings();
    return chat(settings, replyPrompt(settings, conversation, instruction), { temperature: 0.6 });
  },

  async suggestFollowup({ conversation }) {
    const settings = await getSettings();
    const s = await chat(settings, followupPrompt(settings, conversation), { json: true, temperature: 0.4 });
    const minutes = Math.max(5, Math.round(Number(s.em_minutos) || 60 * 24));
    return { dueAt: Date.now() + minutes * 60000, message: String(s.mensagem || ""), reason: String(s.motivo || "") };
  },

  async cadenceMessage({ conversation, step, total }) {
    const settings = await getSettings();
    return chat(settings, cadencePrompt(settings, conversation, step, total), { temperature: 0.7 });
  },

  async getSettings() {
    const { apiKey, ...safe } = await getSettings(); // a chave nunca vai para a página
    return safe;
  },

  async openOptions() {
    chrome.runtime.openOptionsPage();
    return true;
  },

  async testKey() {
    const settings = await getSettings();
    return chat(settings, [{ role: "user", content: "Responda apenas: ok" }], { temperature: 0 });
  },

  async listModels() {
    return listModels(await getSettings());
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

  async completeFollowup({ id, outcome }) {
    const list = await getFollowups();
    const item = list.find((f) => f.id === id);
    if (item) Object.assign(item, { done: true, outcome: outcome || "concluído", doneAt: Date.now() });
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

// O Chrome desacelera abas em segundo plano: a cada 30s o background "acorda"
// a aba do WhatsApp para checar piloto, follow-ups e cadência.
chrome.alarms.create("zc-heartbeat", { periodInMinutes: 0.5 });
async function wakeWhatsApp() {
  for (const tab of await chrome.tabs.query({ url: "https://web.whatsapp.com/*" })) {
    chrome.tabs.sendMessage(tab.id, { type: "zc-tick" }).catch(() => {});
  }
}
chrome.alarms.onAlarm.addListener((a) => (a.name === "zc-heartbeat" || a.name.startsWith("fu:")) && wakeWhatsApp());

// Alarmes não sobrevivem a reinstalação: recria os pendentes.
async function restoreAlarms() {
  for (const f of await getFollowups()) {
    if (!f.done) chrome.alarms.create(`fu:${f.id}`, { when: Math.max(f.dueAt, Date.now() + 1000) });
  }
}
chrome.runtime.onInstalled.addListener(restoreAlarms);
chrome.runtime.onStartup.addListener(restoreAlarms);
