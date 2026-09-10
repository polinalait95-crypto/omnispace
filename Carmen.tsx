import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ChatSession, type ChatMessage } from "./api";
import { respond, type CardMeta } from "./carmen";

const rub = (m: number) => (m / 100).toLocaleString("ru", { maximumFractionDigits: 0 }) + " ₽";

export default function Carmen({ onGoto, toast }: { onGoto: (v: "tasks" | "fin" | "subs" | "cal") => void; toast: (t: string) => void }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    const s = await api.listSessions();
    setSessions(s);
    if (!active && s.length) setActive(s[0].id);
  }, [active]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const loadMsgs = useCallback(async (id: string) => setMsgs(await api.listMessages(id)), []);
  useEffect(() => { if (active) loadMsgs(active); else setMsgs([]); }, [active, loadMsgs]);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [msgs, busy]);

  async function newChat() {
    const s = await api.createSession();
    await loadSessions();
    setActive(s.id);
    setMsgs([]);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);

    let sid = active;
    if (!sid) { const s = await api.createSession(); sid = s.id; setActive(sid); }

    await api.addMessage(sid, "user", text);
    await loadMsgs(sid);

    const reply = await respond(text);
    await api.addMessage(sid, "assistant", reply.content, JSON.stringify(reply.meta));
    await loadMsgs(sid);
    await loadSessions();
    setBusy(false);
    if (reply.meta.card === "task") toast("Задача создана");
  }

  return (
    <div className="carmen">
      {/* список диалогов */}
      <div className="chat-list">
        <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginBottom: 12 }} onClick={newChat}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5v14" /></svg>Новый диалог
        </button>
        {sessions.map((s) => (
          <div key={s.id} className={"cl-item" + (active === s.id ? " on" : "")} onClick={() => setActive(s.id)}>
            <b>{s.title || "Новый диалог"}</b>
            <small>{new Date(s.updated_at).toLocaleDateString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
          </div>
        ))}
      </div>

      {/* сообщения */}
      <div className="chat-main">
        <div className="chat-scroll" ref={scrollRef}>
          <div className="msg-wrap">
            {msgs.length === 0 && !busy && (
              <div style={{ color: "var(--faint)", fontSize: 14, textAlign: "center", padding: "60px 0", lineHeight: 1.7 }}>
                Напишите словами, что нужно.<br />«купил кофе 350», «напомни завтра позвонить», «покажи финансы за месяц».
              </div>
            )}
            {msgs.map((m) => (
              <Message key={m.id} msg={m} onGoto={onGoto} />
            ))}
            {busy && (
              <div className="msg">
                <div className="mav c">C</div>
                <div className="mbody"><div className="mname">Carmen</div><span style={{ color: "var(--faint)" }}>думает…</span></div>
              </div>
            )}
          </div>
        </div>

        <div className="composer">
          <div className="composer-inner">
            <div className="input-box">
              <textarea
                value={input}
                rows={1}
                placeholder="Спросите Carmen или дайте команду…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <button className="send" onClick={send}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
              </button>
            </div>
            <div className="disclaimer">Работает локально на вашем Маке. Данные не покидают устройство.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ msg, onGoto }: { msg: ChatMessage; onGoto: (v: "tasks" | "fin" | "subs" | "cal") => void }) {
  const isUser = msg.role === "user";
  let meta: CardMeta = { card: "none" };
  try { meta = JSON.parse(msg.meta) as CardMeta; } catch { /* нет карточки */ }
  return (
    <div className="msg">
      <div className={"mav " + (isUser ? "u" : "c")}>{isUser ? "A" : "C"}</div>
      <div className="mbody">
        <div className="mname">{isUser ? "Вы" : "Carmen"}</div>
        {msg.content.split("\n").map((line, i) => <p key={i} style={{ marginBottom: 6 }}>{line}</p>)}
        {!isUser && <Card meta={meta} onGoto={onGoto} />}
      </div>
    </div>
  );
}

function Card({ meta, onGoto }: { meta: CardMeta; onGoto: (v: "tasks" | "fin" | "subs" | "cal") => void }) {
  if (meta.card === "task") {
    return (
      <div className="icard">
        <div className="icard-h"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /></svg>Задача создана</div>
        <div className="icard-b">
          <div className="it">{meta.data.title}</div>
          <div className="icard-row"><span>Приоритет</span><b>{meta.data.priority}</b></div>
          {meta.data.deadline && <div className="icard-row"><span>Срок</span><b>{new Date(meta.data.deadline).toLocaleDateString("ru")}</b></div>}
          <div className="icard-actions"><button className="btn primary" onClick={() => onGoto("tasks")}>Открыть задачи</button></div>
        </div>
      </div>
    );
  }
  if (meta.card === "finance") {
    const s = meta.data, maxCat = Math.max(1, ...s.by_category.map((c) => c.total));
    return (
      <div className="icard">
        <div className="icard-h"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="2" x2="12" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>Финансы за месяц</div>
        <div className="icard-b">
          <div className="icard-row"><span>Доход</span><b style={{ color: "var(--green)" }}>+{rub(s.income)}</b></div>
          <div className="icard-row"><span>Расход</span><b style={{ color: "var(--red)" }}>−{rub(s.expense)}</b></div>
          <div style={{ marginTop: 10 }}>
            {s.by_category.slice(0, 4).map((c) => (
              <div key={c.category} style={{ marginBottom: 7 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}><span>{c.category}</span><span style={{ fontFamily: "var(--mono)", color: "var(--dim)" }}>{rub(c.total)}</span></div>
                <div style={{ height: 5, background: "var(--panel3)", borderRadius: 20 }}><div style={{ height: "100%", width: Math.round(c.total / maxCat * 100) + "%", background: "var(--accent)", borderRadius: 20 }} /></div>
              </div>
            ))}
          </div>
          <div className="icard-actions"><button className="btn" onClick={() => onGoto("fin")}>Открыть финансы</button></div>
        </div>
      </div>
    );
  }
  if (meta.card === "subs") {
    return (
      <div className="icard">
        <div className="icard-h"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>Подписки</div>
        <div className="icard-b">
          {meta.data.filter((s) => s.status !== "cancelled").slice(0, 6).map((s) => (
            <div key={s.id} className="icard-row">
              <span>{s.title}</span>
              <b style={{ color: s.status === "overdue" ? "var(--red)" : s.status === "expiring" ? "var(--amber)" : "var(--green)" }}>
                {s.status === "overdue" ? "просрочено" : s.status === "expiring" ? "скоро" : "активна"}
              </b>
            </div>
          ))}
          <div className="icard-actions"><button className="btn" onClick={() => onGoto("subs")}>Открыть подписки</button></div>
        </div>
      </div>
    );
  }
  if (meta.card === "calendar") {
    if (meta.data.length === 0) return null;
    return (
      <div className="icard">
        <div className="icard-h"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>Ближайшие события</div>
        <div className="icard-b">
          {meta.data.slice(0, 6).map((it) => (
            <div key={it.id} className="icard-row">
              <span>{it.title}</span>
              <b>{new Date(it.date).toLocaleDateString("ru", { day: "numeric", month: "short" })}</b>
            </div>
          ))}
          <div className="icard-actions"><button className="btn" onClick={() => onGoto("cal")}>Открыть календарь</button></div>
        </div>
      </div>
    );
  }
  if (meta.card === "search") {
    if (meta.data.length === 0) return null;
    return (
      <div className="icard">
        <div className="icard-h"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>Найдено</div>
        <div className="icard-b">
          {meta.data.slice(0, 8).map((t) => (
            <div key={t.id} className="icard-row"><span>{t.title}</span><b style={{ color: "var(--faint)" }}>{t.status}</b></div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}
