import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type PageMeta, type Page, type Version, type LinkedEntity, type Task } from "./api";
import { md } from "./md";

export default function Wiki({ toast }: { toast: (t: string) => void }) {
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [links, setLinks] = useState<LinkedEntity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const saveTimer = useRef<number | null>(null);
  const dirty = useRef(false);

  const loadTree = useCallback(async () => {
    const p = await api.listPages();
    setPages(p);
    if (!sel && p.length) setSel(p[0].id);
  }, [sel]);

  useEffect(() => { loadTree(); api.listTasks().then(setTasks); }, [loadTree]);

  const openPage = useCallback(async (id: string) => {
    const p = await api.getPage(id);
    if (!p) return;
    setPage(p); setTitle(p.title); setBody(p.body ?? ""); dirty.current = false;
    setVersions(await api.pageVersions(id));
    setLinks(await api.listLinks(id));
  }, []);

  useEffect(() => { if (sel) openPage(sel); }, [sel, openPage]);

  // автосохранение (debounce) — каждое сохранение создаёт версию в журнале
  useEffect(() => {
    if (!page || !dirty.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      await api.updatePage(page.id, title || "Без названия", body || null);
      setVersions(await api.pageVersions(page.id));
      setPages(await api.listPages());
      toast("Сохранено");
      dirty.current = false;
    }, 800);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [title, body, page, toast]);

  const edit = (fn: () => void) => { dirty.current = true; fn(); };

  async function newPage(parent: string | null) {
    const p = await api.createPage("Новая страница", "", parent);
    await loadTree();
    setSel(p.id);
    toast("Страница создана");
  }

  async function restore(v: Version) {
    if (!page) return;
    await api.updatePage(page.id, v.title, v.body);
    await openPage(page.id);
    setPages(await api.listPages());
    toast("Версия восстановлена");
  }

  async function linkTask(taskId: string) {
    if (!page || !taskId) return;
    await api.createLink(page.id, taskId);
    setLinks(await api.listLinks(page.id));
    toast("Связано");
  }

  async function deletePage(id: string) {
    await api.remove(id);
    if (sel === id) { setSel(null); setPage(null); }
    await loadTree();
    toast("Страница в корзине");
  }

  // дерево из плоского списка
  const roots = useMemo(() => pages.filter((p) => !p.parent_id), [pages]);
  const childrenOf = (id: string) => pages.filter((p) => p.parent_id === id);

  const treeItem = (p: PageMeta, depth: number) => (
    <div key={p.id}>
      <div className={"wtree" + (sel === p.id ? " on" : "")} style={{ paddingLeft: 10 + depth * 16 }} onClick={() => setSel(p.id)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></svg>
        <span>{p.title}</span>
        <span className="wdel" title="В корзину" onClick={(e) => { e.stopPropagation(); deletePage(p.id); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
        </span>
        <span className="wadd" title="Подстраница" onClick={(e) => { e.stopPropagation(); newPage(p.id); }}>+</span>
      </div>
      {childrenOf(p.id).map((c) => treeItem(c, depth + 1))}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "230px 1fr 250px", gap: 16, alignItems: "start" }}>
      {/* дерево */}
      <div className="card" style={{ padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 10px" }}>
          <b style={{ fontSize: 13, fontFamily: "var(--display)" }}>Страницы</b>
          <span className="wadd" onClick={() => newPage(null)} title="Новая страница">+</span>
        </div>
        {roots.length === 0 && <div style={{ fontSize: 12.5, color: "var(--faint)", padding: 8 }}>Создайте первую страницу.</div>}
        {roots.map((p) => treeItem(p, 0))}
      </div>

      {/* редактор */}
      <div className="card" style={{ padding: "20px 24px", minHeight: 400 }}>
        {!page ? (
          <div className="empty">Выберите или создайте страницу.</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <input
                value={title}
                onChange={(e) => edit(() => setTitle(e.target.value))}
                placeholder="Заголовок"
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text)", fontFamily: "var(--display)", fontSize: 24, fontWeight: 600 }}
              />
              <div className="seg">
                <button className={!preview ? "on" : ""} onClick={() => setPreview(false)}>Редактор</button>
                <button className={preview ? "on" : ""} onClick={() => setPreview(true)}>Просмотр</button>
              </div>
            </div>
            {preview ? (
              <div className="prose" dangerouslySetInnerHTML={{ __html: md(body) }} />
            ) : (
              <textarea
                value={body}
                onChange={(e) => edit(() => setBody(e.target.value))}
                placeholder={"Пишите в Markdown. Наберите # для заголовка, - для списка, ** для жирного.\nАвтосохранение и версии — из коробки."}
                style={{ width: "100%", minHeight: 340, background: "none", border: "none", outline: "none", resize: "vertical", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 13.5, lineHeight: 1.7 }}
              />
            )}
          </>
        )}
      </div>

      {/* история + связи */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <b style={{ fontSize: 12.5, fontFamily: "var(--display)", display: "block", marginBottom: 10 }}>История версий</b>
          {versions.length === 0 && <div style={{ fontSize: 12, color: "var(--faint)" }}>—</div>}
          {versions.map((v, i) => (
            <div key={i} className="wver">
              <div>
                <div style={{ fontSize: 12.5 }}>{i === 0 ? "Текущая" : "Версия"}</div>
                <small style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10.5 }}>
                  {new Date(v.created_at).toLocaleString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </small>
              </div>
              {i !== 0 && <button className="wrestore" onClick={() => restore(v)}>Откатить</button>}
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 14 }}>
          <b style={{ fontSize: 12.5, fontFamily: "var(--display)", display: "block", marginBottom: 10 }}>Связи</b>
          {links.length === 0 && <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 10 }}>Пока нет связей.</div>}
          {links.map((l) => (
            <div key={l.id} className="wlink">
              <span className="wlink-kind">{l.kind === "task" ? "задача" : l.kind === "page" ? "стр." : l.kind}</span>
              <span>{l.title}</span>
            </div>
          ))}
          {page && tasks.length > 0 && (
            <select className="wselect" defaultValue="" onChange={(e) => { linkTask(e.target.value); e.currentTarget.value = ""; }}>
              <option value="" disabled>+ связать задачу…</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
