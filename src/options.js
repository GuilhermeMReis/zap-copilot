import { getSettings, saveSettings, PROVIDERS } from "./storage.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["provider", "model", "apiKey", "sellerName", "businessName", "salesScript", "tone", "autoSendDelaySec"];

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
  steps = (s.cadence || []).map((x) => ({ ...x }));
  renderSteps();
  fillProvider(s.provider);
  if (s.apiKey) refreshModels();
}

$("provider").onchange = (e) => {
  fillProvider(e.target.value);
  $("model").value = PROVIDERS[e.target.value].models[0];
};

// ---------- Editor da cadência ----------
let steps = [];

function renderSteps() {
  $("cadence").innerHTML = steps
    .map(
      (s, i) => `
    <div class="step" data-i="${i}">
      <div class="step-head">
        <b>Passo ${i + 1}</b>
        <span>enviar após</span>
        <input type="number" min="1" data-k="minutes" value="${s.minutes}" />
        <span class="grow">minutos ${i === 0 ? "sem resposta à sua última mensagem" : "do passo anterior"}</span>
        <select data-k="mode">
          <option value="ai"${s.mode === "ai" ? " selected" : ""}>IA escreve pelo histórico</option>
          <option value="fixed"${s.mode === "fixed" ? " selected" : ""}>Texto fixo</option>
        </select>
        <button type="button" class="remove" data-remove="${i}" title="Remover passo">Remover</button>
      </div>
      ${
        s.mode === "fixed"
          ? `<textarea data-k="text" placeholder="ex.: Oi {nome}, conseguiu ver minha última mensagem?">${s.text
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")}</textarea>`
          : ""
      }
    </div>`
    )
    .join("");
}

$("cadence").addEventListener("input", (e) => {
  const i = Number(e.target.closest(".step")?.dataset.i);
  const k = e.target.dataset.k;
  if (Number.isNaN(i) || !k) return;
  steps[i][k] = k === "minutes" ? Math.max(1, Number(e.target.value) || 1) : e.target.value;
  if (k === "mode") renderSteps();
});
$("cadence").addEventListener("change", (e) => e.target.dataset.k === "mode" && renderSteps());
$("cadence").addEventListener("click", (e) => {
  if (!e.target.dataset.remove) return;
  steps.splice(Number(e.target.dataset.remove), 1);
  renderSteps();
});
$("addStep").onclick = () => {
  const last = steps.at(-1)?.minutes || 5;
  steps.push({ minutes: last + 5, mode: "ai", text: "" });
  renderSteps();
};

function say(text, err = false) {
  $("msg").textContent = text;
  $("msg").className = err ? "err" : "";
}

async function save() {
  const patch = Object.fromEntries(FIELDS.map((f) => [f, $(f).value]));
  patch.apiKey = patch.apiKey.trim();
  patch.autoSendDelaySec = Number(patch.autoSendDelaySec) || 20;
  const bad = steps.findIndex((s) => s.mode === "fixed" && !s.text.trim());
  if (bad >= 0) throw new Error(`O passo ${bad + 1} está como texto fixo, mas sem texto.`);
  patch.cadence = steps.map((s) => ({ minutes: Number(s.minutes), mode: s.mode, text: s.text || "" }));
  await saveSettings(patch);
}

$("save").onclick = async () => {
  try {
    await save();
    say("Salvo.");
  } catch (e) {
    say(e.message, true);
  }
};

$("test").onclick = async () => {
  try {
    await save();
  } catch (e) {
    return say(e.message, true);
  }
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
