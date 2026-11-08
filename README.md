# Zap Copilot

**Extensão open source para o Chrome que coloca uma IA de vendas dentro do WhatsApp Web.**
Você cola uma chave da **Groq** (tem plano gratuito) ou da **OpenAI** e a extensão passa a:

- **Analisar a conversa aberta**: resumo, etapa do funil, temperatura do lead, intenção, objeções e em que passo do seu script a conversa está.
- **Sugerir a próxima mensagem** seguindo o seu script de vendas e o seu tom de voz. Você revisa, edita e envia.
- **Agendar follow-ups com IA**: um clique e a IA propõe a data/hora e a mensagem com base no histórico (respeita pedidos como "me chama segunda"). Você aprova ou edita antes. Na hora, a mensagem é enviada sozinha, com contagem regressiva para cancelar.
- **Cadência de inatividade**: configure nas Opções uma sequência como 5 → 10 → 15 minutos. Se o lead não responder à sua última mensagem, o 1º follow-up sai em 5 min; o 2º, 10 min depois do 1º; o 3º, 15 min depois do 2º. Cada passo pode ter texto fixo (com `{nome}`) ou ser escrito pela IA a partir do histórico. Se o lead responder, a cadência para. Liga-se por conversa no painel.
- **Piloto automático (opcional, por conversa)**: responde sozinho às novas mensagens das conversas marcadas, **mesmo que estejam fechadas**. Quando você fica 15 segundos parado, o Zap Copilot abre a conversa com mensagem nova, mostra a resposta com uma contagem regressiva (Cancelar / Enviar já) e volta para a conversa em que você estava.
- **Contexto por conversa**: análise, resposta sugerida, instrução extra e rascunho de follow-up ficam guardados por conversa. Ao trocar de conversa, o painel mostra o que é daquela conversa.

Tudo roda na sua máquina. Não existe servidor do Zap Copilot: a chave, o script e os follow-ups ficam no `chrome.storage.local` do seu navegador, e o texto da conversa só vai para o provedor de IA que você escolheu, na hora em que você pede.

---

## Instalação (modo desenvolvedor, ~2 minutos)

A extensão é JavaScript puro, sem etapa de build. Basta baixar a pasta e carregar no Chrome.

### 1. Baixe o código

Com git:

```bash
git clone https://github.com/GuilhermeMReis/zap-copilot.git
```

Sem git: na página do repositório, clique em **Code → Download ZIP** e descompacte.

### 2. Carregue no Chrome

1. Abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `zap-copilot` (a que tem o `manifest.json`).
4. Fixe o ícone verde ✦ na barra do Chrome (ícone de quebra-cabeça → alfinete).

Funciona também em Edge, Brave, Arc e Opera, que usam o mesmo motor (Chromium).

### 3. Gere uma chave de API

| Provedor | Custo | Onde gerar | Modelo sugerido |
|---|---|---|---|
| **Groq** | Plano gratuito com limite de uso por minuto/dia | [console.groq.com/keys](https://console.groq.com/keys) | `openai/gpt-oss-120b` (qualidade) ou `openai/gpt-oss-20b` (rápido) |
| **OpenAI** | Pago por uso (centavos por conversa) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `gpt-4o-mini` |

Ao clicar em **Testar chave**, a extensão busca no provedor a lista de modelos que a sua chave pode usar e preenche o campo. A Groq troca de modelos com frequência (os Llama, por exemplo, foram retirados), então escolha sempre um da lista.

### 4. Configure

Clique no ícone da extensão → **Configurações** e preencha:

- **Provedor**, **modelo** e **chave de API**. Use **Testar chave** para confirmar.
- **Empresa / produto**: o que você vende e o ticket.
- **Script de vendas**: os passos da sua abordagem, ofertas, preços, condições e respostas para objeções. Quanto mais completo, melhor a resposta. A IA é instruída a nunca inventar preço ou condição que não esteja aqui.
- **Tom de voz** e o **tempo de espera** do piloto automático.

### 5. Use

1. Abra [web.whatsapp.com](https://web.whatsapp.com) e entre em uma conversa.
2. Clique no botão verde ✦ no canto inferior direito para abrir o painel.
3. **Analisar conversa** → **Sugerir resposta** → **Colocar no chat** (você confere e aperta Enter) ou **Enviar**.
4. Clique em **Agendar follow-up**: a IA sugere quando e o quê. Ajuste se quiser e clique em **Aprovar**.
5. Para a cadência, ligue **Cadência de inatividade nesta conversa** no painel (os passos ficam nas Opções).

> Depois de atualizar a extensão, dê F5 em todas as abas do WhatsApp Web.

> O piloto automático só funciona com o WhatsApp Web aberto em uma aba (pode estar em segundo plano) e só alcança conversas que aparecem na lista lateral — conversas com mensagem nova sobem para o topo, então isso cobre o caso normal.

> A extensão lê só as mensagens **carregadas na tela** da conversa aberta (as últimas 40). Para dar mais contexto, role a conversa para cima antes de analisar.

---

## Gerar o pacote `.zip`

Para distribuir para outras pessoas ou publicar na Chrome Web Store:

```bash
./scripts/package.sh
```

O arquivo sai em `dist/zap-copilot-<versão>.zip`. Quem recebe o ZIP descompacta e segue o passo 2 da instalação. A versão vem do campo `version` do `manifest.json`.

Para publicar na [Chrome Web Store](https://chrome.google.com/webstore/devconsole), envie esse mesmo ZIP no painel de desenvolvedor (taxa única de US$ 5 para criar a conta).

## Atualizar

```bash
cd zap-copilot && git pull
```

Depois, em `chrome://extensions`, clique no ícone de recarregar do Zap Copilot e dê F5 no WhatsApp Web.

---

## Como funciona

```
manifest.json          Manifest V3
src/content.js         roda dentro do web.whatsapp.com: lê a conversa, desenha o painel, escreve no campo de mensagem
src/panel.css          estilo do painel (tema escuro do WhatsApp)
src/background.js      service worker: chama a API de IA e dispara os lembretes (chrome.alarms + notifications)
src/llm.js             cliente único OpenAI/Groq (a Groq usa a mesma API da OpenAI)
src/prompts.js         prompts de análise e de resposta: edite aqui para mudar o comportamento
src/storage.js         configurações padrão, lista de provedores e modelos
src/options.*          tela de configurações
src/popup.*            menu do ícone da extensão
scripts/package.sh     gera o .zip
```

**Permissões pedidas:** `storage` (salvar configurações), `alarms` e `notifications` (follow-ups), acesso a `web.whatsapp.com`, `api.openai.com` e `api.groq.com`. Nada além disso.

### Quando o WhatsApp muda o layout

O WhatsApp Web não tem API pública e muda o HTML de vez em quando. Se o painel parar de ler mensagens ou de escrever no campo, os seletores estão concentrados no objeto `SEL` no topo de [`src/content.js`](src/content.js). Pull requests com correções são muito bem-vindos.

---

## Aviso importante

- O WhatsApp **não permite oficialmente** automação de contas pessoais. Envio automático em volume pode levar à restrição do número. O modo recomendado é o de **sugestão**: a IA escreve, você revisa e envia. Use o piloto automático em poucas conversas e com uma espera razoável.
- O texto das conversas que você analisar é enviado ao provedor de IA escolhido (Groq ou OpenAI) e segue a política de dados dele. Não use em conversas com dados sensíveis sem o consentimento de quem está do outro lado.
- Este projeto não tem relação com o WhatsApp nem com a Meta.

## Contribuindo

1. Faça um fork e crie uma branch.
2. Carregue a pasta no Chrome em modo desenvolvedor e teste no WhatsApp Web.
3. Abra um pull request descrevendo o que mudou.

Ideias de próximos passos: exportar follow-ups para CSV, vários scripts por produto, rótulos de etapa nas conversas, suporte a modelos locais via Ollama.

## Licença

[MIT](LICENSE)
