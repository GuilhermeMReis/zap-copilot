// Cliente único para OpenAI e Groq (a Groq expõe uma API compatível com a da OpenAI).
import { PROVIDERS } from "./storage.js";

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
