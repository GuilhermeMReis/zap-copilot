// Chat de teste da página de Configurações. Você escreve como o lead e a IA responde
// como vendedor, com os MESMOS prompts usados no WhatsApp e com o que está nos campos
// agora (mesmo sem salvar). Nada é enviado para ninguém: só a chamada à IA sai do navegador.
import { chat } from "./llm.js";
import { analyzePrompt, replyPrompt, followupPrompt, cadencePrompt } from "./prompts.js";

const STORE = "zc-testchat";

export function initTestChat(readSettings) {
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hhmm = (d = new Date()) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // ---------- Estado ----------
  let st = { messages: [], cadence: { step: 0, anchorAt: null }, followup: null };
  try {
    st = { ...st, ...JSON.parse(localStorage.getItem(STORE) || "{}") };
  } catch {}
  const persist = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(st));
    } catch {}
  };

  let typing = false;
  const unit = () => ($("tc-fast").checked ? 1000 : 60000); // duração de "1 minuto"
  const leadName = () => $("tc-lead").value.trim() || "Lead";
  const conversation = () => ({ chatName: leadName(), messages: st.messages.filter((m) => m.kind !== "sys") });

  // ---------- Desenho ----------
  function render() {
    const box = $("tc-msgs");
    if (!st.messages.length) {
      box.innerHTML = `<div class="tc-empty"><b>Converse como se fosse o lead.</b><br />Ex.: “oi, vi o anúncio, quanto custa?”. A IA responde seguindo o script ao lado. Mude o script e teste de novo.</div>`;
    } else {
      box.innerHTML = st.messages
        .map((m) => {
          if (m.kind === "sys") return m.html;
          return `<div class="m ${m.fromMe ? "out" : "in"}">${esc(m.text)}<div class="meta">${
            m.tag ? `<span class="tag">${esc(m.tag)}</span>` : ""
          }<span>${esc(m.time)}</span></div></div>`;
        })
        .join("");
    }
    if (typing) box.insertAdjacentHTML("beforeend", '<div class="typing">digitando…</div>');
    box.scrollTop = box.scrollHeight;
    $("tc-av").textContent = (leadName()[0] || "L").toUpperCase();
  }

  function add(msg) {
    st.messages.push({ id: crypto.randomUUID(), time: hhmm(), ...msg });
    persist();
    render();
  }

  function sys(html) {
    add({ kind: "sys", html: `<div class="sys">${html}</div>` });
  }

  function error(e) {
    add({ kind: "sys", html: `<div class="tc-err">${esc(e.message || e)}</div>` });
  }

  async function withTyping(fn) {
    typing = true;
    render();
    try {
      return await fn();
    } finally {
      typing = false;
      render();
    }
  }

  // ---------- Mensagens ----------
  // Toda mensagem do vendedor reinicia a contagem da cadência; toda mensagem do lead a para.
  function sellerSays(text, tag) {
    add({ fromMe: true, text, tag });
    st.cadence = { step: tag?.startsWith("Cadência") ? st.cadence.step : 0, anchorAt: Date.now() };
    persist();
  }

  // Lê os campos e avisa no próprio chat se faltar a chave.
  function settingsOrThrow() {
    const s = readSettings();
    if (!s.apiKey) throw new Error("Cole a sua chave de API no item 1 (Conexão com a IA) para testar.");
    return s;
  }

  async function aiReply() {
    const s = settingsOrThrow();
    const text = await withTyping(() => chat(s, replyPrompt(s, conversation()), { temperature: 0.6 }));
    sellerSays(text, "IA");
  }

  async function send() {
    const text = $("tc-input").value.trim();
    if (!text) return;
    $("tc-input").value = "";
    if ($("tc-as").value === "me") return sellerSays(text);
    add({ fromMe: false, text });
    st.cadence = { step: 0, anchorAt: null };
    persist();
    if ($("tc-auto").checked) {
      try {
        await aiReply();
      } catch (e) {
        error(e);
      }
    }
  }

  $("tc-send").onclick = send;
  $("tc-input").addEventListener("keydown", (e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send()));
  $("tc-as").onchange = () =>
    ($("tc-input").placeholder =
      $("tc-as").value === "me" ? "Escreva como vendedor (você)…" : "Escreva como o lead… ex.: oi, quanto custa?");
  $("tc-lead").addEventListener("input", render);

  $("tc-reset").onclick = () => {
    st = { messages: [], cadence: { step: 0, anchorAt: null }, followup: null };
    persist();
    render();
    $("tc-input").focus();
  };

  async function busy(btn, fn) {
    btn.disabled = true;
    try {
      await fn();
    } catch (e) {
      error(e);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Ferramentas ----------
  $("tc-suggest").onclick = (e) =>
    busy(e.target, async () => {
      if (!st.messages.length) throw new Error("Mande uma mensagem como lead primeiro.");
      await aiReply();
    });

  $("tc-analyze").onclick = (e) =>
    busy(e.target, async () => {
      if (!st.messages.length) throw new Error("Converse um pouco antes de analisar.");
      const s = settingsOrThrow();
      const a = await chat(s, analyzePrompt(s, conversation()), { json: true, temperature: 0.2 });
      sys(`<h4>Raio-x da conversa</h4>
        <div class="tags"><span>${esc(a.etapa)}</span><span>● ${esc(a.temperatura)}</span></div>
        <p>${esc(a.resumo)}</p>
        <p><b>Objeções:</b> ${esc((a.objecoes || []).join(", ") || "nenhuma")}</p>
        <p><b>No script:</b> ${esc(a.passo_do_script)}</p>
        <p><b>Próximo passo:</b> ${esc(a.proxima_acao)}</p>`);
    });

  $("tc-followup").onclick = (e) =>
    busy(e.target, async () => {
      if (!st.messages.length) throw new Error("Converse um pouco antes de agendar.");
      const s = settingsOrThrow();
      const r = await chat(s, followupPrompt(s, conversation()), { json: true, temperature: 0.4 });
      const minutes = Math.max(5, Math.round(Number(r.em_minutos) || 1440));
      const id = crypto.randomUUID().slice(0, 8);
      sys(`<h4>Follow-up sugerido pela IA</h4>
        <p>${esc(r.motivo || "")}</p>
        <p><b>Quando:</b> daqui a ${minutes} min ${$("tc-fast").checked ? `(no teste: ${minutes} s)` : ""}</p>
        <textarea id="fu-${id}" rows="3">${esc(r.mensagem || "")}</textarea>
        <div class="row2"><button class="btn ghost small" data-fu-discard="${id}">Descartar</button><button class="btn primary small" data-fu-ok="${id}" data-min="${minutes}">Aprovar</button></div>`);
    });

  // Botões dentro dos cartões (Aprovar/Descartar follow-up).
  $("tc-msgs").addEventListener("click", (e) => {
    const ok = e.target.dataset.fuOk;
    const discard = e.target.dataset.fuDiscard;
    if (!ok && !discard) return;
    const card = e.target.closest(".sys");
    if (discard) {
      card.querySelector(".row2").outerHTML = "<p><i>Descartado.</i></p>";
    } else {
      const text = card.querySelector("textarea").value.trim();
      const minutes = Number(e.target.dataset.min);
      st.followup = { text, dueAt: Date.now() + minutes * unit() };
      card.querySelector(".row2").outerHTML = `<p><i>Aprovado: sai em ${minutes} ${unit() === 1000 ? "s" : "min"}.</i></p>`;
    }
    // Salva o cartão no estado com a decisão tomada.
    const idx = st.messages.findIndex((m) => m.kind === "sys" && m.html.includes(ok || discard));
    if (idx >= 0) st.messages[idx].html = card.outerHTML;
    persist();
  });

  // ---------- Relógio: follow-up agendado e cadência ----------
  let running = false;
  async function tick() {
    if (running || typing) return;
    const timer = $("tc-timer");
    const now = Date.now();
    const s = readSettings();
    const steps = (s.cadence || []).filter((x) => x.minutes > 0);
    const last = conversation().messages.at(-1);

    // Follow-up aprovado.
    if (st.followup && now >= st.followup.dueAt) {
      const text = st.followup.text;
      st.followup = null;
      sellerSays(text, "Follow-up");
      return;
    }

    // Cadência: só corre quando a última mensagem é do vendedor.
    const cad = st.cadence;
    const step = steps[cad.step];
    const cadOn = $("tc-cadence").checked && last?.fromMe && cad.anchorAt && step;
    const lines = [];
    if (st.followup) lines.push(`Follow-up agendado em ${Math.ceil((st.followup.dueAt - now) / 1000)} s`);
    if (cadOn) {
      const due = cad.anchorAt + step.minutes * unit();
      if (now >= due) {
        running = true;
        try {
          const text =
            step.mode === "fixed"
              ? step.text.replace(/\{nome\}/gi, leadName().split(/\s+/)[0]).trim()
              : await withTyping(() => chat(s, cadencePrompt(s, conversation(), cad.step + 1, steps.length), { temperature: 0.7 }));
          const n = cad.step + 1;
          add({ fromMe: true, text, tag: `Cadência ${n}/${steps.length}` });
          st.cadence = { step: n, anchorAt: Date.now() };
          persist();
        } catch (e) {
          error(e);
          $("tc-cadence").checked = false;
        } finally {
          running = false;
        }
        return;
      }
      lines.push(`Cadência ${cad.step + 1}/${steps.length} em ${Math.ceil((due - now) / 1000)} s se o lead não responder`);
    } else if ($("tc-cadence").checked && last?.fromMe && cad.step >= steps.length && steps.length) {
      lines.push("Cadência concluída. Responda como lead para recomeçar.");
    }
    timer.hidden = !lines.length;
    timer.textContent = lines.join(" · ");
  }

  setInterval(() => tick().catch(() => {}), 500);
  render();
}
