import type { Prefs } from "./api";
import { WALLPAPERS, FONTS, parseUi } from "./prefs";

const THEMES: { key: string; label: string; base: string; accent: string }[] = [
  { key: "", label: "Графит", base: "linear-gradient(180deg,#242019,#131110)", accent: "linear-gradient(175deg,#ECCE89,#C79338)" },
  { key: "light", label: "Лён", base: "linear-gradient(180deg,#FFFDF8,#E3DED3)", accent: "linear-gradient(175deg,#CA9E46,#9C6F22)" },
  { key: "bordeaux", label: "Медь", base: "linear-gradient(180deg,#261E1B,#140F0E)", accent: "linear-gradient(175deg,#F0B48F,#CE7A52)" },
  { key: "purple", label: "Аметист", base: "linear-gradient(180deg,#221C2E,#110E17)", accent: "linear-gradient(175deg,#D9C0F0,#A97FD6)" },
  { key: "contrast", label: "Оникс", base: "linear-gradient(180deg,#161412,#000)", accent: "linear-gradient(175deg,#F2D48C,#D19A3E)" },
];
const WALL_LABELS: Record<string, string> = { none: "Нет", copper: "Медь", aurora: "Аврора", warm: "Тёплые", mesh: "Меш" };
const TZ = ["Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Novosibirsk", "Asia/Vladivostok", "UTC", "Europe/London", "America/New_York"];

export default function Settings({ prefs, onChange }: { prefs: Prefs; onChange: (p: Prefs) => void }) {
  const ui = parseUi(prefs);
  const setUi = (patch: Partial<ReturnType<typeof parseUi>>) =>
    onChange({ ...prefs, ui: JSON.stringify({ ...ui, ...patch }) });

  return (
    <div className="setting-block" style={{ maxWidth: 620 }}>
      <div className="note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        <div>Настройки, кастомизация и «админка» — в одном месте. Всё сохраняется локально в БД и переживает перезапуск.</div>
      </div>

      <div className="sec-title">Тема оформления</div>
      <div className="theme-row">
        {THEMES.map((t) => (
          <div key={t.key} className={"theme-opt" + (prefs.theme === t.key ? " on" : "")} onClick={() => onChange({ ...prefs, theme: t.key })}>
            <div className="theme-prev"><i style={{ background: t.base }} /><i style={{ background: t.accent }} /></div>
            <b>{t.label}</b>
          </div>
        ))}
      </div>

      <div className="sec-title">Обои</div>
      <div className="theme-row">
        {Object.keys(WALLPAPERS).map((k) => (
          <div key={k} className={"wall-opt" + (ui.wallpaper === k ? " on" : "")} style={{ flex: 1, minWidth: 84, background: k === "none" ? "var(--panel2)" : `${WALLPAPERS[k]}, var(--panel2)` }} onClick={() => setUi({ wallpaper: k })}>
            <span style={{ fontSize: 11, color: "var(--dim)", padding: 6, display: "block" }}>{WALL_LABELS[k]}</span>
          </div>
        ))}
      </div>

      <div className="sec-title">Шрифт</div>
      <div className="set-row">
        <div className="sl"><b>Основной шрифт</b><small>Применяется ко всему интерфейсу</small></div>
        <select className="field-select" value={ui.font} onChange={(e) => setUi({ font: e.target.value })}>
          {Object.keys(FONTS).map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div className="set-row">
        <div className="sl"><b>Размер, {ui.fontSize}px</b><small>12–18px</small></div>
        <input type="range" min={12} max={18} value={ui.fontSize} onChange={(e) => setUi({ fontSize: Number(e.target.value) })} style={{ width: 160 }} />
      </div>

      <div className="sec-title">Время и дата</div>
      <div className="set-row">
        <div className="sl"><b>Часовой пояс</b><small>Влияет на часы и календарь</small></div>
        <select className="field-select" value={prefs.time_zone} onChange={(e) => onChange({ ...prefs, time_zone: e.target.value })}>
          {TZ.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>
      <div className="set-row">
        <div className="sl"><b>Формат времени</b></div>
        <div className="seg">
          <button className={prefs.time_format === "24h" ? "on" : ""} onClick={() => onChange({ ...prefs, time_format: "24h" })}>24 часа</button>
          <button className={prefs.time_format === "12h" ? "on" : ""} onClick={() => onChange({ ...prefs, time_format: "12h" })}>12 часов</button>
        </div>
      </div>
      <div className="set-row">
        <div className="sl"><b>Формат даты</b></div>
        <select className="field-select" value={prefs.date_format} onChange={(e) => onChange({ ...prefs, date_format: e.target.value })}>
          <option value="DD.MM.YYYY">ДД.ММ.ГГГГ</option>
          <option value="MM/DD/YYYY">ММ/ДД/ГГГГ</option>
          <option value="YYYY-MM-DD">ГГГГ-ММ-ДД</option>
        </select>
      </div>

      <div className="sec-title">Данные</div>
      <div className="set-row">
        <div className="sl"><b>Резервная копия</b><small>Экспорт всех данных в один JSON-файл</small></div>
        <button className="btn primary" onClick={async () => {
          const json = await import("./api").then((m) => m.api.exportAll());
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `omnispace-backup-${new Date().toISOString().slice(0, 10)}.json`;
          link.click();
          URL.revokeObjectURL(url);
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>Скачать бэкап
        </button>
      </div>
      <div className="set-row"><div className="sl"><b>Хранилище</b><small>SQLite + файлы на этом Маке</small></div><span style={{ fontSize: 12.5, color: "var(--faint)" }}>локально</span></div>
      <div className="set-row"><div className="sl"><b>AI / Carmen</b><small>Локально, без облака и ключей</small></div><span style={{ fontSize: 12.5, color: "var(--green)" }}>офлайн</span></div>
    </div>
  );
}
