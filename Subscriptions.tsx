import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Subscription, type SubStatus, type Attachment } from "./api";
import Modal from "./Modal";

const fmt = (m: number) => (m / 100).toLocaleString("ru", { maximumFractionDigits: 0 });
const STATUS: Record<SubStatus, { label: string; color: string }> = {
  active: { label: "Активна", color: "var(--green)" },
  expiring: { label: "Скоро продление", color: "var(--amber)" },
  overdue: { label: "Просрочено", color: "var(--red)" },
  paused: { label: "На паузе", color: "var(--dim)" },
  cancelled: { label: "Отменена", color: "var(--faint)" },
};
const FILTERS: { key: "all" | SubStatus; label: string }[] = [
  { key: "all", label: "Все" }, { key: "active", label: "Активные" },
  { key: "expiring", label: "Истекают" }, { key: "paused", label: "На паузе" },
];

export default function Subscriptions({ toast }: { toast: (t: string) => void }) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [filter, setFilter] = useState<"all" | SubStatus>("all");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [renew, setRenew] = useState("");

  const load = useCallback(async () => setSubs(await api.listSubscriptions()), []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!title.trim()) { toast("Введите название"); return; }
    const amt = amount ? Math.round(parseFloat(amount.replace(",", ".")) * 100) : null;
    const next = renew ? new Date(renew).getTime() : null;
    await api.addSubscription({ title: title.trim(), amount: amt, nextRenewal: next });
    setTitle(""); setAmount(""); setRenew(""); setAdding(false);
    await load();
    toast("Подписка добавлена");
  }

  async function setStatus(id: string, status: SubStatus) {
    await api.setSubStatus(id, status);
    await load();
  }

  async function remove(id: string) {
    await api.remove(id);
    await load();
    toast("Отправлено в корзину");
  }

  const [editing, setEditing] = useState<Subscription | null>(null);

  const shown = subs.filter((s) => filter === "all" || s.status === filter);

  const monthlyTotal = subs
    .filter((s) => s.status !== "cancelled" && s.status !== "paused" && s.period === "month")
    .reduce((sum, s) => sum + (s.amount ?? 0), 0);

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? "on" : ""} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12.5, color: "var(--dim)", marginRight: 6 }}>
          В месяц: <b style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>{fmt(monthlyTotal)} ₽</b>
        </div>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5v14" /></svg>Добавить
        </button>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} style={sub_in(140)} />
          <input placeholder="Стоимость ₽" value={amount} onChange={(e) => setAmount(e.target.value)} style={sub_in(100)} />
          <label style={{ fontSize: 12.5, color: "var(--dim)" }}>Продление:
            <input type="date" value={renew} onChange={(e) => setRenew(e.target.value)} style={{ ...sub_in(140), marginLeft: 8 }} />
          </label>
          <button className="btn primary" onClick={add}>Сохранить</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 13 }}>
        {shown.length === 0 && <div className="empty">Подписок нет.</div>}
        {shown.map((s) => <Card key={s.id} sub={s} onStatus={setStatus} onEdit={() => setEditing(s)} onRemove={() => remove(s.id)} toast={toast} />)}
      </div>

      {editing && (
        <SubEdit
          sub={editing}
          onClose={() => setEditing(null)}
          onSave={async (v) => { await api.updateSubscription(editing.id, v); await load(); setEditing(null); toast("Подписка обновлена"); }}
        />
      )}
    </>
  );
}

function SubEdit({ sub, onClose, onSave }: {
  sub: Subscription; onClose: () => void;
  onSave: (v: { title: string; amount: number | null; period: string; nextRenewal: number | null; notifyDays: string; url: string | null }) => void;
}) {
  const [title, setTitle] = useState(sub.title);
  const [amount, setAmount] = useState(sub.amount != null ? String(sub.amount / 100) : "");
  const [period, setPeriod] = useState(sub.period);
  const [renew, setRenew] = useState(sub.next_renewal ? new Date(sub.next_renewal).toISOString().slice(0, 10) : "");
  const [notify, setNotify] = useState((() => { try { return (JSON.parse(sub.notify_days) as number[]).join(","); } catch { return "3"; } })());
  const [url, setUrl] = useState(sub.url ?? "");
  return (
    <Modal title="Редактировать подписку" onClose={onClose}>
      <div className="field"><label>Название</label><input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>
      <div className="field"><label>Стоимость, ₽</label><input value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <div className="field"><label>Периодичность</label>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="week">Еженедельно</option>
          <option value="month">Ежемесячно</option>
          <option value="year">Ежегодно</option>
        </select>
      </div>
      <div className="field"><label>Дата продления</label><input type="date" value={renew} onChange={(e) => setRenew(e.target.value)} /></div>
      <div className="field"><label>Напомнить за (дней, через запятую)</label><input value={notify} onChange={(e) => setNotify(e.target.value)} /></div>
      <div className="field"><label>Ссылка</label><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></div>
      <div className="modal-actions">
        <div className="grow" />
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={() => onSave({
          title: title || "Без названия",
          amount: amount ? Math.round(parseFloat(amount.replace(",", ".")) * 100) : null,
          period,
          nextRenewal: renew ? new Date(renew).getTime() : null,
          notifyDays: JSON.stringify(notify.split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n))),
          url: url.trim() || null,
        })}>Сохранить</button>
      </div>
    </Modal>
  );
}

function Card({ sub, onStatus, onEdit, onRemove, toast }: { sub: Subscription; onStatus: (id: string, s: SubStatus) => void; onEdit: () => void; onRemove: () => void; toast: (t: string) => void }) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = STATUS[sub.status];

  const loadFiles = useCallback(async () => setFiles(await api.listAttachments(sub.id)), [sub.id]);
  useEffect(() => { if (open) loadFiles(); }, [open, loadFiles]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const bytes = Array.from(new Uint8Array(await f.arrayBuffer()));
    await api.saveAttachment(sub.id, f.name, f.type || null, bytes);
    e.target.value = "";
    await loadFiles();
    toast(`Файл прикреплён: ${f.name}`);
  }

  async function download(a: Attachment) {
    const bytes = await api.readAttachment(a.id);
    const blob = new Blob([new Uint8Array(bytes)], { type: a.mime ?? "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = a.file_name; link.click();
    URL.revokeObjectURL(url);
  }

  async function removeFile(a: Attachment) {
    await api.deleteAttachment(a.id);
    await loadFiles();
  }

  return (
    <div className="card" style={{ padding: 15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 9, background: "var(--panel3)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, color: st.color }}>{sub.title[0]}</div>
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: 14, fontWeight: 600, display: "block" }}>{sub.title}</b>
          <small style={{ fontSize: 11.5, color: "var(--faint)" }}>{sub.period === "month" ? "Ежемесячно" : sub.period === "year" ? "Ежегодно" : sub.period}</small>
        </div>
        <span className="card-edit" onClick={onEdit} title="Редактировать">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </span>
        <span className="del" style={{ cursor: "pointer", color: "var(--faint)", display: "flex" }} onClick={onRemove} title="В корзину">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
        </span>
      </div>

      {sub.amount != null && <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 600 }}>{fmt(sub.amount)} ₽</div>}
      {sub.next_renewal && (
        <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 12 }}>
          Продление {new Date(sub.next_renewal).toLocaleDateString("ru", { day: "numeric", month: "long" })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, padding: "7px 10px", borderRadius: 7, background: "var(--panel2)", color: st.color, marginBottom: 12 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.color }} />{st.label}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {sub.status !== "paused" && sub.status !== "cancelled"
          ? <button className="btn" style={mini} onClick={() => onStatus(sub.id, "paused")}>На паузу</button>
          : <button className="btn" style={mini} onClick={() => onStatus(sub.id, "active")}>Активировать</button>}
        {sub.status !== "cancelled" && <button className="btn" style={mini} onClick={() => onStatus(sub.id, "cancelled")}>Отменить</button>}
        <button className="btn" style={mini} onClick={() => setOpen((v) => !v)}>
          Файлы{files.length ? ` (${files.length})` : ""}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <input ref={fileRef} type="file" style={{ display: "none" }} onChange={onPick} />
          <button className="btn" style={{ ...mini, marginBottom: 8 }} onClick={() => fileRef.current?.click()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            Прикрепить счёт / файл
          </button>
          {files.length === 0 && <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Файлов нет.</div>}
          {files.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0" }}>
              <span style={{ flex: 1, cursor: "pointer", color: "var(--accent)" }} onClick={() => download(f)}>{f.file_name}</span>
              <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10.5 }}>{(f.size / 1024).toFixed(0)} КБ</span>
              <span style={{ cursor: "pointer", color: "var(--faint)" }} onClick={() => removeFile(f)}>✕</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const mini: React.CSSProperties = { padding: "5px 10px", fontSize: 12 };
function sub_in(w: number): React.CSSProperties {
  return { width: w, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none" };
}
