import { useMemo, useState } from "react";
import { api, type Task, type Status, type Priority } from "./api";
import Modal from "./Modal";

const COLUMNS: { status: Status; label: string; color: string }[] = [
  { status: "open", label: "Открыта", color: "var(--faint)" },
  { status: "in_progress", label: "В работе", color: "var(--accent)" },
  { status: "review", label: "На проверке", color: "var(--amber)" },
  { status: "done", label: "Готово", color: "var(--green)" },
  { status: "hold", label: "Отложено", color: "var(--violet)" },
];
const PRIO_LABEL: Record<Priority, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

const toDateInput = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

export default function Tasks({ tasks, reload, toast }: {
  tasks: Task[]; reload: () => Promise<void>; toast: (t: string) => void;
}) {
  const [mode, setMode] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);

  const filtered = useMemo(
    () => tasks.filter((t) => t.title.toLowerCase().includes(q.toLowerCase())),
    [tasks, q]
  );

  async function addTask() {
    const title = prompt("Название задачи");
    if (!title?.trim()) return;
    await api.createTask(title.trim());
    await reload();
    toast("Задача создана");
  }

  async function move(id: string, status: Status) {
    await api.setStatus(id, status);
    await reload();
  }

  async function remove(id: string) {
    await api.remove(id);
    await reload();
    toast("Отправлено в корзину");
  }

  const Card = (t: Task) => (
    <div
      key={t.id}
      className={"kcard" + (drag === t.id ? " dragging" : "")}
      draggable
      onDragStart={() => setDrag(t.id)}
      onDragEnd={() => { setDrag(null); setOver(null); }}
    >
      <div className="kt">{t.title}</div>
      <div className="kmeta">
        <span className={"pill p-" + t.priority}>{PRIO_LABEL[t.priority]}</span>
      </div>
      <div className="kfoot">
        {t.deadline && (
          <span>{new Date(t.deadline).toLocaleDateString("ru", { day: "numeric", month: "short" })}</span>
        )}
        <span className="card-edit" style={{ marginLeft: t.deadline ? 0 : "auto" }} onClick={() => setEditing(t)} title="Редактировать">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </span>
        <span className="del" onClick={() => remove(t.id)} title="В корзину">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
        </span>
      </div>
    </div>
  );

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          <button className={mode === "board" ? "on" : ""} onClick={() => setMode("board")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>Канбан
          </button>
          <button className={mode === "list" ? "on" : ""} onClick={() => setMode("list")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>Список
          </button>
        </div>
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input placeholder="Поиск по задачам…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn primary" onClick={addTask}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5v14"/></svg>Новая задача
        </button>
      </div>

      {mode === "board" ? (
        <div className="board">
          {COLUMNS.map((col) => {
            const items = filtered.filter((t) => t.status === col.status);
            return (
              <div key={col.status}>
                <div className="col-head">
                  <span className="cdot" style={{ background: col.color }} />
                  <h4>{col.label}</h4><span className="cnt">{items.length}</span>
                </div>
                <div
                  className={"kcol" + (over === col.status ? " drop" : "")}
                  onDragOver={(e) => { e.preventDefault(); setOver(col.status); }}
                  onDragLeave={() => setOver((s) => (s === col.status ? null : s))}
                  onDrop={() => { if (drag) move(drag, col.status); setDrag(null); setOver(null); }}
                >
                  {items.map(Card)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tlist">
          {filtered.length === 0 && <div className="empty">Задач пока нет. Создайте первую — кнопкой справа или через ⌘K.</div>}
          {filtered.map((t) => (
            <div className={"trow" + (t.status === "done" ? " done" : "")} key={t.id}>
              <div className={"check" + (t.status === "done" ? " on" : "")}
                   onClick={() => move(t.id, t.status === "done" ? "open" : "done")}>
                {t.status === "done" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5"/></svg>}
              </div>
              <div className="ttl">{t.title}</div>
              <span className={"pill p-" + t.priority}>{PRIO_LABEL[t.priority]}</span>
              <span className="tstatus">{COLUMNS.find((c) => c.status === t.status)?.label}</span>
              <span className="card-edit" onClick={() => setEditing(t)} title="Редактировать">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </span>
              <span className="del" onClick={() => remove(t.id)} style={{ cursor: "pointer", color: "var(--faint)" }}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TaskEdit
          task={editing}
          onClose={() => setEditing(null)}
          onSave={async (title, priority, deadline) => {
            await api.updateTask(editing.id, title, priority, deadline);
            await reload(); setEditing(null); toast("Задача обновлена");
          }}
          onDelete={async () => { await remove(editing.id); setEditing(null); }}
        />
      )}
    </>
  );
}

function TaskEdit({ task, onClose, onSave, onDelete }: {
  task: Task; onClose: () => void;
  onSave: (title: string, priority: Priority, deadline: number | null) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [date, setDate] = useState(toDateInput(task.deadline));
  return (
    <Modal title="Редактировать задачу" onClose={onClose}>
      <div className="field">
        <label>Название</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Приоритет</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div className="field">
        <label>Дедлайн</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button className="btn danger" onClick={onDelete}>В корзину</button>
        <div className="grow" />
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={() => onSave(title || "Без названия", priority, date ? new Date(date).getTime() : null)}>Сохранить</button>
      </div>
    </Modal>
  );
}
