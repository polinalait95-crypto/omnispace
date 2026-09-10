import { useEffect, useState } from "react";
import { api, type CalItem } from "./api";

// Напоминания = события в окне [−7 дней … +14 дней]: скоро и просроченное.
export default function Notifications({ onGoto, onClose }: { onGoto: (v: "tasks" | "subs") => void; onClose: () => void }) {
  const [items, setItems] = useState<CalItem[]>([]);

  useEffect(() => {
    const now = Date.now();
    api.calendarItems(now - 7 * 86400000, now + 14 * 86400000).then((all) => {
      // сортируем: просроченное и ближайшее сверху
      setItems(all.filter((i) => i.kind === "subscription" || i.status !== "done").sort((a, b) => a.date - b.date));
    });
  }, []);

  const rel = (ms: number) => {
    const days = Math.round((ms - Date.now()) / 86400000);
    if (days < 0) return `${-days} дн. назад`;
    if (days === 0) return "сегодня";
    if (days === 1) return "завтра";
    return `через ${days} дн.`;
  };
  const color = (it: CalItem) =>
    it.date < Date.now() ? "var(--red)" : it.kind === "subscription" && it.status === "expiring" ? "var(--amber)" : "var(--accent)";

  return (
    <div className="notif-panel">
      <div className="notif-head">
        <b>Напоминания</b>
        <button className="modal-x" onClick={onClose} style={{ width: 26, height: 26 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      {items.length === 0 && <div style={{ padding: "18px 14px", fontSize: 13, color: "var(--faint)" }}>Ближайших событий нет.</div>}
      {items.map((it) => (
        <div key={it.id} className="notif-item" onClick={() => { onGoto(it.kind === "task" ? "tasks" : "subs"); onClose(); }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color(it), flexShrink: 0, marginTop: 5 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{it.title}</div>
            <small style={{ fontSize: 11.5, color: "var(--faint)" }}>
              {it.kind === "task" ? "Дедлайн" : "Продление"} · {rel(it.date)}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}
