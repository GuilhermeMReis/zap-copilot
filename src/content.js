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

  function fmtDuration(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return `${m} min`;
    if (m < 60 * 24) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
    return `${Math.round(m / 1440)} dia(s)`;
  }

  // ---------- Painel ----------
  const root = document.createElement("div");
  root.id = "zc-root";
  root.innerHTML = `
    <button id="zc-toggle" title="Zap Copilot"><span>✦</span><b id="zc-badge" class="zc-hidden"></b></button>
    <div id="zc-toast" class="zc-hidden"></div>
    <aside id="zc-panel" class="zc-hidden">
      <header class="zc-head">
        <span class="zc-logo">✦</span>
        <div class="zc-title">
          <strong>Zap Copilot</strong>
          <span id="zc-chat">Abra uma conversa</span>
        </div>
        <button id="zc-settings" class="zc-icon" title="Configurações">⚙</button>
        <button id="zc-close" class="zc-icon" title="Fechar">✕</button>
      </header>
      <nav class="zc-tabs">
        <button data-tab="conversa" class="zc-on">Conversa</button>
        <button data-tab="auto">Automação</button>
        <button data-tab="agenda">Agenda</button>
      </nav>
      <div class="zc-body">
        <div class="zc-pane" data-pane="conversa">
          <div class="zc-card">
            <div class="zc-card-head">
              <h3>Raio-x da conversa</h3>
              <button id="zc-analyze" class="zc-btn zc-soft">Analisar</button>
            </div>
            <div id="zc-analysis"></div>
          </div>
          <div class="zc-card">
            <div class="zc-card-head">
              <h3>Próxima mensagem</h3>
              <button id="zc-suggest" class="zc-btn zc-soft">✦ Sugerir</button>
            </div>
            <textarea id="zc-reply" rows="4" placeholder="Clique em Sugerir: a IA escreve seguindo o seu script. Você pode editar antes de enviar."></textarea>
            <details class="zc-more">
              <summary>Orientar a IA</summary>
              <input id="zc-instruction" placeholder="ex.: oferecer 10% de desconto se fechar hoje" />
            </details>
            <div class="zc-actions">
              <button id="zc-insert" class="zc-btn zc-ghost">Colocar no chat</button>
              <button id="zc-send" class="zc-btn zc-primary">Enviar</button>
            </div>
          </div>
        </div>

        <div class="zc-pane" data-pane="auto" hidden>
          <div class="zc-card zc-toggle-row">
            <div>
              <h3>Responder sozinho</h3>
              <p>A IA responde às mensagens novas desta conversa, mesmo se ela estiver fechada. Você tem alguns segundos para cancelar.</p>
            </div>
            <label class="zc-switch"><input type="checkbox" id="zc-autopilot" /><span></span></label>
          </div>
          <div class="zc-card zc-toggle-row">
            <div>
              <h3>Follow-up se o lead sumir</h3>
              <p id="zc-cadence-info"></p>
              <button id="zc-edit-steps" class="zc-link">Editar passos</button>
            </div>
            <label class="zc-switch"><input type="checkbox" id="zc-cadence" /><span></span></label>
          </div>
          <div class="zc-card">
            <h3>Automação ligada em</h3>
            <ul id="zc-autolist" class="zc-list"></ul>
          </div>
        </div>

        <div class="zc-pane" data-pane="agenda" hidden>
          <button id="zc-fu-suggest" class="zc-btn zc-primary zc-block">✦ Agendar follow-up desta conversa</button>
          <div id="zc-fu-draft" class="zc-card zc-draft zc-hidden">
            <h3>Sugestão da IA</h3>
            <p id="zc-fu-reason" class="zc-muted"></p>
            <label>Quando</label>
            <input id="zc-fu-when" type="datetime-local" />
            <label>Mensagem</label>
            <textarea id="zc-fu-msg" rows="3"></textarea>
            <div class="zc-actions">
              <button id="zc-fu-discard" class="zc-btn zc-ghost">Descartar</button>
              <button id="zc-fu-approve" class="zc-btn zc-primary">Aprovar</button>
            </div>
          </div>
          <h4 class="zc-section">Próximos</h4>
          <ul id="zc-followups" class="zc-list"></ul>
          <h4 class="zc-section">Já enviados</h4>
          <ul id="zc-fu-history" class="zc-list"></ul>
        </div>
      </div>
      <footer id="zc-status"></footer>
    </aside>`;
  document.body.appendChild(root);

  const $ = (id) => root.querySelector(`#${id}`);
  const status = (msg, isError = false) => {
    $("zc-status").textContent = msg || "";
    $("zc-status").className = (isError ? "zc-error " : "") + (msg ? "zc-show" : "");
  };

  function toLocalInput(ts) {
    const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  // ---------- Configurações (sem a chave de API) ----------
  let settings = {};
  async function loadSettings() {
    try {
      settings = await call("getSettings");
    } catch {}
  }
  chrome.storage.onChanged.addListener((ch) => ch.settings && loadSettings().then(renderCadenceInfo));

  // ---------- Estado por conversa ----------
  // Cada conversa guarda a sua análise, resposta, instrução e rascunho de follow-up.
  let chatState = {};
  let currentChat = null;
  const FORM = { instruction: "zc-instruction", reply: "zc-reply" };

  let persistTimer = null;
  function persistState() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      chrome.storage.local.set({ chatState });
    }, 500);
  }

  function patchState(name, patch) {
    if (!name) return;
    chatState[name] = { ...(chatState[name] || {}), ...patch, updatedAt: Date.now() };
    persistState();
  }

  function saveForm() {
    if (!currentChat) return;
    patchState(currentChat, Object.fromEntries(Object.entries(FORM).map(([k, id]) => [k, $(id).value])));
  }

  function saveDraft() {
    if (!currentChat || $("zc-fu-draft").classList.contains("zc-hidden")) return;
    const s = chatState[currentChat]?.fuDraft || {};
    patchState(currentChat, {
      fuDraft: { ...s, dueAt: new Date($("zc-fu-when").value).getTime() || s.dueAt, message: $("zc-fu-msg").value },
    });
  }

  function renderAnalysis(a) {
    if (!a)
      return ($("zc-analysis").innerHTML =
        '<p class="zc-empty">Mostra a etapa do funil, a temperatura do lead, as objeções e o próximo passo.</p>');
    const chips = (arr) =>
      arr?.length ? arr.map((x) => `<span class="zc-chip">${esc(x)}</span>`).join("") : '<span class="zc-muted">nenhuma</span>';
    const temp = String(a.temperatura || "").toLowerCase();
    $("zc-analysis").innerHTML = `
      <div class="zc-tags">
        <span class="zc-tag">${esc(a.etapa)}</span>
        <span class="zc-tag zc-temp zc-${esc(temp)}">● ${esc(a.temperatura)}</span>
      </div>
      <p class="zc-summary">${esc(a.resumo)}</p>
      <dl class="zc-facts">
        <dt>Intenção</dt><dd>${esc(a.intencao)}</dd>
        <dt>Objeções</dt><dd>${chips(a.objecoes)}</dd>
        <dt>No script</dt><dd>${esc(a.passo_do_script)}</dd>
      </dl>
      <div class="zc-next"><b>Próximo passo</b>${esc(a.proxima_acao)}</div>`;
  }

  function renderDraft(d) {
    $("zc-fu-draft").classList.toggle("zc-hidden", !d);
    if (!d) return;
    $("zc-fu-reason").textContent = d.reason ? `Sugestão da IA: ${d.reason}` : "";
    $("zc-fu-when").value = d.dueAt ? toLocalInput(d.dueAt) : "";
    $("zc-fu-msg").value = d.message || "";
  }

  function restoreForm(name) {
    const s = (name && chatState[name]) || {};
    for (const [k, id] of Object.entries(FORM)) $(id).value = s[k] || "";
    renderAnalysis(s.analysis);
    renderDraft(s.fuDraft);
  }

  for (const id of Object.values(FORM)) $(id).addEventListener("input", saveForm);
  $("zc-fu-when").addEventListener("input", saveDraft);
  $("zc-fu-msg").addEventListener("input", saveDraft);

  function syncChat() {
    const name = getChatName();
    if (name === currentChat) return;
    currentChat = name;
    $("zc-chat").textContent = name || "Abra uma conversa";
    $("zc-autopilot").checked = !!name && autopilot.has(name);
    $("zc-cadence").checked = !!name && !!cadence[name]?.on;
    status("");
    restoreForm(name);
    renderCadenceInfo();
  }

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

  // ---------- Follow-ups agendados ----------
  let followups = [];
  async function refreshFollowups() {
    try {
      var all = await call("listFollowups");
      followups = all.filter((f) => !f.done);
    } catch {
      return;
    }
    const history = all
      .filter((f) => f.done)
      .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))
      .slice(0, 5);
    const when = (ts) => {
      const diff = ts - Date.now();
      const abs = new Date(ts).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      if (diff <= 0) return `<span class="zc-late-tag">na hora</span> ${abs}`;
      return `em ${fmtDuration(diff)} · ${abs}`;
    };
    $("zc-followups").innerHTML =
      followups
        .map(
          (f) => `<li class="zc-item">
            <div class="zc-item-top"><b>${esc(f.chatName)}</b><span>${when(f.dueAt)}</span></div>
            <p>${esc(f.message)}</p>
            <div class="zc-item-actions">
              <button class="zc-link" data-open="${f.id}">Abrir conversa</button>
              <button class="zc-link zc-danger" data-del="${f.id}">Cancelar</button>
            </div>
          </li>`
        )
        .join("") ||
      '<li class="zc-empty">Nada agendado. Abra uma conversa e clique em Agendar.</li>';
    if (followups.some((f) => f.dueAt <= Date.now()))
      $("zc-followups").insertAdjacentHTML(
        "beforeend",
        '<li class="zc-muted zc-note">Follow-ups na hora saem quando você fica 15s sem mexer no WhatsApp.</li>'
      );
    $("zc-fu-history").innerHTML =
      history
        .map(
          (f) => `<li class="zc-item zc-done">
            <div class="zc-item-top"><b>${esc(f.chatName)}</b><span class="zc-outcome zc-${f.outcome === "enviado" ? "ok" : "off"}">${esc(
              f.outcome || "concluído"
            )}</span></div>
            <p>${esc(f.message)}</p>
          </li>`
        )
        .join("") || '<li class="zc-empty">Nenhum ainda.</li>';
    $("zc-badge").textContent = followups.length;
    $("zc-badge").classList.toggle("zc-hidden", !followups.length);
  }

  // ---------- Ações ----------
  function setPanel(open) {
    $("zc-panel").classList.toggle("zc-hidden", !open);
    document.body.classList.toggle("zc-open", open); // a conversa encolhe em vez de ficar coberta
    try {
      localStorage.setItem("zc-open", open ? "1" : "");
    } catch {}
  }

  function setTab(tab) {
    root.querySelectorAll(".zc-tabs button").forEach((b) => b.classList.toggle("zc-on", b.dataset.tab === tab));
    root.querySelectorAll(".zc-pane").forEach((p) => (p.hidden = p.dataset.pane !== tab));
  }
  root.querySelector(".zc-tabs").onclick = (e) => e.target.dataset.tab && setTab(e.target.dataset.tab);
  $("zc-settings").onclick = () => call("openOptions");
  $("zc-edit-steps").onclick = () => call("openOptions");

  $("zc-toggle").onclick = () => {
    setPanel($("zc-panel").classList.contains("zc-hidden"));
    syncChat();
    refreshFollowups();
    renderAutolist();
    renderCadenceInfo();
  };
  $("zc-close").onclick = () => setPanel(false);

  // O resultado da IA vai para a conversa em que foi pedido, mesmo se você trocar no meio.
  $("zc-analyze").onclick = (e) =>
    busy(e.target, async () => {
      const conversation = getConversation();
      const name = conversation.chatName;
      const a = await call("analyze", { conversation });
      patchState(name, { analysis: a });
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

  // Agendar: a IA sugere data/hora e mensagem; você só aprova (ou edita antes).
  $("zc-fu-suggest").onclick = (e) =>
    busy(e.target, async () => {
      const conversation = getConversation();
      const name = conversation.chatName;
      const draft = await call("suggestFollowup", { conversation });
      patchState(name, { fuDraft: draft });
      if (currentChat === name) renderDraft(draft);
    });

  $("zc-fu-discard").onclick = () => {
    patchState(currentChat, { fuDraft: null });
    renderDraft(null);
  };

  $("zc-fu-approve").onclick = (e) =>
    busy(e.target, async () => {
      const chatName = getChatName();
      if (!chatName) throw new Error("Abra uma conversa primeiro.");
      const dueAt = new Date($("zc-fu-when").value).getTime();
      const message = $("zc-fu-msg").value.trim();
      if (!dueAt || dueAt < Date.now()) throw new Error("Escolha uma data no futuro.");
      if (!message) throw new Error("Escreva a mensagem do follow-up.");
      await call("addFollowup", { chatName, dueAt, note: message, message });
      patchState(chatName, { fuDraft: null });
      renderDraft(null);
      await refreshFollowups();
      status(`Follow-up agendado para ${new Date(dueAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. Ele é enviado sozinho na hora.`);
    });

  $("zc-followups").onclick = async (e) => {
    const id = e.target.getAttribute("data-open") || e.target.getAttribute("data-del");
    const f = followups.find((x) => x.id === id);
    if (!f) return;
    if (e.target.hasAttribute("data-open") && !(await openChat(f.chatName)))
      status(`Não achei "${f.chatName}" na lista. Procure pela busca do WhatsApp.`, true);
    if (e.target.hasAttribute("data-del")) {
      await call("deleteFollowup", { id });
      refreshFollowups();
    }
  };

  // ---------- Estado do piloto e da cadência ----------
  const IDLE_MS = 15000;
  let autopilot = new Set();
  let handled = {}; // conversa -> id da última mensagem do cliente já respondida pelo piloto
  let cadence = {}; // conversa -> { on, step, anchorAt, lastOutId }
  let jobBusy = false;
  let lastUserActivity = Date.now();

  for (const t of ["keydown", "mousedown", "wheel", "touchstart"]) {
    document.addEventListener(t, (e) => e.isTrusted && (lastUserActivity = Date.now()), true);
  }

  chrome.storage.local.get(["autopilot", "autopilotHandled", "chatState", "cadence"], async (data) => {
    autopilot = new Set(data.autopilot || []);
    handled = data.autopilotHandled || {};
    chatState = data.chatState || {};
    cadence = data.cadence || {};
    await loadSettings();
    currentChat = undefined;
    syncChat();
    renderAutolist();
    refreshFollowups();
    renderAnalysis(chatState[currentChat]?.analysis);
    try {
      if (localStorage.getItem("zc-open")) setPanel(true);
    } catch {}
  });

  // Mantém todas as abas do WhatsApp com o mesmo estado: sem isso, uma aba antiga
  // regravaria a configuração dela por cima (ex.: religar um piloto já desligado).
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch.autopilot) autopilot = new Set(ch.autopilot.newValue || []);
    if (ch.autopilotHandled) handled = ch.autopilotHandled.newValue || {};
    if (ch.cadence) cadence = ch.cadence.newValue || {};
    if (ch.chatState && !persistTimer) chatState = ch.chatState.newValue || {};
    if (ch.autopilot || ch.cadence) {
      renderAutolist();
      $("zc-autopilot").checked = !!currentChat && autopilot.has(currentChat);
      $("zc-cadence").checked = !!currentChat && !!cadence[currentChat]?.on;
      renderCadenceInfo();
    }
  });

  function saveAutopilot() {
    chrome.storage.local.set({ autopilot: [...autopilot], autopilotHandled: handled });
    renderAutolist();
  }

  function saveCadence() {
    chrome.storage.local.set({ cadence });
    renderCadenceInfo();
    renderAutolist();
  }

  function renderAutolist() {
    const names = new Set([...autopilot, ...Object.keys(cadence).filter((n) => cadence[n]?.on)]);
    $("zc-autolist").innerHTML =
      [...names]
        .map(
          (n) => `<li class="zc-auto-item"><b>${esc(n)}</b><span>
            ${autopilot.has(n) ? `<span class="zc-chip">Responde <button data-off-ap="${esc(n)}" title="Desligar">✕</button></span>` : ""}
            ${cadence[n]?.on ? `<span class="zc-chip">Follow-up <button data-off-cad="${esc(n)}" title="Desligar">✕</button></span>` : ""}
          </span></li>`
        )
        .join("") || '<li class="zc-empty">Nenhuma conversa com automação.</li>';
  }

  $("zc-autolist").onclick = (e) => {
    const ap = e.target.getAttribute("data-off-ap");
    const cad = e.target.getAttribute("data-off-cad");
    if (ap) {
      autopilot.delete(ap);
      saveAutopilot();
    }
    if (cad) {
      delete cadence[cad];
      saveCadence();
    }
    $("zc-autopilot").checked = !!currentChat && autopilot.has(currentChat);
    $("zc-cadence").checked = !!currentChat && !!cadence[currentChat]?.on;
    renderAutolist();
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

  // ---------- Cadência de inatividade ----------
  const steps = () => (Array.isArray(settings.cadence) ? settings.cadence.filter((s) => s.minutes > 0) : []);

  // Atualiza o estado da cadência olhando a conversa aberta.
  // Lead respondeu -> para. Você mandou mensagem nova -> recomeça do passo 1.
  function observeCadence(name) {
    const st = cadence[name];
    if (!st?.on) return;
    const last = getMessages().at(-1);
    if (!last) return;
    if (!last.fromMe) {
      if (st.anchorAt || st.step) Object.assign(st, { step: 0, anchorAt: null, lastOutId: null }), saveCadence();
      return;
    }
    if (last.id !== st.lastOutId) {
      Object.assign(st, { step: 0, anchorAt: Date.now(), lastOutId: last.id });
      saveCadence();
    }
  }

  function cadenceDue(name) {
    const st = cadence[name];
    const s = steps()[st?.step ?? 0];
    if (!st?.on || !st.anchorAt || !s) return false;
    return Date.now() >= st.anchorAt + s.minutes * 60000;
  }

  function renderCadenceInfo() {
    const el = $("zc-cadence-info");
    const list = steps();
    const plan = list.map((s) => `${s.minutes} min`).join(" → ") || "nenhum passo configurado";
    const st = currentChat && cadence[currentChat];
    let line = `Manda ${list.length} follow-up(s) se ele não responder: ${plan}.`;
    if (st?.on) {
      if (!st.anchorAt) line += " Começa a contar na sua próxima mensagem.";
      else if (st.step >= list.length) line += " Sequência concluída; recomeça na sua próxima mensagem.";
      else {
        const wait = st.anchorAt + list[st.step].minutes * 60000 - Date.now();
        line += ` Próximo (${st.step + 1}/${list.length}) em ${fmtDuration(wait)}.`;
      }
    }
    el.textContent = line;
  }

  $("zc-cadence").onchange = (e) => {
    const name = getChatName();
    if (!name) return (e.target.checked = false);
    if (e.target.checked) {
      const last = getMessages().at(-1);
      // Começa a contar agora se a última mensagem é sua; senão, espera a sua próxima.
      cadence[name] = {
        on: true,
        step: 0,
        anchorAt: last?.fromMe ? Date.now() : null,
        lastOutId: last?.fromMe ? last.id : null,
      };
    } else {
      delete cadence[name];
    }
    saveCadence();
  };

  function firstName(chatName) {
    if (/^[+\d\s()-]+$/.test(chatName)) return "";
    return chatName.split(/\s+/)[0];
  }

  async function cadenceText(name, index) {
    const list = steps();
    const s = list[index];
    if (s.mode === "fixed") {
      return s.text.replace(/\{nome\}/gi, firstName(name)).replace(/\s+([,.!?])/g, "$1").replace(/ {2,}/g, " ").trim();
    }
    return call("cadenceMessage", { conversation: getConversation(), step: index + 1, total: list.length });
  }

  // ---------- Envio com contagem regressiva ----------
  function toast(html) {
    $("zc-toast").innerHTML = html;
    $("zc-toast").classList.toggle("zc-hidden", !html);
  }

  // Visível mesmo com o painel fechado. Resolve true para enviar.
  function countdown(name, label, text, seconds) {
    return new Promise((resolve) => {
      let left = seconds;
      const draw = () =>
        toast(`<p><b>${esc(label)}</b> · ${esc(name)}</p>
          <blockquote>${esc(text)}</blockquote>
          <div class="zc-row"><span>Enviando em <b>${left}</b>s</span>
          <button id="zc-cancel">Cancelar</button><button id="zc-now">Enviar já</button></div>`);
      const finish = (result) => {
        clearInterval(timer);
        toast("");
        resolve(result);
      };
      draw();
      $("zc-toast").onclick = (e) => {
        if (e.target.id === "zc-cancel") finish("cancel");
        if (e.target.id === "zc-now") finish("send");
      };
      const timer = setInterval(() => {
        left -= 1;
        if (getChatName() !== name) return finish("abort");
        if (left <= 0) return finish("send");
        draw();
      }, 1000);
    });
  }

  // Resultado: "sent", "cancelled" (você cancelou) ou "aborted" (a conversa mudou ou o envio falhou; tenta de novo depois).
  async function sendWithCountdown(name, label, text) {
    if (!text?.trim()) return "cancelled";
    const r = await countdown(name, label, text, Math.max(3, Number(settings.autoSendDelaySec ?? 20)));
    if (r === "cancel") return "cancelled";
    if (r !== "send" || getChatName() !== name) return "aborted";
    insertText(text);
    await sleep(150);
    clickSend();
    // Confere que saiu: o campo esvazia quando o WhatsApp aceita o envio.
    for (let i = 0; i < 12; i++) {
      await sleep(250);
      const box = document.querySelector(SEL.composer);
      if (box && !box.innerText.trim()) return "sent";
    }
    status(`Não consegui enviar para ${name}: o botão de enviar não respondeu.`, true);
    return "aborted";
  }

  // ---------- Executor: uma tarefa por vez ----------
  // Abre a conversa (se preciso), executa a tarefa e volta para onde você estava.
  async function runJob(name, job) {
    jobBusy = true;
    const returnTo = getChatName();
    try {
      if (!(await openChat(name))) {
        status(`Não achei "${name}" na lista de conversas; tento de novo em 1 minuto.`, true);
        return false;
      }
      await job();
      return true;
    } catch (e) {
      status(`${name}: ${e.message}`, true);
      return false;
    } finally {
      if (returnTo && returnTo !== name && Date.now() - lastUserActivity > 3000) await openChat(returnTo);
      jobBusy = false;
    }
  }

  function pendingIncoming(name) {
    const last = getMessages().at(-1);
    if (!last || last.fromMe || handled[name] === last.id) return null;
    return last;
  }

  const autopilotJob = (name) => async () => {
    const last = pendingIncoming(name);
    if (!last) return;
    const reply = await call("reply", { conversation: getConversation() });
    const r = await sendWithCountdown(name, "Piloto automático", reply);
    if (r === "aborted") throw new Error("envio interrompido; tento de novo em instantes");
    handled[name] = last.id; // enviado ou cancelado: não insiste na mesma mensagem
    saveAutopilot();
    if (r === "sent") patchState(name, { lastAutoReply: reply });
  };

  const followupJob = (f) => async () => {
    const r = await sendWithCountdown(f.chatName, "Follow-up agendado", f.message);
    // Interrompido (conversa mudou, envio falhou): continua na fila e tenta de novo.
    if (r === "aborted") throw new Error("envio interrompido; tento de novo em 1 minuto");
    await call("completeFollowup", { id: f.id, outcome: r === "sent" ? "enviado" : "cancelado por você" });
    refreshFollowups();
  };

  const cadenceJob = (name) => async () => {
    observeCadence(name); // confere se o lead respondeu ou se você mandou algo novo
    if (!cadenceDue(name)) return;
    const st = cadence[name];
    const index = st.step;
    const text = await cadenceText(name, index);
    const before = getMessages().at(-1)?.id;
    const r = await sendWithCountdown(name, `Cadência ${index + 1}/${steps().length}`, text);
    if (r === "aborted") throw new Error("envio interrompido; tento de novo em 1 minuto");
    const sent = r === "sent";
    let last = getMessages().at(-1);
    // Espera a mensagem enviada aparecer para não confundi-la com uma mensagem nova sua.
    for (let i = 0; sent && i < 20 && (!last?.fromMe || last.id === before); i++) {
      await sleep(250);
      last = getMessages().at(-1);
    }
    Object.assign(st, { step: index + 1, anchorAt: Date.now(), lastOutId: sent && last?.fromMe ? last.id : st.lastOutId });
    saveCadence();
  };

  const failed = new Map(); // evita repetir em loop uma conversa que não está na lista
  const canTry = (key) => !failed.has(key) || Date.now() - failed.get(key) > 60000;

  async function tick() {
    // Extensão recarregada: este script ficou órfão nesta aba e não deve mais agir.
    if (!chrome.runtime?.id) return root.remove();
    if (jobBusy) return;
    const open = getChatName();
    if (open) observeCadence(open);
    renderCadenceInfo();

    // 1) Conversa aberta com mensagem nova do cliente e piloto ligado.
    if (open && autopilot.has(open) && pendingIncoming(open)) return runJob(open, autopilotJob(open));

    const composer = document.querySelector(SEL.composer);
    const drafting = composer && composer.innerText.trim().length > 0;

    // 2) Follow-up ou cadência da conversa que JÁ está aberta: não precisa trocar de tela,
    //    então sai na hora (só espera você não estar com rascunho no campo).
    if (open && !drafting) {
      const fOpen = followups.find((f) => f.chatName === open && f.dueAt <= Date.now() && canTry(`fu:${f.id}`));
      if (fOpen) {
        if (!(await runJob(open, followupJob(fOpen)))) failed.set(`fu:${fOpen.id}`, Date.now());
        return;
      }
      if (cadence[open]?.on && cadenceDue(open) && canTry(`cad:${open}`)) {
        if (!(await runJob(open, cadenceJob(open)))) failed.set(`cad:${open}`, Date.now());
        return;
      }
    }

    // Daqui para baixo precisa abrir outra conversa: só com você parado e sem rascunho.
    if (Date.now() - lastUserActivity < IDLE_MS || drafting) {
      const waiting =
        followups.find((f) => f.dueAt <= Date.now())?.chatName ||
        Object.keys(cadence).find((n) => cadence[n]?.on && cadenceDue(n));
      if (waiting && !$("zc-status").classList.contains("zc-error"))
        status(
          drafting
            ? `Follow-up de "${waiting}" pronto: sai quando o campo de mensagem estiver vazio.`
            : `Follow-up de "${waiting}" pronto: sai quando você ficar 15s sem mexer no WhatsApp.`
        );
      return;
    }
    if (/^Follow-up de ".*" pronto/.test($("zc-status").textContent)) status("");

    const chats = listChats();
    const unread = new Set(chats.filter((c) => c.unread).map((c) => c.name));

    // 2) Piloto em conversa fechada com mensagem não lida.
    const ap = chats.find((c) => c.unread && autopilot.has(c.name) && c.name !== open);
    if (ap) return runJob(ap.name, autopilotJob(ap.name));

    // 3) Follow-ups agendados que venceram.
    const due = followups.find((f) => f.dueAt <= Date.now() && canTry(`fu:${f.id}`));
    if (due) {
      if (!(await runJob(due.chatName, followupJob(due)))) failed.set(`fu:${due.id}`, Date.now());
      return;
    }

    // 4) Cadência de inatividade.
    for (const name of Object.keys(cadence)) {
      if (!cadence[name]?.on) continue;
      if (unread.has(name)) {
        // O lead respondeu com a conversa fechada: para a cadência.
        if (cadence[name].anchorAt) Object.assign(cadence[name], { step: 0, anchorAt: null }), saveCadence();
        continue;
      }
      if (cadenceDue(name) && canTry(`cad:${name}`)) {
        if (!(await runJob(name, cadenceJob(name)))) failed.set(`cad:${name}`, Date.now());
        return;
      }
    }
  }

  const safeTick = () => tick().catch((e) => console.warn("[Zap Copilot]", e));
  setInterval(safeTick, 3000);
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "zc-tick") refreshFollowups().then(safeTick);
  });
  setInterval(refreshFollowups, 30000);

  // ---------- Observa trocas de conversa ----------
  let debounce = null;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(syncChat, 300);
  }).observe(document.body, { childList: true, subtree: true });
})();
