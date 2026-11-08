// Tudo fica em chrome.storage.local — nada sai da máquina além das chamadas
// ao provedor de LLM que o próprio usuário configurou.

export const DEFAULT_SETTINGS = {
  provider: "groq", // "groq" | "openai"
  apiKey: "",
  model: "openai/gpt-oss-120b",
  businessName: "",
  salesScript:
    "1. Cumprimente pelo nome e se apresente.\n" +
    "2. Descubra a dor principal com uma pergunta aberta.\n" +
    "3. Conecte a dor ao benefício do produto.\n" +
    "4. Trate objeções com empatia e prova.\n" +
    "5. Proponha um próximo passo claro (call, proposta ou link de pagamento).",
  tone: "consultivo, próximo e objetivo; mensagens curtas como no WhatsApp",
  autoSendDelaySec: 20,
};

export const PROVIDERS = {
  groq: {
    label: "Groq (tier gratuito)",
    baseUrl: "https://api.groq.com/openai/v1",
    // Lista de reserva; a tela de opções busca a lista atual em /models com a sua chave.
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
    keyUrl: "https://console.groq.com/keys",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1-nano"],
    keyUrl: "https://platform.openai.com/api-keys",
  },
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getFollowups() {
  const { followups } = await chrome.storage.local.get("followups");
  return followups || [];
}

export async function saveFollowups(list) {
  await chrome.storage.local.set({ followups: list });
}
