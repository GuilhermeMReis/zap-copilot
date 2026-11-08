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
    text: "span.selectable-text",
    composer: '#main footer div[contenteditable="true"]',
    sendButton:
      '#main footer button[aria-label="Send"], #main footer button[aria-label="Enviar"], #main footer span[data-icon="send"], #main footer span[data-icon="wds-ic-send-filled"]',
  };

  function getChatName() {
    const header = document.querySelector(SEL.header);
    if (!header) return null;
    const span = header.querySelector('span[dir="auto"]');
    return span?.textContent?.trim() || null;
  }

  function getMessages(limit = 40) {
    const seen = new Set();
    const out = [];
    for (const row of document.querySelectorAll(SEL.messageRow)) {
      const id = row.getAttribute("data-id") || "";
      if (!/^(true|false)_/.test(id) || seen.has(id)) continue;
      seen.add(id);
      const pre = row.querySelector(SEL.prePlain)?.getAttribute("data-pre-plain-text") || "";
      const time = (pre.match(/^\[([^\]]+)\]/) || [])[1] || "";
      const text = [...row.querySelectorAll(SEL.text)].map((s) => s.innerText).join(" ").trim();
      out.push({ id, fromMe: id.startsWith("true_"), time, text: text || "[mídia/áudio/figurinha]" });
    }
    return out.slice(-limit);
  }

  function getConversation() {
    const chatName = getChatName();
    if (!chatName) throw new Error("Abra uma conversa no WhatsApp Web primeiro.");
    const messages = getMessages();
    if (!messages.length) throw new Error("Não encontrei mensagens nesta conversa.");
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

  // ---------- Painel ----------
  const root = document.createElement("div");
  root.id = "zc-root";
  root.innerHTML = `
    <button id="zc-toggle" title="Zap Copilot">✦</button>
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
        <p class="zc-hint">Responde sozinho às novas mensagens do cliente com o seu script, após uma contagem regressiva que você pode cancelar. Use com cuidado.</p>
        <div id="zc-countdown"></div>
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

  function toLocalInput(ts) {
    const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  function renderAnalysis(a) {
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
    if (a.followup_em_horas > 0) {
      $("zc-when").value = toLocalInput(Date.now() + a.followup_em_horas * 3600000);
      $("zc-note").value = a.mensagem_followup || a.proxima_acao || "";
    }
  }

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
  };
  $("zc-close").onclick = () => $("zc-panel").classList.add("zc-hidden");

  $("zc-analyze").onclick = (e) =>
    busy(e.target, async () => renderAnalysis(await call("analyze", { conversation: getConversation() })));

  $("zc-suggest").onclick = (e) =>
    busy(e.target, async () => {
      $("zc-reply").value = await call("reply", {
        conversation: getConversation(),
        instruction: $("zc-instruction").value.trim(),
      });
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
      await refreshFollowups();
      status("Follow-up agendado. Você recebe uma notificação na hora.");
    });

  $("zc-followups").onclick = async (e) => {
    const items = $("zc-followups").__items || [];
    const useId = e.target.getAttribute("data-use");
    const doneId = e.target.getAttribute("data-done");
    if (useId) $("zc-reply").value = items.find((f) => f.id === useId)?.message || "";
    if (doneId) {
      await call("completeFollowup", { id: doneId });
      refreshFollowups();
    }
  };

  // ---------- Piloto automático ----------
  let autopilot = new Set();
  const handled = new Map(); // chatName -> id da última mensagem do cliente já tratada
  let countdownTimer = null;

  chrome.storage.local.get("autopilot", ({ autopilot: list }) => {
    autopilot = new Set(list || []);
    syncChat();
  });

  $("zc-autopilot").onchange = (e) => {
    const name = getChatName();
    if (!name) return (e.target.checked = false);
    e.target.checked ? autopilot.add(name) : autopilot.delete(name);
    chrome.storage.local.set({ autopilot: [...autopilot] });
    // Não responde mensagens que já estavam na tela quando o piloto foi ligado.
    const last = getMessages().at(-1);
    if (last) handled.set(name, last.id);
  };

  function cancelCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = null;
    $("zc-countdown").innerHTML = "";
  }

  async function maybeAutoReply() {
    const name = getChatName();
    if (!name || !autopilot.has(name) || countdownTimer) return;
    const last = getMessages().at(-1);
    if (!last || last.fromMe || handled.get(name) === last.id) return;
    handled.set(name, last.id);

    try {
      const { settings } = await chrome.storage.local.get("settings");
      const reply = await call("reply", { conversation: getConversation() });
      let left = Math.max(3, Number(settings?.autoSendDelaySec ?? 20));
      $("zc-countdown").innerHTML = `<p>Enviando em <b id="zc-left">${left}</b>s:</p>
        <blockquote>${esc(reply)}</blockquote><button id="zc-cancel">Cancelar</button>`;
      $("zc-cancel").onclick = cancelCountdown;
      countdownTimer = setInterval(() => {
        left -= 1;
        const el = root.querySelector("#zc-left");
        if (el) el.textContent = left;
        if (left > 0) return;
        cancelCountdown();
        if (getChatName() !== name) return status("Conversa mudou; envio automático cancelado.", true);
        insertText(reply);
        setTimeout(clickSend, 150);
      }, 1000);
    } catch (e) {
      status(e.message, true);
    }
  }

  // ---------- Observa trocas de conversa e mensagens novas ----------
  let currentChat = null;
  function syncChat() {
    const name = getChatName();
    if (name === currentChat) return;
    currentChat = name;
    cancelCountdown();
    $("zc-chat").textContent = name || "—";
    $("zc-autopilot").checked = !!name && autopilot.has(name);
    $("zc-analysis").innerHTML = "";
    $("zc-reply").value = "";
    if (name && !handled.has(name)) {
      const last = getMessages().at(-1);
      if (last) handled.set(name, last.id);
    }
  }

  let debounce = null;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      syncChat();
      maybeAutoReply();
    }, 800);
  }).observe(document.body, { childList: true, subtree: true });
})();
