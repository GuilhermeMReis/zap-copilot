// Cliente único para OpenAI e Groq (a Groq expõe uma API compatível com a da OpenAI).
import { PROVIDERS } from "./storage.js";

// Modelos de chat disponíveis para a chave (filtra áudio, TTS e guardrails).
export async function listModels(settings) {
  const provider = PROVIDERS[settings.provider];
  if (!settings.apiKey) throw new Error("Configure a sua chave de API.");
  const res = await fetch(`${provider.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${settings.apiKey}` },
  });
  if (!res.ok) throw new Error(`Erro ${res.status} ao listar modelos. Confira a chave.`);
  const { data } = await res.json();
  const skip = /whisper|tts|orpheus|guard|safeguard|embedding|dall-e|image|audio|realtime|transcribe|moderation|search/i;
  return data.map((m) => m.id).filter((id) => !skip.test(id)).sort();
}

export async function chat(settings, messages, { json = false, temperature = 0.4 } = {}) {
  const provider = PROVIDERS[settings.provider];
  if (!provider) throw new Error(`Provedor desconhecido: ${settings.provider}`);
  if (!settings.apiKey) throw new Error("Configure a sua chave de API nas opções da extensão.");

  const body = { model: settings.model, messages, temperature };
  if (json) body.response_format = { type: "json_object" };

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error?.message || "";
    } catch {}
    if (res.status === 404 && /model/i.test(detail)) {
      detail += " Abra as Configurações e escolha um modelo da lista (ela vem do provedor).";
    }
    throw new Error(`Erro ${res.status} do provedor ${provider.label}. ${detail}`.trim());
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!json) return content.trim();
  try {
    return JSON.parse(content);
  } catch {
    // Alguns modelos embrulham o JSON em ```json ... ```
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("O modelo não devolveu JSON válido.");
  }
}
