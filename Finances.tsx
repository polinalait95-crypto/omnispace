import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Transaction, type Summary, type Envelope, type Direction } from "./api";
import Modal from "./Modal";

const fmt = (minor: number) => (minor / 100).toLocaleString("ru", { maximumFractionDigits: 0 });
const CAT_COLORS = ["var(--accent)", "var(--amber)", "var(--red)", "var(--violet)", "var(--green)"];

function monthStart(): number {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function Finances({ bump, toast }: { bump: number; toast: (t: string) => void }) {
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [cat, setCat] = useState<string | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [sum, setSum] = useState<Summary>({ income: 0, expense: 0, by_category: [] });
  const [envs, setEnvs] = useState<Envelope[]>([]);

  // форма добавления
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [dir, setDir] = useState<Direction>("expense");
  const [addCat, setAddCat] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);

  const from = period === "month" ? monthStart() : null;

  const load = useCallback(async () => {
    setTxns(await api.listTransactions(from, null, cat));
    setSum(await api.summary(from, null));
    setEnvs(await api.listBudgets());
  }, [from, cat]);

  useEffect(() => { load(); }, [load, bump]);

  async function add() {
    const val = parseFloat(amount.replace(",", "."));
    if (Number.isNaN(val) || val <= 0) { toast("Введите сумму"); return; }
    await api.addTransaction({
      direction: dir,
      amount: Math.round(val * 100),
      title: title.trim() || (dir === "expense" ? "Расход" : "Доход"),
      category: addCat.trim() || null,
    });
    setAmount(""); setTitle(""); setAddCat("");
    await load();
    toast(dir === "expense" ? "Расход записан" : "Доход записан");
  }

  const balance = sum.income - sum.expense;
  const maxCat = useMemo(() => Math.max(1, ...sum.by_category.map((c) => c.total)), [sum]);

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          <button className={period === "month" ? "on" : ""} onClick={() => setPeriod("month")}>Этот месяц</button>
          <button className={period === "all" ? "on" : ""} onClick={() => setPeriod("all")}>Всё время</button>
        </div>
        {cat && (
          <button className="btn" onClick={() => setCat(null)}>
            Категория: {cat} ✕
          </button>
        )}
      </div>

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 14 }}>
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--dim)" }}>Доход</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600, color: "var(--green)", marginTop: 8 }}>+{fmt(sum.income)} ₽</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--dim)" }}>Расход</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600, color: "var(--red)", marginTop: 8 }}>−{fmt(sum.expense)} ₽</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--dim)" }}>Баланс</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600, marginTop: 8 }}>{balance >= 0 ? "+" : "−"}{fmt(Math.abs(balance))} ₽</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, alignItems: "start" }}>
        {/* Операции */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ fontFamily: "var(--display)", fontSize: 14.5, fontWeight: 600 }}>Операции</h3>
          </div>

          {/* быстрое добавление */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <div className="seg">
              <button className={dir === "expense" ? "on" : ""} onClick={() => setDir("expense")}>Расход</button>
              <button className={dir === "income" ? "on" : ""} onClick={() => setDir("income")}>Доход</button>
            </div>
            <input className="fin-in" placeholder="Сумма ₽" value={amount} onChange={(e) => setAmount(e.target.value)} style={inp(70)} />
            <input className="fin-in" placeholder="Описание" value={title} onChange={(e) => setTitle(e.target.value)} style={inp(120, true)} />
            <input className="fin-in" placeholder="Категория" value={addCat} onChange={(e) => setAddCat(e.target.value)} style={inp(100)} />
            <button className="btn primary" onClick={add}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5v14" /></svg>
            </button>
          </div>

          {txns.length === 0 && <div className="empty">Операций за период нет.</div>}
          {txns.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13.5, fontWeight: 500, display: "block" }}>{t.title}</b>
                <small style={{ fontSize: 11.5, color: "var(--faint)", cursor: t.category ? "pointer" : "default" }}
                       onClick={() => t.category && setCat(t.category)}>
                  {t.category ?? "Без категории"} · {new Date(t.occurred_at).toLocaleDateString("ru", { day: "numeric", month: "short" })}
                </small>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: 14, color: t.direction === "income" ? "var(--green)" : "var(--text)" }}>
                {t.direction === "income" ? "+" : "−"}{fmt(t.amount)} ₽
              </div>
              <span className="card-edit" onClick={() => setEditing(t)} title="Редактировать">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </span>
              <span className="del" style={{ cursor: "pointer", color: "var(--faint)", display: "flex" }}
                    onClick={async () => { await api.remove(t.id); await load(); toast("В корзину"); }} title="В корзину">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </span>
            </div>
          ))}
        </div>

        {/* Конверты + разбивка */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <h3 style={{ fontFamily: "var(--display)", fontSize: 14.5, fontWeight: 600, marginBottom: 14 }}>Бюджет-конверты</h3>
            {envs.length === 0 && <div style={{ fontSize: 13, color: "var(--faint)" }}>Конвертов пока нет.</div>}
            {envs.map((e) => {
              const pct = Math.min(100, Math.round((e.used / Math.max(1, e.limit)) * 100));
              const color = pct >= 90 ? "var(--red)" : pct >= 70 ? "var(--amber)" : "var(--accent)";
              return (
                <div key={e.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 7 }}>
                    <span style={{ fontWeight: 500 }}>{e.category}</span>
                    <span style={{ fontFamily: "var(--mono)", color: "var(--dim)" }}>{fmt(e.used)} / {fmt(e.limit)} ₽</span>
                  </div>
                  <div style={{ height: 7, background: "var(--panel3)", borderRadius: 20, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: pct + "%", background: color, borderRadius: 20, transition: "width .5s" }} />
                  </div>
                </div>
              );
            })}
          </div>

          {sum.by_category.length > 0 && (
            <div className="card">
              <h3 style={{ fontFamily: "var(--display)", fontSize: 14.5, fontWeight: 600, marginBottom: 14 }}>Расходы по категориям</h3>
              {sum.by_category.map((c, i) => (
                <div key={c.category} style={{ marginBottom: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                    <span style={{ cursor: "pointer" }} onClick={() => setCat(c.category)}>{c.category}</span>
                    <span style={{ fontFamily: "var(--mono)", color: "var(--dim)" }}>{fmt(c.total)} ₽</span>
                  </div>
                  <div style={{ height: 6, background: "var(--panel3)", borderRadius: 20, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: Math.round((c.total / maxCat) * 100) + "%", background: CAT_COLORS[i % CAT_COLORS.length], borderRadius: 20 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <TxnEdit
          txn={editing}
          onClose={() => setEditing(null)}
          onSave={async (v) => { await api.updateTransaction(editing.id, v); await load(); setEditing(null); toast("Операция обновлена"); }}
        />
      )}
    </>
  );
}

function TxnEdit({ txn, onClose, onSave }: {
  txn: Transaction; onClose: () => void;
  onSave: (v: { direction: Direction; amount: number; title: string; category: string | null; occurredAt: number }) => void;
}) {
  const [dir, setDir] = useState<Direction>(txn.direction);
  const [amount, setAmount] = useState(String(txn.amount / 100));
  const [title, setTitle] = useState(txn.title);
  const [category, setCategory] = useState(txn.category ?? "");
  const [date, setDate] = useState(new Date(txn.occurred_at).toISOString().slice(0, 10));
  return (
    <Modal title="Редактировать операцию" onClose={onClose}>
      <div className="field">
        <label>Тип</label>
        <select value={dir} onChange={(e) => setDir(e.target.value as Direction)}>
          <option value="expense">Расход</option>
          <option value="income">Доход</option>
        </select>
      </div>
      <div className="field"><label>Сумма, ₽</label><input value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
      <div className="field"><label>Описание</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label>Категория</label><input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
      <div className="field"><label>Дата</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="modal-actions">
        <div className="grow" />
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={() => onSave({
          direction: dir,
          amount: Math.round(parseFloat(amount.replace(",", ".") || "0") * 100),
          title: title || (dir === "expense" ? "Расход" : "Доход"),
          category: category.trim() || null,
          occurredAt: date ? new Date(date).getTime() : txn.occurred_at,
        })}>Сохранить</button>
      </div>
    </Modal>
  );
}

function inp(w: number, grow = false): React.CSSProperties {
  return {
    width: grow ? undefined : w, flex: grow ? 1 : undefined, minWidth: w,
    background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8,
    padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none",
  };
}
