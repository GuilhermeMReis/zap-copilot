// Content script: lê a conversa aberta no WhatsApp Web, desenha o painel lateral
// e escreve/envia mensagens no campo de texto. Toda chamada de IA passa pelo background.
(() => {
  if (window.__zapCopilot) return;
  window.__zapCopilot = true;

  // ---------- Leitura do WhatsApp Web ----------
  // Os seletores do WhatsApp mudam de tempos em tempos. Se algo quebrar, é aqui que se ajusta.
  const SEL = {
    main: "#main",
    header: "#main header",
    messageRow: "#main [data-id]",
    prePlain: ".copyable-text[data-pre-plain-text]",
    text: 'span.selectable-text, [data-testid="selectable-text"]',
    composer:
      '#main footer div[contenteditable="true"], #main [data-testid="conversation-compose-box-input"], #main [data-testid="compose-box"] [contenteditable="true"]',
    sendButton:
      '#main footer button[aria-label="Send"], #main footer button[aria-label="Enviar"], #main footer span[data-icon="send"], #main footer span[data-icon="wds-ic-send-filled"]',
  };

  function getChatName() {
    const header = document.querySelector(SEL.header);
    if (!header) return null;
    const span =
      header.querySelector('[data-testid="conversation-info-header-chat-title"]') ||
      header.querySelector('span[dir="auto"]');
    return span?.textContent?.trim() || null;
  }

  // Encontra os "balões" de mensagem. O WhatsApp já usou várias estruturas,
  // então tentamos da mais específica para a mais genérica.
  function findBubbles() {
    const main = document.querySelector(SEL.main);
    if (!main) return [];
    const strategies = [
      () => main.querySelectorAll('[data-testid^="conv-msg-"]'), // layout 2026
      () => main.querySelectorAll(".message-in, .message-out"),
      () => main.querySelectorAll('[role="row"]'),
      () => main.querySelectorAll('[data-id^="true_"], [data-id^="false_"]'),
      () => main.querySelectorAll("[data-pre-plain-text]"),
    ];
    for (const s of strategies) {
      const nodes = [...s()];
      if (nodes.length) return nodes;
    }
    return [];
  }

  function bubbleDirection(el) {
    if (el.matches(".message-out") || el.querySelector(".message-out") || el.closest(".message-out")) return true;
    if (el.matches(".message-in") || el.querySelector(".message-in") || el.closest(".message-in")) return false;
    const id = el.getAttribute("data-id") || el.querySelector("[data-id]")?.getAttribute("data-id") || el.closest("[data-id]")?.getAttribute("data-id") || "";
    if (id.startsWith("true_")) return true;
    if (id.startsWith("false_")) return false;
    if (el.querySelector('[data-icon="tail-out"], [data-testid="tail-out"]')) return true;
    if (el.querySelector('[data-icon="tail-in"], [data-testid="tail-in"]')) return false;
    // Status de entrega e o rótulo de autor ("You:") só existem nas mensagens enviadas.
    const labels = [...el.querySelectorAll("[aria-label]")].map((a) => a.getAttribute("aria-label").trim());
    if (labels.some((l) => /^(You|Você|Tu):?$/i.test(l) || /^(Sent|Delivered|Read|Pending|Enviada|Entregue|Lida|Pendente)$/i.test(l)))
      return true;
    // Último recurso: balões enviados ficam alinhados à direita.
    const bubble = el.querySelector('[data-testid="msg-container"]') || el;
    const box = bubble.getBoundingClientRect();
    if (!box.width) return false;
    const mainBox = document.querySelector(SEL.main).getBoundingClientRect();
    return box.left + box.width / 2 > mainBox.left + mainBox.width / 2;
  }

  function bubbleText(el) {
    // Ignora o trecho citado (resposta a outra mensagem), que fica num bloco à parte.
    const own = [...el.querySelectorAll(SEL.text)].filter(
      (s) =>
        !s.parentElement.closest(SEL.text) && // evita contar spans aninhados duas vezes
        !s.closest('[data-testid="quoted-message"], [aria-label*="Quoted"], [aria-label*="citada"], .quoted-mention')
    );
    let text = own.map((s) => s.innerText).join(" ").trim();
    if (!text) {
      const copy = el.querySelector(".copyable-text:not([data-pre-plain-text])") || el.querySelector(".copyable-text");
      text = copy?.innerText?.trim() || "";
    }
    return text;
  }

  function getMessages(limit = 40) {
    const out = [];
    const seen = new Set();
    for (const el of findBubbles()) {
      const pre =
        el.getAttribute("data-pre-plain-text") ||
        el.querySelector("[data-pre-plain-text]")?.getAttribute("data-pre-plain-text") ||
        "";
      const isBubble =
        pre ||
        el.matches(".message-in, .message-out") ||
        el.querySelector('.message-in, .message-out, [data-testid="msg-container"]');
      if (!isBubble) continue; // separadores de data, avisos de criptografia etc.
      const id =
        el.getAttribute("data-id") ||
        el.querySelector("[data-id]")?.getAttribute("data-id") ||
        el.closest("[data-id]")?.getAttribute("data-id") ||
        `${pre}|${out.length}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const time = (pre.match(/^\[([^\]]+)\]/) || [])[1] || "";
      const text = bubbleText(el);
      out.push({ id, fromMe: bubbleDirection(el), time, text: text || "[mídia/áudio/figurinha]" });
    }
    return out.slice(-limit);
  }

  // Resumo da estrutura (sem conteúdo) para quem for abrir uma issue.
  function domReport() {
    const main = document.querySelector(SEL.main);
    const q = (s) => (main ? main.querySelectorAll(s).length : 0);
    return `#main=${!!main} in/out=${q(".message-in, .message-out")} row=${q('[role="row"]')} data-id=${q("[data-id]")} pre-plain=${q("[data-pre-plain-text]")} selectable=${q(SEL.text)}`;
  }

  function getConversation() {
    const chatName = getChatName();
    if (!chatName) throw new Error("Abra uma conversa no WhatsApp Web primeiro.");
    const messages = getMessages();
    if (!messages.length) {
      console.warn("[Zap Copilot] nenhuma mensagem lida:", domReport());
      throw new Error(`Não encontrei mensagens nesta conversa. (${domReport()})`);
    }
    return { chatName, messages };
  }

  function insertText(text) {
    const box = document.querySelector(SEL.composer);
    if (!box) throw new Error("Campo de mensagem não encontrado.");
    box.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);
  }

  function clickSend() {
    const el = document.querySelector(SEL.sendButton);
    const btn = el?.closest("button") || el;
    if (btn) return btn.click();
    const box = document.querySelector(SEL.composer);
    box?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
  }

  // ---------- Ponte com o background ----------
  function call(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res?.ok) return reject(new Error(res?.error || "Falha desconhecida"));
        resolve(res.data);
      });
    });
  }

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Lista de conversas ----------
  function listChats() {
    return [...document.querySelectorAll('#pane-side [role="row"]')].map((row) => ({
      row,
      name: row.querySelector('[data-testid="cell-frame-title"] [title]')?.getAttribute("title") || "",
      unread: !!row.querySelector('[aria-label*="unread" i], [aria-label*="não lida" i], [aria-label*="no leído" i]'),
    }));
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Abre uma conversa da lista lateral (o WhatsApp só reage a eventos de mouse completos).
  async function openChat(name) {
    if (getChatName() === name) return true;
    const chat = listChats().find((c) => c.name === name);
    if (!chat) return false;
    const el = chat.row.querySelector('[data-testid="cell-frame-container"]') || chat.row;
    const opts = { bubbles: true, cancelable: true, view: window };
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new (t.startsWith("pointer") ? PointerEvent : MouseEvent)(t, opts));
    }
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      if (getChatName() === name && getMessages().length) {
        await sleep(400); // deixa as últimas mensagens renderizarem
        return true;
      }
    }
    return false;
  }

  // ---------- Painel ----------
  const root = document.createElement("div");
  root.id = "zc-root";
  root.innerHTML = `
    <button id="zc-toggle" title="Zap Copilot">✦</button>
    <div id="zc-toast" class="zc-hidden"></div>
    <aside id="zc-panel" class="zc-hidden">
      <header>
        <strong>Zap Copilot</strong>
        <span id="zc-chat">—</span>
        <button id="zc-close" title="Fechar">×</button>
      </header>
      <section>
        <button id="zc-analyze" class="zc-primary">Analisar conversa</button>
        <div id="zc-analysis"></div>
      </section>
      <section>
        <label>Instrução extra (opcional)</label>
        <input id="zc-instruction" placeholder="ex.: oferecer desconto de 10% se fechar hoje" />
        <button id="zc-suggest" class="zc-primary">Sugerir resposta</button>
        <textarea id="zc-reply" rows="4" placeholder="A resposta sugerida aparece aqui. Você pode editar."></textarea>
        <div class="zc-row">
          <button id="zc-insert">Colocar no chat</button>
          <button id="zc-send">Enviar</button>
        </div>
      </section>
      <section>
        <label>Agendar follow-up</label>
        <div class="zc-row">
          <input id="zc-when" type="datetime-local" />
        </div>
        <input id="zc-note" placeholder="Nota do lembrete" />
        <button id="zc-schedule">Agendar</button>
      </section>
      <section>
        <label class="zc-switch"><input type="checkbox" id="zc-autopilot" /> Piloto automático nesta conversa</label>
        <p class="zc-hint">Responde sozinho às novas mensagens desta conversa, mesmo com outra aberta: quando você fica parado, o Zap Copilot abre a conversa, responde após uma contagem regressiva (dá para cancelar) e volta para onde você estava.</p>
        <ul id="zc-autolist"></ul>
      </section>
      <section>
        <label>Follow-ups pendentes</label>
        <ul id="zc-followups"></ul>
      </section>
      <footer id="zc-status"></footer>
    </aside>`;
  document.body.appendChild(root);

  const $ = (id) => root.querySelector(`#${id}`);
  const status = (msg, isError = false) => {
    $("zc-status").textContent = msg || "";
    $("zc-status").className = isError ? "zc-error" : "";
  };

  function toLocalInput(ts) {
    const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  // ---------- Estado por conversa ----------
  // Cada conversa guarda a sua análise, resposta, instrução e rascunho de follow-up.
  let chatState = {};
  let currentChat = null;
  const FORM = { instruction: "zc-instruction", reply: "zc-reply", when: "zc-when", note: "zc-note" };

  let persistTimer = null;
  function persistState() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => chrome.storage.local.set({ chatState }), 500);
  }

  function patchState(name, patch) {
    if (!name) return;
    chatState[name] = { ...(chatState[name] || {}), ...patch, updatedAt: Date.now() };
    persistState();
  }

  function saveForm() {
    if (!currentChat) return;
    patchState(
      currentChat,
      Object.fromEntries(Object.entries(FORM).map(([k, id]) => [k, $(id).value]))
    );
  }

  function renderAnalysis(a) {
    if (!a) return ($("zc-analysis").innerHTML = "");
    const list = (arr) => (arr?.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "—");
    $("zc-analysis").innerHTML = `
      <div class="zc-tags">
        <span class="zc-tag">${esc(a.etapa)}</span>
        <span class="zc-tag zc-${esc(a.temperatura)}">${esc(a.temperatura)}</span>
      </div>
      <p>${esc(a.resumo)}</p>
      <p><b>Intenção:</b> ${esc(a.intencao)}</p>
      <p><b>Objeções:</b></p>${list(a.objecoes)}
      <p><b>Script:</b> ${esc(a.passo_do_script)}</p>
      <p><b>Próxima ação:</b> ${esc(a.proxima_acao)}</p>`;
  }

  function restoreForm(name) {
    const s = (name && chatState[name]) || {};
    for (const [k, id] of Object.entries(FORM)) $(id).value = s[k] || "";
    renderAnalysis(s.analysis);
  }

  for (const id of Object.values(FORM)) $(id).addEventListener("input", saveForm);

  function syncChat() {
    const name = getChatName();
    if (name === currentChat) return;
    currentChat = name;
    $("zc-chat").textContent = name || "—";
    $("zc-autopilot").checked = !!name && autopilot.has(name);
    status("");
    restoreForm(name);
  }

  // Botões de IA: o resultado vai para a conversa em que foi pedido, mesmo se você trocar no meio.
  async function busy(button, fn) {
    button.disabled = true;
    status("Pensando…");
    try {
      await fn();
      status("");
    } catch (e) {
      status(e.message, true);
    } finally {
      button.disabled = false;
    }
  }

  // ---------- Follow-ups ----------
  async function refreshFollowups() {
    const items = (await call("listFollowups")).filter((f) => !f.done);
    $("zc-followups").innerHTML =
      items
        .map((f) => {
          const late = f.dueAt < Date.now() ? " zc-late" : "";
          return `<li class="${late}">
            <b>${esc(f.chatName)}</b> · ${new Date(f.dueAt).toLocaleString("pt-BR")}
            <small>${esc(f.note)}</small>
            <span class="zc-row">
              <button data-open="${f.id}">Abrir</button>
              <button data-use="${f.id}">Usar texto</button>
              <button data-done="${f.id}">Feito</button>
            </span>
          </li>`;
        })
        .join("") || "<li><small>Nenhum follow-up pendente.</small></li>";
    $("zc-followups").__items = items;
  }

  // ---------- Ações ----------
  $("zc-toggle").onclick = () => {
    $("zc-panel").classList.toggle("zc-hidden");
    syncChat();
    refreshFollowups().catch(() => {});
    renderAutolist();
  };
  $("zc-close").onclick = () => $("zc-panel").classList.add("zc-hidden");

  $("zc-analyze").onclick = (e) =>
    busy(e.target, async () => {
      const conversation = getConversation();
      const name = conversation.chatName;
      const a = await call("analyze", { conversation });
      const patch = { analysis: a };
      if (a.followup_em_horas > 0) {
        patch.when = toLocalInput(Date.now() + a.followup_em_horas * 3600000);
        patch.note = a.mensagem_followup || a.proxima_acao || "";
      }
      patchState(name, patch);
      if (currentChat === name) restoreForm(name);
    });

  $("zc-suggest").onclick = (e) =>
    busy(e.target, async () => {
      const conversation = getConversation();
      const name = conversation.chatName;
      const reply = await call("reply", { conversation, instruction: $("zc-instruction").value.trim() });
      patchState(name, { reply });
      if (currentChat === name) $("zc-reply").value = reply;
    });

  $("zc-insert").onclick = () => {
    try {
      insertText($("zc-reply").value);
    } catch (e) {
      status(e.message, true);
    }
  };

  $("zc-send").onclick = () => {
    try {
      if (!$("zc-reply").value.trim()) throw new Error("Nada para enviar.");
      insertText($("zc-reply").value);
      setTimeout(clickSend, 150);
      $("zc-reply").value = "";
      saveForm();
    } catch (e) {
      status(e.message, true);
    }
  };

  $("zc-schedule").onclick = (e) =>
    busy(e.target, async () => {
      const chatName = getChatName();
      if (!chatName) throw new Error("Abra uma conversa primeiro.");
      const dueAt = new Date($("zc-when").value).getTime();
      if (!dueAt || dueAt < Date.now()) throw new Error("Escolha uma data no futuro.");
      await call("addFollowup", { chatName, dueAt, note: $("zc-note").value, message: $("zc-note").value });
      $("zc-when").value = "";
      $("zc-note").value = "";
      saveForm();
      await refreshFollowups();
      status("Follow-up agendado. Você recebe uma notificação na hora.");
    });

  $("zc-followups").onclick = async (e) => {
    const items = $("zc-followups").__items || [];
    const item = (attr) => items.find((f) => f.id === e.target.getAttribute(attr));
    if (e.target.hasAttribute("data-open")) {
      const f = item("data-open");
      if (!(await openChat(f.chatName))) status(`Não achei "${f.chatName}" na lista. Procure pela busca do WhatsApp.`, true);
    }
    if (e.target.hasAttribute("data-use")) {
      const f = item("data-use");
      if (getChatName() !== f.chatName && !(await openChat(f.chatName)))
        return status(`Abra a conversa "${f.chatName}" para usar o texto.`, true);
      syncChat();
      $("zc-reply").value = f.message || "";
      saveForm();
    }
    if (e.target.hasAttribute("data-done")) {
      await call("completeFollowup", { id: e.target.getAttribute("data-done") });
      refreshFollowups();
    }
  };

  // ---------- Piloto automático ----------
  // Vale para qualquer conversa marcada, aberta ou não. Para conversas fechadas,
  // espera você ficar parado (sem digitar nem clicar) antes de abrir a conversa.
  const IDLE_MS = 15000;
  let autopilot = new Set();
  let handled = {}; // conversa -> id da última mensagem do cliente já tratada
  let apBusy = false;
  let lastUserActivity = Date.now();

  for (const t of ["keydown", "mousedown", "wheel", "touchstart"]) {
    document.addEventListener(t, (e) => e.isTrusted && (lastUserActivity = Date.now()), true);
  }

  chrome.storage.local.get(["autopilot", "autopilotHandled", "chatState"], (data) => {
    autopilot = new Set(data.autopilot || []);
    handled = data.autopilotHandled || {};
    chatState = data.chatState || {};
    currentChat = undefined;
    syncChat();
    renderAutolist();
  });

  function saveAutopilot() {
    chrome.storage.local.set({ autopilot: [...autopilot], autopilotHandled: handled });
    renderAutolist();
  }

  function renderAutolist() {
    $("zc-autolist").innerHTML = [...autopilot]
      .map((n) => `<li><span>${esc(n)}</span><button data-off="${esc(n)}" title="Desligar">×</button></li>`)
      .join("");
  }

  $("zc-autolist").onclick = (e) => {
    const name = e.target.getAttribute("data-off");
    if (!name) return;
    autopilot.delete(name);
    saveAutopilot();
    if (currentChat === name) $("zc-autopilot").checked = false;
  };

  $("zc-autopilot").onchange = (e) => {
    const name = getChatName();
    if (!name) return (e.target.checked = false);
    if (e.target.checked) {
      autopilot.add(name);
      // Não responde mensagens que já estavam na conversa quando o piloto foi ligado.
      const last = getMessages().at(-1);
      if (last) handled[name] = last.id;
    } else {
      autopilot.delete(name);
    }
    saveAutopilot();
  };

  function toast(html) {
    $("zc-toast").innerHTML = html;
    $("zc-toast").classList.toggle("zc-hidden", !html);
  }

  // Contagem regressiva visível mesmo com o painel fechado. Resolve true para enviar.
  function countdown(name, reply, seconds) {
    return new Promise((resolve) => {
      let left = seconds;
      const draw = () =>
        toast(`<p><b>Piloto automático</b> · ${esc(name)}</p>
          <blockquote>${esc(reply)}</blockquote>
          <div class="zc-row"><span>Enviando em <b>${left}</b>s</span>
          <button id="zc-cancel">Cancelar</button><button id="zc-now">Enviar já</button></div>`);
      const finish = (ok) => {
        clearInterval(timer);
        toast("");
        resolve(ok);
      };
      draw();
      root.querySelector("#zc-toast").onclick = (e) => {
        if (e.target.id === "zc-cancel") finish(false);
        if (e.target.id === "zc-now") finish(true);
      };
      const timer = setInterval(() => {
        left -= 1;
        if (getChatName() !== name) return finish(false);
        if (left <= 0) return finish(true);
        draw();
      }, 1000);
    });
  }

  function pendingIncoming(name) {
    const last = getMessages().at(-1);
    if (!last || last.fromMe || handled[name] === last.id) return null;
    return last;
  }

  async function autopilotRun(name, returnTo) {
    apBusy = true;
    try {
      if (!(await openChat(name))) return;
      const last = pendingIncoming(name);
      if (!last) return;
      const { settings } = await chrome.storage.local.get("settings");
      const reply = await call("reply", { conversation: getConversation() });
      const ok = await countdown(name, reply, Math.max(3, Number(settings?.autoSendDelaySec ?? 20)));
      handled[name] = last.id; // enviado ou cancelado: não insiste na mesma mensagem
      saveAutopilot();
      if (!ok || getChatName() !== name) return;
      insertText(reply);
      await sleep(150);
      clickSend();
      patchState(name, { lastAutoReply: reply });
      await sleep(1500);
      if (returnTo && returnTo !== name && Date.now() - lastUserActivity > 3000) await openChat(returnTo);
    } catch (e) {
      status(`Piloto automático (${name}): ${e.message}`, true);
    } finally {
      apBusy = false;
    }
  }

  function autopilotTick() {
    if (apBusy || !autopilot.size) return;
    const open = getChatName();
    // 1) Conversa aberta com mensagem nova do cliente.
    if (open && autopilot.has(open) && pendingIncoming(open)) return autopilotRun(open, null);
    // 2) Conversa marcada, mas fechada, com mensagens não lidas: só quando você está parado.
    const idle = Date.now() - lastUserActivity > IDLE_MS;
    const composer = document.querySelector(SEL.composer);
    const drafting = composer && composer.innerText.trim().length > 0;
    if (!idle || drafting) return;
    const target = listChats().find((c) => c.unread && autopilot.has(c.name) && c.name !== open);
    if (target) autopilotRun(target.name, open);
  }

  setInterval(autopilotTick, 3000);

  // ---------- Observa trocas de conversa ----------
  let debounce = null;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(syncChat, 300);
  }).observe(document.body, { childList: true, subtree: true });
})();
