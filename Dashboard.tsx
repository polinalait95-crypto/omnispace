import { useEffect, useState } from "react";
import { api, type Task, type Summary, type Subscription, type CalItem } from "./api";

const fmt = (m: number) => (m / 100).toLocaleString("ru", { maximumFractionDigits: 0 });
const PRIO: Record<string, string> = { critical: "p-critical", high: "p-high", medium: "p-medium", low: "p-low" };

export default function Dashboard({ onGoto }: { onGoto: (v: "tasks" | "fin" | "subs" | "cal") => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sum, setSum] = useState<Summary>({ income: 0, expense: 0, by_category: [] });
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [events, setEvents] = useState<CalItem[]>([]);

  useEffect(() => {
    const monthStart = (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); })();
    const now = Date.now();
    api.listTasks().then(setTasks);
    api.summary(monthStart, null).then(setSum);
    api.listSubscriptions().then(setSubs);
    api.calendarItems(now - 2 * 86400000, now + 14 * 86400000).then(setEvents);
  }, []);

  const active = tasks.filter((t) => t.status !== "done");
  const balance = sum.income - sum.expense;
  const monthly = subs.filter((s) => s.status !== "cancelled" && s.status !== "paused" && s.period === "month").reduce((a, s) => a + (s.amount ?? 0), 0);
  const attention = subs.filter((s) => s.status === "expiring" || s.status === "overdue");

  const kpi = (label: string, value: string, sub: string, color?: string) => (
    <div className="card">
      <div style={{ fontSize: 12, color: "var(--dim)" }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600, marginTop: 10, color }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 5 }}>{sub}</div>
    </div>
  );
  const head = (title: string, go: () => void) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <h3 style={{ fontFamily: "var(--display)", fontSize: 14.5, fontWeight: 600 }}>{title}</h3>
      <span style={{ fontSize: 12, color: "var(--accent)", cursor: "pointer" }} onClick={go}>Открыть</span>
    </div>
  );

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 14 }}>
        {kpi("Активных задач", String(active.length), `${tasks.length - active.length} готово`)}
        {kpi("Баланс месяца", `${balance >= 0 ? "+" : "−"}${fmt(Math.abs(balance))} ₽`, "доход минус расход", balance >= 0 ? "var(--green)" : "var(--red)")}
        {kpi("Подписки / мес", `${fmt(monthly)} ₽`, `${subs.filter((s) => s.status !== "cancelled").length} активных`)}
        {kpi("Требуют внимания", String(attention.length), attention.length ? attention.map((s) => s.title).join(", ") : "всё под контролем", attention.length ? "var(--amber)" : undefined)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14, alignItems: "start" }}>
        <div className="card">
          {head("Задачи в работе", () => onGoto("tasks"))}
          {active.length === 0 && <div style={{ fontSize: 13, color: "var(--faint)" }}>Активных задач нет.</div>}
          {active.slice(0, 6).map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ flex: 1, fontSize: 13.5 }}>{t.title}</span>
              <span className={"pill " + PRIO[t.priority]}>{t.priority}</span>
              {t.deadline && <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)", width: 54, textAlign: "right" }}>{new Date(t.deadline).toLocaleDateString("ru", { day: "numeric", month: "short" })}</span>}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            {head("Ближайшие события", () => onGoto("cal"))}
            {events.length === 0 && <div style={{ fontSize: 13, color: "var(--faint)" }}>Событий нет.</div>}
            {events.slice(0, 5).map((it) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: it.date < Date.now() ? "var(--red)" : it.kind === "task" ? "var(--accent)" : "var(--amber)", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13 }}>{it.title}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>{new Date(it.date).toLocaleDateString("ru", { day: "numeric", month: "short" })}</span>
              </div>
            ))}
          </div>

          <div className="card">
            {head("Расходы по категориям", () => onGoto("fin"))}
            {sum.by_category.length === 0 && <div style={{ fontSize: 13, color: "var(--faint)" }}>Нет расходов за месяц.</div>}
            {sum.by_category.slice(0, 4).map((c) => {
              const max = Math.max(1, ...sum.by_category.map((x) => x.total));
              return (
                <div key={c.category} style={{ marginBottom: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}><span>{c.category}</span><span style={{ fontFamily: "var(--mono)", color: "var(--dim)" }}>{fmt(c.total)} ₽</span></div>
                  <div style={{ height: 5, background: "var(--panel3)", borderRadius: 20 }}><div style={{ height: "100%", width: Math.round(c.total / max * 100) + "%", background: "var(--accent)", borderRadius: 20 }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
