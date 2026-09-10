import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Task } from "./api";
import { parseLocal } from "./parse";

export default function CmdK({ reload, onFinance, toast, onClose }: {
  reload: () => Promise<void>; onFinance: () => void; toast: (t: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Task[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const intent = useMemo(() => (text.trim() ? parseLocal(text) : null), [text]);

  // Живой поиск, когда намерение — поиск.
  useEffect(() => {
    let alive = true;
    if (intent?.kind === "search" && intent.query) {
      api.search(intent.query).then((r) => { if (alive) setResults(r); });
    } else {
      setResults([]);
    }
    return () => { alive = false; };
  }, [intent]);

  async function run() {
    if (!intent) return;
    if (intent.kind === "task") {
      await api.createTask(intent.title, intent.priority, intent.deadline);
      await reload();
      toast(`Задача создана: ${intent.title}`);
      onClose();
    } else if (intent.kind === "finance") {
      await api.addTransaction({
        direction: intent.direction,
        amount: Math.round(intent.amount * 100),
        title: intent.title,
      });
      onFinance();
      toast(`${intent.direction === "income" ? "Доход" : "Расход"} записан: ${intent.amount} ₽`);
      onClose();
    } else {
      toast(`Найдено совпадений: ${results.length}`);
      onClose();
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); run(); }
    else if (e.key === "Escape") onClose();
  }

  const dl = (ms: number | null) =>
    ms ? new Date(ms).toLocaleDateString("ru", { day: "numeric", month: "long" }) : null;

  return (
    <div className="cmdk" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk-box">
        <div className="cmdk-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z"/></svg>
          <input ref={inputRef} value={text} placeholder="«напомни завтра позвонить Ивану» или поиск…"
                 onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
          <kbd style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)", border: "1px solid var(--line)", padding: "2px 6px", borderRadius: 5 }}>esc</kbd>
        </div>

        {intent?.kind === "task" && (
          <div className="cmdk-intent">
            <span className="cmdk-chip">Задача</span>
            <div className="parsed"><b>{intent.title}</b></div>
            <div className="hint">
              Приоритет: {intent.priority}
              {intent.deadline ? ` · срок: ${dl(intent.deadline)}` : ""} · Enter — создать
            </div>
          </div>
        )}

        {intent?.kind === "finance" && (
          <div className="cmdk-intent">
            <span className="cmdk-chip">{intent.direction === "income" ? "Доход" : "Расход"}</span>
            <div className="parsed">
              {intent.direction === "income" ? "+" : "−"}<b>{intent.amount} ₽</b> · {intent.title}
            </div>
            <div className="hint">Enter — записать в финансы. Категория определится позже.</div>
          </div>
        )}

        <div className="cmdk-results">
          {intent?.kind === "task" && (
            <>
              <div className="cmdk-lbl">Действие</div>
              <div className="cmdk-item primary sel" onClick={run}>
                <div className="ci-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5v14"/></svg></div>
                <div className="ci-txt"><b>Создать задачу</b><small>{intent.title}</small></div>
              </div>
            </>
          )}
          {intent?.kind === "finance" && (
            <>
              <div className="cmdk-lbl">Действие</div>
              <div className="cmdk-item primary sel" onClick={run}>
                <div className="ci-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
                <div className="ci-txt"><b>{intent.direction === "income" ? "Записать доход" : "Записать расход"}</b><small>{intent.amount} ₽ · {intent.title}</small></div>
              </div>
            </>
          )}
          {intent?.kind === "search" && (
            <>
              <div className="cmdk-lbl">{results.length ? "Найдено" : "Поиск"}</div>
              {results.map((t) => (
                <div className="cmdk-item" key={t.id} onClick={onClose}>
                  <div className="ci-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/></svg></div>
                  <div className="ci-txt"><b>{t.title}</b><small>Задача · {t.status}</small></div>
                </div>
              ))}
              {!results.length && text.trim() && (
                <div className="cmdk-item"><div className="ci-txt"><small>Ничего не найдено. Добавьте слово «задача» или «напомни», чтобы создать.</small></div></div>
              )}
            </>
          )}
          {!text.trim() && (
            <div className="cmdk-item"><div className="ci-txt"><small>Введите текст: «купить кофе» → поиск, «напомни завтра …» → задача.</small></div></div>
          )}
        </div>
      </div>
    </div>
  );
}
