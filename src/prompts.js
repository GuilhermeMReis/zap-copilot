// Prompts do copiloto. Edite à vontade — é aqui que mora a "inteligência" de vendas.

function transcript(conversation) {
  return conversation.messages
    .map((m) => `[${m.time || "--"}] ${m.fromMe ? "VENDEDOR" : "CLIENTE"}: ${m.text}`)
    .join("\n");
}

function context(settings, conversation) {
  return (
    `Empresa: ${settings.businessName || "(não informado)"}\n` +
    `Contato: ${conversation.chatName}\n` +
    `Data/hora atual: ${new Date().toLocaleString("pt-BR")}\n\n` +
    `SCRIPT DE VENDAS:\n${settings.salesScript}\n\n` +
    `CONVERSA (mais antiga primeiro):\n${transcript(conversation)}`
  );
}

export function analyzePrompt(settings, conversation) {
  return [
    {
      role: "system",
      content:
        "Você é um analista de vendas sênior. Analise a conversa de WhatsApp entre um vendedor e um cliente " +
        "e responda APENAS com um objeto JSON com as chaves: " +
        '"resumo" (string, 2 frases), ' +
        '"etapa" (uma de: "prospecção", "descoberta", "apresentação", "objeção", "negociação", "fechamento", "pós-venda", "perdido"), ' +
        '"temperatura" (uma de: "frio", "morno", "quente"), ' +
        '"intencao" (string curta), ' +
        '"objecoes" (array de strings), ' +
        '"passo_do_script" (string: em qual passo do script a conversa está e o que falta), ' +
        '"proxima_acao" (string), ' +
        '"followup_em_horas" (número: em quantas horas fazer follow-up se o cliente não responder; 0 se não precisa), ' +
        '"mensagem_followup" (string: mensagem pronta para o follow-up).',
    },
    { role: "user", content: context(settings, conversation) },
  ];
}

export function replyPrompt(settings, conversation, instruction = "") {
  return [
    {
      role: "system",
      content:
        "Você é o vendedor nesta conversa de WhatsApp. Escreva a PRÓXIMA mensagem do vendedor, " +
        "seguindo o script de vendas e avançando a conversa para o próximo passo. " +
        `Tom: ${settings.tone}. ` +
        "Regras: português do Brasil, sem markdown, sem aspas, no máximo 3 frases curtas, " +
        "nunca invente preço, prazo ou condição que não esteja no script. " +
        "Responda só com o texto da mensagem.",
    },
    {
      role: "user",
      content: context(settings, conversation) + (instruction ? `\n\nINSTRUÇÃO EXTRA DO VENDEDOR: ${instruction}` : ""),
    },
  ];
}
