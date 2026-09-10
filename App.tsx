import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Task, type Prefs } from "./api";
import { applyPrefs, formatClock, formatDate } from "./prefs";
import Tasks from "./Tasks";
import Dashboard from "./Dashboard";
import Finances from "./Finances";
import Wiki from "./Wiki";
import Subscriptions from "./Subscriptions";
import Calendar from "./Calendar";
import Notifications from "./Notifications";
import Carmen from "./Carmen";
import Docs from "./Docs";
import Settings from "./Settings";
import Trash from "./Trash";
import CmdK from "./CmdK";

const DAYS = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];

type View = "dash" | "tasks" | "wiki" | "fin" | "subs" | "cal" | "carmen" | "docs" | "trash" | "settings";

// Мини-иконки (Lucide-подобные, скруглённые).
const I = {
  dash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>,
  tasks: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><path d="m9 14 2 2 4-4"/></svg>,
  wiki: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>,
  fin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  subs: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>,
  carmen: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>,
  docs: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M10 13.5 8 16l2 2.5"/><path d="m14 13.5 2 2.5-2 2.5"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5"/></svg>,
};

interface Toast { id: number; text: string; }

export default function App() {
  const [view, setView] = useState<View>("tasks");
  const [now, setNow] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [finBump, setFinBump] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ theme: "", time_zone: "Europe/Moscow", time_format: "24h", date_format: "DD.MM.YYYY", ui: "{}" });
  const tid = useRef(0);

  useEffect(() => { api.getPrefs().then((p) => { setPrefs(p); applyPrefs(p); }).catch(() => {}); }, []);

  const updatePrefs = useCallback((p: Prefs) => { setPrefs(p); applyPrefs(p); api.savePrefs(p).catch(() => {}); }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const reload = useCallback(async () => setTasks(await api.listTasks()), []);
  useEffect(() => { reload(); }, [reload]);

  const toast = useCallback((text: string) => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const p = (n: number) => String(n).padStart(2, "0");

  const titles: Record<View, string> = {
    dash: "Дашборд", tasks: "Задачи", wiki: "База знаний",
    fin: "Финансы", subs: "Подписки", cal: "Календарь", carmen: "Carmen AI", docs: "AI-документы", trash: "Корзина", settings: "Настройки",
  };

  const nav = (v: View, icon: JSX.Element, label: string, badge?: number) => (
    <button className={"nav-item" + (view === v ? " active" : "")} onClick={() => setView(v)}>
      {icon}{label}{badge != null && <span className="nav-badge">{badge}</span>}
    </button>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="glyph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg></div>
          <div className="name">Omni<span>Space</span></div>
        </div>
        <div>
          {nav("dash", I.dash, "Дашборд")}
          {nav("tasks", I.tasks, "Задачи", tasks.filter((t) => t.status !== "done").length)}
          {nav("wiki", I.wiki, "База знаний")}
          {nav("fin", I.fin, "Финансы")}
          {nav("subs", I.subs, "Подписки")}
          {nav("cal", I.cal, "Календарь")}
        </div>
        <div className="nav-label">Инструменты</div>
        <div>
          {nav("carmen", I.carmen, "Carmen AI")}
          {nav("docs", I.docs, "AI-документы")}
        </div>
        <div className="sidebar-foot">
          {nav("trash", I.trash, "Корзина")}
          {nav("settings", I.settings, "Настройки")}
          <div className="user-chip">
            <div className="avatar">A</div>
            <div className="meta"><b>Локальный профиль</b><small>{api.isMock ? "Демо-режим (без Tauri)" : "Данные на устройстве"}</small></div>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="page-title">{titles[view]}</div>
          <button className="cmdk-trigger" onClick={() => setCmdkOpen(true)}>
            {I.search}<span>Быстрый ввод или поиск…</span><kbd>⌘K</kbd>
          </button>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={() => setNotifOpen((o) => !o)} title="Напоминания" style={{ position: "relative" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>
              <span style={{ position: "absolute", top: 7, right: 8, width: 6, height: 6, borderRadius: "50%", background: "var(--amber)" }} />
            </button>
            <div className="clock-wrap">
              <div className="clock">{formatClock(now, prefs).hm}<span className="sec">:{formatClock(now, prefs).sec}</span></div>
              <div className="cdate">{formatDate(now, prefs)}</div>
            </div>
          </div>
        </div>

        {notifOpen && (
          <Notifications
            onGoto={(v) => setView(v)}
            onClose={() => setNotifOpen(false)}
          />
        )}

        <div className="content">
          {view === "tasks"
            ? <Tasks tasks={tasks} reload={reload} toast={toast} />
            : view === "dash"
            ? <Dashboard onGoto={(v) => setView(v)} />
            : view === "fin"
            ? <Finances bump={finBump} toast={toast} />
            : view === "wiki"
            ? <Wiki toast={toast} />
            : view === "subs"
            ? <Subscriptions toast={toast} />
            : view === "cal"
            ? <Calendar toast={toast} />
            : view === "carmen"
            ? <Carmen onGoto={(v) => setView(v)} toast={toast} />
            : view === "docs"
            ? <Docs toast={toast} />
            : view === "trash"
            ? <Trash toast={toast} />
            : view === "settings"
            ? <Settings prefs={prefs} onChange={updatePrefs} />
            : <div className="placeholder">Модуль «{titles[view]}» подключается на следующих этапах плана.</div>}
        </div>
      </div>

      {cmdkOpen && <CmdK reload={reload} onFinance={() => setFinBump((b) => b + 1)} toast={toast} onClose={() => setCmdkOpen(false)} />}

      <div className="toasts">
        {toasts.map((t) => (
          <div className="toast" key={t.id}><span className="tk">{I.check}</span>{t.text}</div>
        ))}
      </div>
    </div>
  );
}
