import { useCallback, useEffect, useRef, useState } from "react";
import { api, type DocRule } from "./api";

const ACTIONS: Record<string, string> = {
  extract: "Извлечь данные", to_excel: "Собрать таблицу (Excel)",
  to_wiki: "В базу знаний", to_tasks: "Создать задачи", report: "Отчёт",
};
const ACTION_KEYS = Object.keys(ACTIONS);

export default function Docs({ toast }: { toast: (t: string) => void }) {
  const [rules, setRules] = useState<DocRule[]>([]);
  const [sel, setSel] = useState<DocRule | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await api.listRules();
    setRules(r);
    if (sel) setSel(r.find((x) => x.id === sel.id) ?? null);
  }, [sel]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const roots = rules.filter((r) => !r.parent_id);
  const childrenOf = (id: string) => rules.filter((r) => r.parent_id === id);

  async function addFolder() {
    await api.createRule({ parentId: null, name: "Новая папка", fileTypes: "[]", action: null, prompt: null, isFolder: true });
    await load(); toast("Папка создана");
  }
  async function addRule(parentId: string | null) {
    const r = await api.createRule({ parentId, name: "Новое правило", fileTypes: '["pdf"]', action: "extract", prompt: "", isFolder: false });
    await load(); setSel(r); toast("Правило создано");
  }
  async function saveRule(r: DocRule) {
    await api.updateRule(r.id, r.name, r.file_types, r.action, r.prompt);
    await load(); toast("Правило сохранено");
  }
  async function removeRule(r: DocRule) {
    await api.deleteRule(r.id);
    if (sel?.id === r.id) setSel(null);
    await load(); toast(r.is_folder ? "Папка удалена" : "Правило удалено");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    const isText = ["txt", "csv", "md", "json"].includes(ext);
    let preview = "";
    if (isText) {
      const text = await f.text();
      preview = "Первые строки файла:\n\n" + text.split("\n").slice(0, 8).join("\n");
    } else {
      preview = `Файл ${f.name} (${(f.size / 1024).toFixed(0)} КБ) принят.\n\nРазбор ${ext.toUpperCase()} выполняется локально при запуске приложения (библиотеки pdf/docx/xlsx + при необходимости модель Ollama). В демо-режиме показан только приём файла.`;
    }
    const rule = sel && !sel.is_folder ? sel : null;
    setResult(
      (rule ? `Правило: «${rule.name}» → ${ACTIONS[rule.action ?? ""] ?? "—"}\n\n` : "Правило не выбрано (выберите слева).\n\n") + preview
    );
    e.target.value = "";
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>
      {/* дерево правил */}
      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 10px" }}>
          <b style={{ fontSize: 13, fontFamily: "var(--display)" }}>Правила обработки</b>
          <span className="wadd" onClick={addFolder} title="Новая папка">+</span>
        </div>
        {roots.length === 0 && <div style={{ fontSize: 12.5, color: "var(--faint)", padding: 8 }}>Создайте папку и правила.</div>}
        {roots.map((f) => (
          <div key={f.id}>
            <div className={"wtree" + (sel?.id === f.id ? " on" : "")} onClick={() => setSel(f)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" /></svg>
              <span>{f.name}</span>
              <span className="wadd" title="Правило" onClick={(e) => { e.stopPropagation(); addRule(f.id); }}>+</span>
              <span className="wdel" onClick={(e) => { e.stopPropagation(); removeRule(f); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg></span>
            </div>
            {childrenOf(f.id).map((r) => (
              <div key={r.id} className={"wtree" + (sel?.id === r.id ? " on" : "")} style={{ paddingLeft: 30 }} onClick={() => setSel(r)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: 14, height: 14 }}><circle cx="12" cy="12" r="3" /><path d="M12 1v6M12 17v6" /></svg>
                <span>{r.name}</span>
                <span className="wdel" onClick={(e) => { e.stopPropagation(); removeRule(r); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg></span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* правая часть */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sel && !sel.is_folder && <RuleEditor key={sel.id} rule={sel} onSave={saveRule} />}

        {/* загрузка/обработка */}
        <div className="card" style={{ borderStyle: "dashed", textAlign: "center", padding: "34px 20px", cursor: "pointer" }} onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" style={{ display: "none" }} onChange={onFile} />
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--dim)" style={{ margin: "0 auto 12px" }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></svg>
          <div style={{ fontWeight: 500, marginBottom: 5 }}>Выберите файл для обработки</div>
          <div style={{ fontSize: 12.5, color: "var(--faint)" }}>PDF, DOCX, XLSX, CSV, TXT · разбор локально на Маке</div>
        </div>

        {result && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <b style={{ fontSize: 13.5, fontFamily: "var(--display)" }}>Результат</b>
              <span className="del" style={{ cursor: "pointer", color: "var(--faint)" }} onClick={() => setResult(null)}>✕</span>
            </div>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.6, color: "var(--dim)" }}>{result}</pre>
          </div>
        )}

        <ExcelGen toast={toast} />
      </div>
    </div>
  );
}

function RuleEditor({ rule, onSave }: { rule: DocRule; onSave: (r: DocRule) => void }) {
  const [name, setName] = useState(rule.name);
  const [types, setTypes] = useState((() => { try { return (JSON.parse(rule.file_types) as string[]).join(", "); } catch { return ""; } })());
  const [action, setAction] = useState(rule.action ?? "extract");
  const [prompt, setPrompt] = useState(rule.prompt ?? "");
  return (
    <div className="card">
      <b style={{ fontSize: 13.5, fontFamily: "var(--display)", display: "block", marginBottom: 12 }}>Правило</b>
      <div className="field"><label>Название</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>Типы файлов (через запятую)</label><input value={types} onChange={(e) => setTypes(e.target.value)} placeholder="pdf, docx, xlsx" /></div>
      <div className="field"><label>Действие</label>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTION_KEYS.map((k) => <option key={k} value={k}>{ACTIONS[k]}</option>)}
        </select>
      </div>
      <div className="field"><label>Промпт (переменные {"{{filename}}"}, {"{{filetype}}"})</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
          style={{ width: "100%", background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", color: "var(--text)", fontSize: 13, fontFamily: "var(--mono)", outline: "none", resize: "vertical" }} />
      </div>
      <div className="modal-actions">
        <div className="grow" />
        <button className="btn primary" onClick={() => onSave({
          ...rule, name: name || "Без названия",
          file_types: JSON.stringify(types.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)),
          action, prompt,
        })}>Сохранить правило</button>
      </div>
    </div>
  );
}

function ExcelGen({ toast }: { toast: (t: string) => void }) {
  const [prompt, setPrompt] = useState("");

  function build() {
    if (!prompt.trim()) { toast("Опишите таблицу"); return; }
    // локально извлекаем возможные колонки из промпта; иначе — шаблон
    const m = prompt.match(/(?:колонк[иа]|столбц[ыа]|поля|с полями)[:\s]+(.+)/i);
    const cols = (m ? m[1] : "Дата, Описание, Категория, Сумма")
      .split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const header = cols.join(",");
    const example = cols.map(() => "").join(",");
    const csv = "\uFEFF" + header + "\n" + example + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "omnispace-table.csv"; a.click();
    URL.revokeObjectURL(url);
    toast("Таблица создана (.csv)");
  }

  return (
    <div className="card">
      <b style={{ fontSize: 13.5, fontFamily: "var(--display)", display: "block", marginBottom: 6 }}>Генератор таблиц (Excel/CSV)</b>
      <div style={{ fontSize: 12.5, color: "var(--dim)", marginBottom: 12 }}>
        Опишите таблицу словами — соберётся файл. Формулы и стили добавит локальная модель при запуске; здесь генерируется структура (.csv), которую открывает Excel.
      </div>
      <div className="input-box" style={{ borderRadius: 9 }}>
        <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="Например: смета на ремонт с колонками: Комната, Работы, Материалы, Итого" style={{ fontSize: 13 }} />
        <button className="send" onClick={build}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
        </button>
      </div>
    </div>
  );
}
