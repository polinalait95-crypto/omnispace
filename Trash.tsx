import { useCallback, useEffect, useState } from "react";
import { api, type Trashed } from "./api";

const KIND_LABEL: Record<string, string> = {
  task: "Задача", transaction: "Операция", subscription: "Подписка",
  page: "Страница", budget: "Конверт", project: "Проект",
};

export default function Trash({ toast }: { toast: (t: string) => void }) {
  const [items, setItems] = useState<Trashed[]>([]);

  const load = useCallback(async () => setItems(await api.listTrash()), []);
  useEffect(() => { load(); }, [load]);

  async function restore(id: string) {
    await api.restore(id);
    await load();
    toast("Восстановлено");
  }

  async function purge(id: string) {
    await api.purge(id);
    await load();
    toast("Удалено навсегда");
  }

  return (
    <>
      <div className="toolbar">
        <div style={{ fontSize: 13, color: "var(--dim)" }}>
          Удалённое хранится здесь. Восстановите или удалите навсегда.
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty">Корзина пуста.</div>
      ) : (
        <div className="tlist">
          {items.map((it) => (
            <div className="trow" key={it.id}>
              <span className="wlink-kind" style={{ marginRight: 4 }}>{KIND_LABEL[it.kind] ?? it.kind}</span>
              <div className="ttl">{it.title || "Без названия"}</div>
              <span style={{ fontSize: 11, color: "var(--faint)", fontFamily: "var(--mono)" }}>
                {new Date(it.deleted_at).toLocaleDateString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
              <button className="btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => restore(it.id)}>Восстановить</button>
              <button className="btn danger" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => purge(it.id)}>Удалить навсегда</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
