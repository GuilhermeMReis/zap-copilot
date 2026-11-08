// Prompts do copiloto. Edite à vontade — é aqui que mora a "inteligência" de vendas.

function transcript(conversation) {
  return conversation.messages
    .map((m) => `[${m.time || "--"}] ${m.fromMe ? "VENDEDOR" : "CLIENTE"}: ${m.text}`)
    .join("\n");
}

function context(settings, conversation) {
  return (
    `Vendedor: ${settings.sellerName || "(não informado)"}\n` +
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

const NAME_RULES =
  "Nunca invente links, URLs, telefones ou e-mails: use só os que estiverem no script ou na conversa. " +
  "Nunca invente nomes: use o nome do vendedor só se ele estiver informado (senão não se apresente pelo nome) " +
  "e só chame o cliente pelo nome se o nome do contato parecer um nome de pessoa, nunca um número de telefone. ";

export function followupPrompt(settings, conversation) {
  return [
    {
      role: "system",
      content:
        "Você é um vendedor experiente planejando o próximo follow-up desta conversa de WhatsApp. " +
        "Decida QUANDO retomar o contato e escreva a mensagem. Responda APENAS com JSON com as chaves: " +
        '"em_minutos" (número inteiro: daqui a quantos minutos enviar; mínimo 5; use horas ou dias quando fizer sentido, ' +
        "respeitando o que o cliente pediu, como \"me chama amanhã\" ou \"semana que vem\", e evite madrugada), " +
        '"mensagem" (string: a mensagem pronta, curta, natural, que retome o ponto onde a conversa parou), ' +
        '"motivo" (string curta: por que esse momento e essa mensagem). ' +
        `Tom: ${settings.tone}. Português do Brasil, sem markdown. ` +
        NAME_RULES +
        "Nunca invente preço, prazo ou condição que não esteja no script.",
    },
    { role: "user", content: context(settings, conversation) },
  ];
}

export function cadencePrompt(settings, conversation, step, total) {
  return [
    {
      role: "system",
      content:
        `O cliente parou de responder. Escreva o follow-up de inatividade número ${step} de ${total}. ` +
        "Leia o histórico e retome o ponto exato onde a conversa parou, com uma pergunta simples que facilite a resposta. " +
        "Não repita mensagens que o vendedor já mandou, não cobre o cliente nem soe insistente; " +
        (step === total ? "como é o último, deixe a porta aberta de forma leve. " : "") +
        `Tom: ${settings.tone}. Português do Brasil, sem markdown, sem aspas, no máximo 2 frases curtas. ` +
        NAME_RULES +
        "Nunca invente preço, prazo ou condição que não esteja no script. Responda só com o texto da mensagem.",
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
        "Nunca invente links, URLs, telefones ou e-mails: use só os que estiverem no script ou na conversa. " +
        "Nunca invente nomes: use o nome do vendedor só se ele estiver informado (senão não se apresente pelo nome) " +
        "e só chame o cliente pelo nome se o nome do contato parecer um nome de pessoa, nunca um número de telefone. " +
        "Se a conversa já começou, não se reapresente. " +
        "Responda só com o texto da mensagem.",
    },
    {
      role: "user",
      content: context(settings, conversation) + (instruction ? `\n\nINSTRUÇÃO EXTRA DO VENDEDOR: ${instruction}` : ""),
    },
  ];
}
