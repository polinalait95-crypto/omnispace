// Типизированные вызовы бэкенда. Под Tauri идут в Rust/SQLite; в обычном
// браузере (без Tauri) — в память, чтобы можно было посмотреть UI до сборки.

export type Status = "open" | "in_progress" | "review" | "done" | "hold";
export type Priority = "critical" | "high" | "medium" | "low";
export type Direction = "expense" | "income";

export interface Transaction {
  id: string;
  title: string;
  direction: Direction;
  amount: number; // копейки
  category: string | null;
  method: string | null;
  occurred_at: number;
}
export interface CategoryTotal { category: string; total: number }
export interface Summary { income: number; expense: number; by_category: CategoryTotal[] }
export interface Envelope { id: string; category: string; limit: number; used: number }

export interface PageMeta { id: string; title: string; parent_id: string | null; icon: string | null }
export interface Page { id: string; title: string; body: string | null; parent_id: string | null }
export interface Version { created_at: number; title: string; body: string | null }
export interface LinkedEntity { id: string; kind: string; title: string; body: string | null; tags: string; created_at: number; updated_at: number }

export type SubStatus = "active" | "expiring" | "overdue" | "paused" | "cancelled";
export interface Subscription {
  id: string; title: string; amount: number | null; currency: string;
  period: string; next_renewal: number | null; status: SubStatus;
  auto_renew: boolean; url: string | null; notify_days: string;
}
export interface Attachment { id: string; entity_id: string; file_name: string; mime: string | null; size: number; created_at: number }
export interface Trashed { id: string; kind: string; title: string; deleted_at: number }
export interface CalItem { id: string; kind: string; title: string; date: number; status: string }
export interface ChatSession { id: string; title: string; updated_at: number }
export interface ChatMessage { id: string; role: string; content: string; meta: string; created_at: number }
export interface Prefs { theme: string; time_zone: string; time_format: string; date_format: string; ui: string }
export interface DocRule { id: string; parent_id: string | null; name: string; file_types: string; action: string | null; prompt: string | null; is_folder: boolean; sort_order: number }

export interface Task {
  id: string;
  title: string;
  body: string | null;
  status: Status;
  priority: Priority;
  deadline: number | null;
  tags: string;
  updated_at: number;
}

// Есть ли настоящий Tauri в окружении.
const hasTauri = typeof (window as any).__TAURI_INTERNALS__ !== "undefined";

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (hasTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  return mock<T>(cmd, args);
}

// -------- мок-хранилище (только для превью в браузере) ----------------------
let seeded = false;
const mem: Task[] = [];
const txns: Transaction[] = [];
const budgets: Envelope[] = [];
interface MockPage { id: string; title: string; body: string | null; parent_id: string | null; versions: Version[] }
const pages: MockPage[] = [];
const linkPairs: { a: string; b: string }[] = [];
const subs: Subscription[] = [];
interface MockAtt extends Attachment { bytes: number[] }
const atts: MockAtt[] = [];
const sessions: ChatSession[] = [];
const messages: ChatMessage[] = [];
let prefs: Prefs = { theme: "", time_zone: "Europe/Moscow", time_format: "24h", date_format: "DD.MM.YYYY", ui: "{}" };
const rules: DocRule[] = [];
let rulesSeeded = false;
function seedRules() {
  if (rulesSeeded) return;
  rulesSeeded = true;
  const fin = { id: crypto.randomUUID(), parent_id: null, name: "Финансы", file_types: "[]", action: null, prompt: null, is_folder: true, sort_order: 0 };
  const law = { id: crypto.randomUUID(), parent_id: null, name: "Юриспруденция", file_types: "[]", action: null, prompt: null, is_folder: true, sort_order: 1 };
  rules.push(fin, law,
    { id: crypto.randomUUID(), parent_id: fin.id, name: "Извлечь расходы из счёта", file_types: '["pdf"]', action: "extract", prompt: "Извлеки суммы, даты и продавцов из {{filename}} и добавь как расходы.", is_folder: false, sort_order: 0 },
    { id: crypto.randomUUID(), parent_id: fin.id, name: "Парсинг банковской выписки", file_types: '["xlsx","csv"]', action: "to_excel", prompt: "Собери таблицу операций по месяцам с итогами.", is_folder: false, sort_order: 1 },
    { id: crypto.randomUUID(), parent_id: law.id, name: "Извлечь сроки из договора", file_types: '["docx","pdf"]', action: "to_tasks", prompt: "Найди все даты и дедлайны в {{filename}}, создай задачи.", is_folder: false, sort_order: 0 }
  );
}
const trashBin: { id: string; kind: string; title: string; deleted_at: number; restore: () => void }[] = [];
function trashItem(id: string) {
  const banks: [any[], string][] = [[mem, "task"], [txns, "transaction"], [subs, "subscription"], [pages, "page"]];
  for (const [arr, kind] of banks) {
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) {
      const [it] = arr.splice(i, 1);
      trashBin.push({ id, kind, title: it.title, deleted_at: Date.now(), restore: () => arr.unshift(it) });
      return;
    }
  }
}
function mkTask(title: string, priority: Priority, status: Status): Task {
  return {
    id: crypto.randomUUID(),
    title,
    body: null,
    status,
    priority,
    deadline: null,
    tags: "[]",
    updated_at: Date.now(),
  };
}
function seed() {
  if (seeded) return;
  seeded = true;
  mem.push(
    mkTask("Свести схему БД под SQLite", "high", "review"),
    mkTask("Прототип оболочки Tauri", "critical", "in_progress"),
    mkTask("Tool-контракты для Carmen", "critical", "in_progress"),
    mkTask("Выбрать движок диаграмм", "low", "open"),
    mkTask("Макет генератора Excel", "medium", "open"),
    mkTask("Урезать scope: убрать CAD и Figma", "medium", "done"),
    mkTask("Выбрать local-first стек", "medium", "done")
  );
  mem[0].deadline = Date.now() + 1 * 86400000;  // «Свести схему БД» — завтра
  mem[3].deadline = Date.now() + 4 * 86400000;  // «Выбрать движок диаграмм» — через 4 дня
  const now = Date.now();
  txns.push(
    { id: crypto.randomUUID(), title: "Зарплата", direction: "income", amount: 8200000, category: null, method: null, occurred_at: now - 2 * 86400000 },
    { id: crypto.randomUUID(), title: "Продукты", direction: "expense", amount: 120000, category: "Еда", method: "Карта", occurred_at: now - 86400000 },
    { id: crypto.randomUUID(), title: "Кофе", direction: "expense", amount: 35000, category: "Еда", method: "Карта", occurred_at: now - 3600000 },
    { id: crypto.randomUUID(), title: "Такси", direction: "expense", amount: 42000, category: "Транспорт", method: "Карта", occurred_at: now - 7200000 },
    { id: crypto.randomUUID(), title: "Claude Pro", direction: "expense", amount: 180000, category: "Подписки", method: "Карта", occurred_at: now - 5 * 86400000 }
  );
  budgets.push(
    { id: crypto.randomUUID(), category: "Еда", limit: 1200000, used: 155000 },
    { id: crypto.randomUUID(), category: "Транспорт", limit: 400000, used: 42000 },
    { id: crypto.randomUUID(), category: "Подписки", limit: 500000, used: 180000 }
  );
  const proj: MockPage = { id: crypto.randomUUID(), title: "Проекты", body: null, parent_id: null, versions: [] };
  const arch: MockPage = {
    id: crypto.randomUUID(), title: "Архитектура MVP",
    body: "# Архитектура MVP\n\nОбщий **хребет** данных: одна таблица `entities` + расширения.\n\n- Глобальный поиск\n- Бэклинки\n- Журнал событий для истории и undo",
    parent_id: proj.id,
    versions: [{ created_at: now - 3600000, title: "Архитектура MVP", body: "Черновик" }],
  };
  pages.push(proj, arch, { id: crypto.randomUUID(), title: "Личное", body: "Заметки", parent_id: null, versions: [] });

  const d = Date.now();
  subs.push(
    { id: crypto.randomUUID(), title: "Spotify", amount: 29900, currency: "RUB", period: "month", next_renewal: d + 30 * 86400000, status: "active", auto_renew: true, url: null, notify_days: "[3]" },
    { id: crypto.randomUUID(), title: "Notion", amount: 1000, currency: "RUB", period: "month", next_renewal: d + 2 * 86400000, status: "expiring", auto_renew: true, url: "https://notion.so", notify_days: "[3,7]" },
    { id: crypto.randomUUID(), title: "Adobe CC", amount: 59900, currency: "RUB", period: "month", next_renewal: d - 86400000, status: "overdue", auto_renew: false, url: null, notify_days: "[3]" },
    { id: crypto.randomUUID(), title: "iCloud", amount: 14900, currency: "RUB", period: "month", next_renewal: d + 20 * 86400000, status: "active", auto_renew: true, url: null, notify_days: "[3]" }
  );
}
async function mock<T>(cmd: string, a?: Record<string, unknown>): Promise<T> {
  seed();
  switch (cmd) {
    case "list_tasks":
      return [...mem].sort((x, y) => y.updated_at - x.updated_at) as unknown as T;
    case "create_task": {
      const t = mkTask(String(a!.title), (a!.priority as Priority) ?? "medium", "open");
      mem.unshift(t);
      return t as unknown as T;
    }
    case "set_task_status": {
      const t = mem.find((m) => m.id === a!.id);
      if (t) { t.status = a!.status as Status; t.updated_at = Date.now(); }
      return undefined as unknown as T;
    }
    case "delete_entity": {
      trashItem(String(a!.id));
      return undefined as unknown as T;
    }
    case "restore_entity": {
      const i = trashBin.findIndex((t) => t.id === a!.id);
      if (i >= 0) { trashBin[i].restore(); trashBin.splice(i, 1); }
      return undefined as unknown as T;
    }
    case "list_trash":
      return trashBin.map(({ restore, ...t }) => (void restore, t)).sort((x, y) => y.deleted_at - x.deleted_at) as unknown as T;
    case "purge_entity": {
      const i = trashBin.findIndex((t) => t.id === a!.id);
      if (i >= 0) trashBin.splice(i, 1);
      for (let k = atts.length - 1; k >= 0; k--) if (atts[k].entity_id === a!.id) atts.splice(k, 1);
      return undefined as unknown as T;
    }
    case "calendar_items": {
      const from = a!.from as number, to = a!.to as number;
      const items: CalItem[] = [];
      mem.forEach((t) => { if (t.deadline != null && t.deadline >= from && t.deadline <= to) items.push({ id: t.id, kind: "task", title: t.title, date: t.deadline, status: t.status }); });
      subs.forEach((s) => { if (s.next_renewal != null && s.next_renewal >= from && s.next_renewal <= to) items.push({ id: s.id, kind: "subscription", title: s.title, date: s.next_renewal, status: s.status }); });
      items.sort((x, y) => x.date - y.date);
      return items as unknown as T;
    }
    case "create_session": {
      const s: ChatSession = { id: crypto.randomUUID(), title: (a!.title as string) ?? "Новый диалог", updated_at: Date.now() };
      sessions.unshift(s);
      return s as unknown as T;
    }
    case "list_sessions":
      return [...sessions].sort((x, y) => y.updated_at - x.updated_at) as unknown as T;
    case "add_message": {
      const m: ChatMessage = { id: crypto.randomUUID(), role: String(a!.role), content: String(a!.content), meta: (a!.meta as string) ?? "{}", created_at: Date.now() };
      messages.push({ ...m, ...({ session_id: a!.session_id } as any) });
      const s = sessions.find((x) => x.id === a!.session_id);
      if (s) { s.updated_at = Date.now(); if (s.title === "Новый диалог") s.title = m.content.slice(0, 60); }
      return m as unknown as T;
    }
    case "list_messages":
      return messages.filter((m: any) => m.session_id === a!.session_id).sort((x, y) => x.created_at - y.created_at) as unknown as T;
    case "get_prefs":
      return prefs as unknown as T;
    case "save_prefs":
      prefs = a!.prefs as Prefs;
      return undefined as unknown as T;
    case "export_all":
      return JSON.stringify({
        version: 1, exported_at: Date.now(),
        entities: mem, transaction_details: txns, subscription_details: subs,
        preferences: [prefs], chat_sessions: sessions, chat_messages: messages,
        doc_rules: rules,
      }, null, 2) as unknown as T;
    case "list_rules":
      seedRules();
      return [...rules].sort((x, y) => x.sort_order - y.sort_order) as unknown as T;
    case "create_rule": {
      const r: DocRule = { id: crypto.randomUUID(), parent_id: (a!.parent_id as string) ?? null, name: String(a!.name), file_types: (a!.file_types as string) ?? "[]", action: (a!.action as string) ?? null, prompt: (a!.prompt as string) ?? null, is_folder: Boolean(a!.is_folder), sort_order: rules.length };
      rules.push(r);
      return r as unknown as T;
    }
    case "update_rule": {
      const r = rules.find((x) => x.id === a!.id);
      if (r) { r.name = String(a!.name); r.file_types = String(a!.file_types); r.action = (a!.action as string) ?? null; r.prompt = (a!.prompt as string) ?? null; }
      return undefined as unknown as T;
    }
    case "delete_rule": {
      for (let i = rules.length - 1; i >= 0; i--) if (rules[i].id === a!.id || rules[i].parent_id === a!.id) rules.splice(i, 1);
      return undefined as unknown as T;
    }
    case "update_task": {
      const t = mem.find((m) => m.id === a!.id);
      if (t) { t.title = String(a!.title); t.priority = a!.priority as Priority; t.deadline = (a!.deadline as number) ?? null; t.updated_at = Date.now(); }
      return undefined as unknown as T;
    }
    case "update_transaction": {
      const t = txns.find((x) => x.id === a!.id);
      if (t) { t.direction = a!.direction as Direction; t.amount = a!.amount as number; t.title = String(a!.title); t.category = (a!.category as string) ?? null; t.occurred_at = a!.occurred_at as number; }
      return undefined as unknown as T;
    }
    case "update_subscription": {
      const s = subs.find((x) => x.id === a!.id);
      if (s) { s.title = String(a!.title); s.amount = (a!.amount as number) ?? null; s.period = String(a!.period); s.next_renewal = (a!.next_renewal as number) ?? null; s.notify_days = String(a!.notify_days); s.url = (a!.url as string) ?? null; }
      return undefined as unknown as T;
    }
    case "search": {
      const q = String(a!.query).toLowerCase();
      return mem.filter((m) => m.title.toLowerCase().includes(q)) as unknown as T;
    }
    case "list_transactions": {
      let r = [...txns];
      if (a?.category) r = r.filter((t) => t.category === a.category);
      if (a?.from) r = r.filter((t) => t.occurred_at >= (a.from as number));
      return r.sort((x, y) => y.occurred_at - x.occurred_at) as unknown as T;
    }
    case "add_transaction": {
      const t: Transaction = {
        id: crypto.randomUUID(), title: String(a!.title), direction: a!.direction as Direction,
        amount: a!.amount as number, category: (a!.category as string) ?? null,
        method: (a!.method as string) ?? null, occurred_at: (a!.occurred_at as number) ?? Date.now(),
      };
      txns.unshift(t);
      const env = budgets.find((b) => b.category === t.category);
      if (env && t.direction === "expense") env.used += t.amount;
      return t as unknown as T;
    }
    case "finance_summary": {
      const income = txns.filter((t) => t.direction === "income").reduce((s, t) => s + t.amount, 0);
      const expense = txns.filter((t) => t.direction === "expense").reduce((s, t) => s + t.amount, 0);
      const byCat: Record<string, number> = {};
      txns.filter((t) => t.direction === "expense").forEach((t) => {
        const c = t.category ?? "Без категории";
        byCat[c] = (byCat[c] ?? 0) + t.amount;
      });
      const by_category = Object.entries(byCat).map(([category, total]) => ({ category, total })).sort((x, y) => y.total - x.total);
      return { income, expense, by_category } as unknown as T;
    }
    case "list_budgets":
      return [...budgets] as unknown as T;
    case "add_budget":
      budgets.push({ id: crypto.randomUUID(), category: String(a!.category), limit: a!.limit as number, used: 0 });
      return undefined as unknown as T;
    case "list_pages":
      return pages.map((p) => ({ id: p.id, title: p.title, parent_id: p.parent_id, icon: null })) as unknown as T;
    case "get_page": {
      const p = pages.find((x) => x.id === a!.id);
      return (p ? { id: p.id, title: p.title, body: p.body, parent_id: p.parent_id } : null) as unknown as T;
    }
    case "create_page": {
      const p: MockPage = {
        id: crypto.randomUUID(), title: String(a!.title), body: (a!.body as string) ?? null,
        parent_id: (a!.parent_id as string) ?? null,
        versions: [{ created_at: Date.now(), title: String(a!.title), body: (a!.body as string) ?? null }],
      };
      pages.push(p);
      return { id: p.id, title: p.title, body: p.body, parent_id: p.parent_id } as unknown as T;
    }
    case "update_page": {
      const p = pages.find((x) => x.id === a!.id);
      if (p) {
        p.title = String(a!.title); p.body = (a!.body as string) ?? null;
        p.versions.unshift({ created_at: Date.now(), title: p.title, body: p.body });
      }
      return (p ? { id: p.id, title: p.title, body: p.body, parent_id: p.parent_id } : null) as unknown as T;
    }
    case "page_versions": {
      const p = pages.find((x) => x.id === a!.id);
      return (p ? [...p.versions] : []) as unknown as T;
    }
    case "create_link": {
      const [from, to] = [String(a!.from), String(a!.to)];
      if (!linkPairs.some((l) => (l.a === from && l.b === to) || (l.a === to && l.b === from)))
        linkPairs.push({ a: from, b: to });
      return undefined as unknown as T;
    }
    case "list_links": {
      const id = String(a!.id);
      const ids = linkPairs.filter((l) => l.a === id || l.b === id).map((l) => (l.a === id ? l.b : l.a));
      const found = ids.map((i) => mem.find((m) => m.id === i) || pages.find((p) => p.id === i)).filter(Boolean) as any[];
      return found.map((f) => ({
        id: f.id, kind: "status" in f ? "task" : "page", title: f.title,
        body: null, tags: "[]", created_at: 0, updated_at: 0,
      })) as unknown as T;
    }
    case "list_subscriptions":
      return [...subs].sort((x, y) => (x.next_renewal ?? 0) - (y.next_renewal ?? 0)) as unknown as T;
    case "add_subscription":
      subs.push({
        id: crypto.randomUUID(), title: String(a!.title), amount: (a!.amount as number) ?? null,
        currency: "RUB", period: (a!.period as string) ?? "month", next_renewal: (a!.next_renewal as number) ?? null,
        status: "active", auto_renew: true, url: (a!.url as string) ?? null, notify_days: (a!.notify_days as string) ?? "[3]",
      });
      return undefined as unknown as T;
    case "set_subscription_status": {
      const s = subs.find((x) => x.id === a!.id);
      if (s) s.status = a!.status as SubStatus;
      return undefined as unknown as T;
    }
    case "list_attachments":
      return atts.filter((x) => x.entity_id === a!.entity_id).map(({ bytes, ...m }) => (void bytes, m)) as unknown as T;
    case "save_attachment": {
      const at: MockAtt = {
        id: crypto.randomUUID(), entity_id: String(a!.entity_id), file_name: String(a!.file_name),
        mime: (a!.mime as string) ?? null, size: (a!.bytes as number[]).length, created_at: Date.now(),
        bytes: a!.bytes as number[],
      };
      atts.push(at);
      const { bytes, ...meta } = at; void bytes;
      return meta as unknown as T;
    }
    case "read_attachment": {
      const at = atts.find((x) => x.id === a!.id);
      return (at ? at.bytes : []) as unknown as T;
    }
    case "delete_attachment": {
      const i = atts.findIndex((x) => x.id === a!.id);
      if (i >= 0) atts.splice(i, 1);
      return undefined as unknown as T;
    }
    default:
      return undefined as unknown as T;
  }
}

export const api = {
  isMock: !hasTauri,
  listTasks: () => call<Task[]>("list_tasks"),
  createTask: (title: string, priority: Priority = "medium", deadline: number | null = null) =>
    call<Task>("create_task", { title, priority, deadline }),
  setStatus: (id: string, status: Status) => call<void>("set_task_status", { id, status }),
  updateTask: (id: string, title: string, priority: Priority, deadline: number | null) =>
    call<void>("update_task", { id, title, priority, deadline }),
  remove: (id: string) => call<void>("delete_entity", { id }),
  restore: (id: string) => call<void>("restore_entity", { id }),
  search: (query: string) => call<Task[]>("search", { query }),
  listTrash: () => call<Trashed[]>("list_trash"),
  purge: (id: string) => call<void>("purge_entity", { id }),
  calendarItems: (from: number, to: number) => call<CalItem[]>("calendar_items", { from, to }),

  // Carmen (чат)
  createSession: (title?: string) => call<ChatSession>("create_session", { title: title ?? null }),
  listSessions: () => call<ChatSession[]>("list_sessions"),
  addMessage: (sessionId: string, role: string, content: string, meta = "{}") =>
    call<ChatMessage>("add_message", { session_id: sessionId, role, content, meta }),
  listMessages: (sessionId: string) => call<ChatMessage[]>("list_messages", { session_id: sessionId }),

  // настройки
  getPrefs: () => call<Prefs>("get_prefs"),
  savePrefs: (prefs: Prefs) => call<void>("save_prefs", { prefs }),
  exportAll: () => call<string>("export_all"),

  // правила обработки документов
  listRules: () => call<DocRule[]>("list_rules"),
  createRule: (r: { parentId: string | null; name: string; fileTypes: string; action: string | null; prompt: string | null; isFolder: boolean }) =>
    call<DocRule>("create_rule", { parent_id: r.parentId, name: r.name, file_types: r.fileTypes, action: r.action, prompt: r.prompt, is_folder: r.isFolder }),
  updateRule: (id: string, name: string, fileTypes: string, action: string | null, prompt: string | null) =>
    call<void>("update_rule", { id, name, file_types: fileTypes, action, prompt }),
  deleteRule: (id: string) => call<void>("delete_rule", { id }),

  // финансы (суммы — в копейках)
  listTransactions: (from: number | null = null, to: number | null = null, category: string | null = null) =>
    call<Transaction[]>("list_transactions", { from, to, category }),
  addTransaction: (t: {
    direction: Direction; amount: number; title: string;
    category?: string | null; method?: string | null; occurredAt?: number | null;
  }) => call<Transaction>("add_transaction", {
    direction: t.direction, amount: t.amount, title: t.title,
    category: t.category ?? null, method: t.method ?? null, occurred_at: t.occurredAt ?? null,
  }),
  summary: (from: number | null = null, to: number | null = null) =>
    call<Summary>("finance_summary", { from, to }),
  updateTransaction: (id: string, t: { direction: Direction; amount: number; title: string; category: string | null; occurredAt: number }) =>
    call<void>("update_transaction", { id, direction: t.direction, amount: t.amount, title: t.title, category: t.category, occurred_at: t.occurredAt }),
  listBudgets: () => call<Envelope[]>("list_budgets"),
  addBudget: (category: string, limit: number) => call<void>("add_budget", { category, limit }),

  // база знаний
  listPages: () => call<PageMeta[]>("list_pages"),
  getPage: (id: string) => call<Page | null>("get_page", { id }),
  createPage: (title: string, body: string | null = null, parentId: string | null = null) =>
    call<Page>("create_page", { title, body, parent_id: parentId }),
  updatePage: (id: string, title: string, body: string | null) =>
    call<Page>("update_page", { id, title, body }),
  pageVersions: (id: string) => call<Version[]>("page_versions", { id }),
  listLinks: (id: string) => call<LinkedEntity[]>("list_links", { id }),
  createLink: (from: string, to: string, rel = "related") => call<void>("create_link", { from, to, rel }),

  // подписки (трекер)
  listSubscriptions: () => call<Subscription[]>("list_subscriptions"),
  addSubscription: (s: {
    title: string; amount?: number | null; period?: string;
    nextRenewal?: number | null; notifyDays?: string; url?: string | null;
  }) => call<void>("add_subscription", {
    title: s.title, amount: s.amount ?? null, period: s.period ?? "month",
    next_renewal: s.nextRenewal ?? null, notify_days: s.notifyDays ?? "[3]", url: s.url ?? null,
  }),
  setSubStatus: (id: string, status: SubStatus) => call<void>("set_subscription_status", { id, status }),
  updateSubscription: (id: string, s: { title: string; amount: number | null; period: string; nextRenewal: number | null; notifyDays: string; url: string | null }) =>
    call<void>("update_subscription", { id, title: s.title, amount: s.amount, period: s.period, next_renewal: s.nextRenewal, notify_days: s.notifyDays, url: s.url }),

  // вложения (файлы на диске)
  listAttachments: (entityId: string) => call<Attachment[]>("list_attachments", { entity_id: entityId }),
  saveAttachment: (entityId: string, fileName: string, mime: string | null, bytes: number[]) =>
    call<Attachment>("save_attachment", { entity_id: entityId, file_name: fileName, mime, bytes }),
  readAttachment: (id: string) => call<number[]>("read_attachment", { id }),
  deleteAttachment: (id: string) => call<void>("delete_attachment", { id }),
};
