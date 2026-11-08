import { getSettings, saveSettings, PROVIDERS } from "./storage.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["provider", "model", "apiKey", "businessName", "salesScript", "tone", "autoSendDelaySec"];

function fillProvider(provider) {
  const p = PROVIDERS[provider];
  $("models").innerHTML = p.models.map((m) => `<option value="${m}">`).join("");
  $("keyLink").href = p.keyUrl;
}

async function load() {
  $("provider").innerHTML = Object.entries(PROVIDERS)
    .map(([id, p]) => `<option value="${id}">${p.label}</option>`)
    .join("");
  const s = await getSettings();
  for (const f of FIELDS) $(f).value = s[f] ?? "";
  fillProvider(s.provider);
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
  chrome.runtime.sendMessage({ type: "testKey" }, (res) => {
    if (res?.ok) say(`Funcionou: o modelo respondeu "${res.data}".`);
    else say(res?.error || chrome.runtime.lastError?.message || "Falhou.", true);
  });
};

load();
