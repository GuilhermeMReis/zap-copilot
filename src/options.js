import { getSettings, saveSettings, PROVIDERS } from "./storage.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["provider", "model", "apiKey", "businessName", "salesScript", "tone", "autoSendDelaySec"];

function fillModels(models) {
  $("models").innerHTML = models.map((m) => `<option value="${m}">`).join("");
}

function fillProvider(provider) {
  const p = PROVIDERS[provider];
  fillModels(p.models);
  $("keyLink").href = p.keyUrl;
}

// Busca no provedor os modelos que a chave realmente pode usar.
function refreshModels() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "listModels" }, (res) => {
      if (res?.ok && res.data.length) {
        fillModels(res.data);
        if (!res.data.includes($("model").value)) {
          const p = PROVIDERS[$("provider").value];
          $("model").value = p.models.find((m) => res.data.includes(m)) || res.data[0];
          say(`O modelo salvo não está disponível; troquei para ${$("model").value}.`);
        }
      }
      resolve(res);
    });
  });
}

async function load() {
  $("provider").innerHTML = Object.entries(PROVIDERS)
    .map(([id, p]) => `<option value="${id}">${p.label}</option>`)
    .join("");
  const s = await getSettings();
  for (const f of FIELDS) $(f).value = s[f] ?? "";
  fillProvider(s.provider);
  if (s.apiKey) refreshModels();
}

$("provider").onchange = (e) => {
  fillProvider(e.target.value);
  $("model").value = PROVIDERS[e.target.value].models[0];
};

function say(text, err = false) {
  $("msg").textContent = text;
  $("msg").className = err ? "err" : "";
}

async function save() {
  const patch = Object.fromEntries(FIELDS.map((f) => [f, $(f).value]));
  patch.apiKey = patch.apiKey.trim();
  patch.autoSendDelaySec = Number(patch.autoSendDelaySec) || 20;
  await saveSettings(patch);
}

$("save").onclick = async () => {
  await save();
  say("Salvo.");
};

$("test").onclick = async () => {
  await save();
  say("Testando…");
  const models = await refreshModels();
  if (!models?.ok) return say(models?.error || "Falhou.", true);
  await save(); // salva o modelo corrigido, se mudou
  chrome.runtime.sendMessage({ type: "testKey" }, (res) => {
    if (res?.ok) say(`Funcionou: o modelo respondeu "${res.data}".`);
    else say(res?.error || chrome.runtime.lastError?.message || "Falhou.", true);
  });
};

load();
