import type { Prefs } from "./api";

export interface UiConf { wallpaper: string; font: string; fontSize: number }

export const WALLPAPERS: Record<string, string> = {
  none: "none",
  copper: "linear-gradient(135deg,rgba(217,142,110,.14),rgba(224,164,88,.10))",
  aurora: "linear-gradient(135deg,rgba(82,199,189,.12),rgba(154,140,224,.12))",
  warm: "linear-gradient(160deg,rgba(224,164,88,.12),transparent 60%)",
  mesh: "radial-gradient(60% 50% at 18% 8%,rgba(180,155,217,.12),transparent),radial-gradient(60% 50% at 92% 18%,rgba(211,162,80,.10),transparent)",
};

export const FONTS: Record<string, string> = {
  Inter: "'Inter',system-ui,sans-serif",
  Bricolage: "'Bricolage Grotesque','Inter',sans-serif",
  Mono: "'JetBrains Mono',monospace",
  Serif: "Georgia,'Times New Roman',serif",
};

export function parseUi(p: Prefs): UiConf {
  try {
    const u = JSON.parse(p.ui || "{}");
    return { wallpaper: u.wallpaper ?? "none", font: u.font ?? "Inter", fontSize: u.fontSize ?? 14 };
  } catch {
    return { wallpaper: "none", font: "Inter", fontSize: 14 };
  }
}

export function applyPrefs(p: Prefs) {
  document.body.dataset.theme = p.theme || "";
  const ui = parseUi(p);
  const s = document.body.style;
  s.setProperty("--wallpaper-img", WALLPAPERS[ui.wallpaper] ?? "none");
  s.setProperty("--user-font", FONTS[ui.font] ?? FONTS.Inter);
  s.setProperty("--user-size", (ui.fontSize || 14) + "px");
}

export function formatClock(now: Date, p: Prefs): { hm: string; sec: string } {
  const tz = p.time_zone || undefined;
  const hm = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: p.time_format === "12h" }).format(now);
  return { hm, sec: String(now.getSeconds()).padStart(2, "0") };
}

export function formatDate(now: Date, p: Prefs): string {
  const tz = p.time_zone || undefined;
  const weekday = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, weekday: "long" }).format(now);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(now);
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  const dd = g("day"), mm = g("month"), yyyy = g("year");
  const num = p.date_format === "MM/DD/YYYY" ? `${mm}/${dd}/${yyyy}` : p.date_format === "YYYY-MM-DD" ? `${yyyy}-${mm}-${dd}` : `${dd}.${mm}.${yyyy}`;
  return `${weekday}, ${num}`;
}
