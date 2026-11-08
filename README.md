# Zap Copilot

**Extensão open source para o Chrome que coloca uma IA de vendas dentro do WhatsApp Web.**
Você cola uma chave da **Groq** (tem plano gratuito) ou da **OpenAI** e a extensão passa a:

- **Analisar a conversa aberta**: resumo, etapa do funil, temperatura do lead, intenção, objeções e em que passo do seu script a conversa está.
- **Sugerir a próxima mensagem** seguindo o seu script de vendas e o seu tom de voz. Você revisa, edita e envia.
- **Agendar follow-ups** com lembrete por notificação do Chrome. A análise já sugere quando retomar e o texto da mensagem.
- **Piloto automático (opcional, por conversa)**: responde sozinho às novas mensagens do cliente, com uma contagem regressiva para você cancelar antes do envio.

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
| **Groq** | Plano gratuito com limite de uso por minuto/dia | [console.groq.com/keys](https://console.groq.com/keys) | `llama-3.3-70b-versatile` (qualidade) ou `llama-3.1-8b-instant` (rápido) |
| **OpenAI** | Pago por uso (centavos por conversa) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `gpt-4o-mini` |

O campo de modelo aceita qualquer nome; se o provedor lançar um modelo novo, é só digitar.

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
4. Em **Agendar follow-up**, escolha a data (a análise já preenche uma sugestão) e clique em **Agendar**. Na hora você recebe uma notificação; o lembrete aparece na lista do painel com o botão **Usar texto**.

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
