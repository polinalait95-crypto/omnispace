// Локальное распознавание намерений для ⌘K (без обращения к Claude — быстро,
// бесплатно, приватно). В Ход-3 объёме: создание задачи и поиск. Финансы и
// прочее подключатся своими ветками по мере готовности бэкенда.

import type { Priority, Direction } from "./api";

export interface TaskIntent {
  kind: "task";
  title: string;
  priority: Priority;
  deadline: number | null;
}
export interface FinanceIntent {
  kind: "finance";
  direction: Direction;
  amount: number; // рубли (major), в копейки переводит вызывающий
  title: string;
}
export interface SearchIntent {
  kind: "search";
  query: string;
}
export type Intent = TaskIntent | FinanceIntent | SearchIntent;

const DAY = 86_400_000;

function endOfDay(offsetDays: number): number {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d.getTime() + offsetDays * DAY;
}

// Слова-триггеры задачи и дедлайна/приоритета.
const TASK_RE = /(напомн|задач|сделать|todo|созвон|позвонить|встреч|дедлайн|купить|написать|отправить)/i;

export function parseLocal(raw: string): Intent {
  const text = raw.trim();
  const lower = text.toLowerCase();

  // 1) Финансы: есть сумма + слова траты/дохода. Проверяем раньше задач.
  const money = lower.match(/(\d[\d\s.,]*)\s*(?:₽|р|руб|rub|\$)?/);
  const spend = /(куп|потрат|расход|заплат|оплат|трат|потратил)/i.test(lower);
  const income = /(получил|доход|зарплат|заработал|пришло|аванс|премия)/i.test(lower);
  if (money && (spend || income)) {
    const amount = parseFloat(money[1].replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(amount) && amount > 0) {
      const title = text
        .replace(money[0], "")
        .replace(/(куп[а-яё]*|потрат[а-яё]*|расход[а-яё]*|заплат[а-яё]*|оплат[а-яё]*|трат[а-яё]*|получил|доход[а-яё]*|зарплат[а-яё]*|заработал|пришло|аванс|преми[а-яё]*|на\s)/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      return { kind: "finance", direction: income ? "income" : "expense", amount, title: title || "без описания" };
    }
  }

  // 2) Задача
  const looksLikeTask = TASK_RE.test(lower) || lower.startsWith("/task");
  if (!looksLikeTask) {
    return { kind: "search", query: text };
  }

  // дедлайн
  let deadline: number | null = null;
  if (/послезавтра/.test(lower)) deadline = endOfDay(2);
  else if (/завтра/.test(lower)) deadline = endOfDay(1);
  else if (/сегодня/.test(lower)) deadline = endOfDay(0);

  // приоритет
  let priority: Priority = "medium";
  if (/(срочно|критич|critical|горит)/.test(lower)) priority = "critical";
  else if (/(важно|high|приоритет)/.test(lower)) priority = "high";
  else if (/(потом|низк|low|когда-нибудь)/.test(lower)) priority = "low";

  // чистим служебные слова (в JS \b не дружит с кириллицей — стрипаем набором)
  const STRIP = /(\/task|напомни(ть)?|задач[а-яё]*|сделать|todo|сегодня|завтра|послезавтра|срочно|критич[а-яё]*|горит|важно|приоритет|потом|низк[а-яё]*|когда-нибудь)/gi;
  const title = text
    .replace(STRIP, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { kind: "task", title: title || text, priority, deadline };
}
