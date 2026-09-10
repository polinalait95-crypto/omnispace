import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type CalItem } from "./api";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

const kindColor = (it: CalItem) =>
  it.kind === "task"
    ? (it.status === "done" ? "var(--green)" : "var(--accent)")
    : it.status === "overdue" ? "var(--red)" : it.status === "expiring" ? "var(--amber)" : "var(--violet)";

const sameDay = (a: number, b: number) => {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};

export default function Calendar({ toast: _toast }: { toast: (t: string) => void }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [items, setItems] = useState<CalItem[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  // диапазон видимой сетки (6 недель с понедельника)
  const gridStart = useMemo(() => {
    const d = new Date(cursor);
    const wd = (d.getDay() + 6) % 7; // Пн=0
    d.setDate(d.getDate() - wd);
    return d;
  }, [cursor]);

  const load = useCallback(async () => {
    const from = gridStart.getTime();
    const to = from + 42 * 86400000;
    setItems(await api.calendarItems(from, to));
  }, [gridStart]);
  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 86400000)), [gridStart]);
  const itemsOn = (d: Date) => items.filter((it) => sameDay(it.date, d.getTime()));

  const move = (delta: number) => { const d = new Date(cursor); d.setMonth(d.getMonth() + delta); setCursor(d); setSelected(null); };
  const today = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d); setSelected(Date.now()); };

  const selItems = selected ? items.filter((it) => sameDay(it.date, selected)) : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16, alignItems: "start" }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <h3 style={{ fontFamily: "var(--display)", fontSize: 18, fontWeight: 600, flex: 1 }}>
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h3>
          <button className="btn" style={{ padding: "6px 10px" }} onClick={() => move(-1)}>‹</button>
          <button className="btn" style={{ padding: "6px 12px" }} onClick={today}>Сегодня</button>
          <button className="btn" style={{ padding: "6px 10px" }} onClick={() => move(1)}>›</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
          {WEEKDAYS.map((w) => (
            <div key={w} style={{ fontSize: 11, fontWeight: 600, color: "var(--faint)", textAlign: "center", paddingBottom: 4 }}>{w}</div>
          ))}
          {days.map((d, i) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = sameDay(d.getTime(), Date.now());
            const dayItems = itemsOn(d);
            const isSel = selected != null && sameDay(d.getTime(), selected);
            return (
              <div key={i} onClick={() => setSelected(d.getTime())}
                   className="calcell"
                   style={{
                     minHeight: 76, borderRadius: 8, padding: "6px 7px", cursor: "pointer",
                     border: "1px solid " + (isSel ? "var(--accent)" : "var(--line)"),
                     background: isToday ? "var(--accent-dim)" : "var(--panel2)",
                     opacity: inMonth ? 1 : 0.4,
                   }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--accent)" : "var(--dim)", marginBottom: 4 }}>
                  {d.getDate()}
                </div>
                {dayItems.slice(0, 3).map((it) => (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: kindColor(it), flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, color: "var(--dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</span>
                  </div>
                ))}
                {dayItems.length > 3 && <div style={{ fontSize: 10, color: "var(--faint)" }}>+{dayItems.length - 3}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontFamily: "var(--display)", fontSize: 14.5, fontWeight: 600, marginBottom: 12 }}>
          {selected ? new Date(selected).toLocaleDateString("ru", { day: "numeric", month: "long" }) : "Выберите день"}
        </h3>
        {selected && selItems.length === 0 && <div style={{ fontSize: 13, color: "var(--faint)" }}>Событий нет.</div>}
        {selItems.map((it) => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: kindColor(it), flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{it.title}</div>
              <small style={{ fontSize: 11, color: "var(--faint)" }}>{it.kind === "task" ? "Дедлайн задачи" : "Продление подписки"}</small>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.8 }}>
          <div><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", marginRight: 7 }} />Дедлайны задач</div>
          <div><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--amber)", marginRight: 7 }} />Скоро продление</div>
          <div><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--red)", marginRight: 7 }} />Просрочено</div>
        </div>
      </div>
    </div>
  );
}
