-- ============================================================================
-- OmniSpace · схема данных (Ход 1)
-- SQLite, local-first, один пользователь (с заделом на приглашение второго)
--
-- ФИЛОСОФИЯ «ОБЩЕГО ХРЕБТА»:
--   Задача, страница, транзакция, подписка, диалог — это всё СУЩНОСТИ одного
--   вида. У каждой есть id, тип, заголовок, теги, даты, мягкое удаление и связи.
--   Поэтому есть ОДНА базовая таблица `entities` (хребет) + узкие таблицы-
--   расширения (`*_details`) только там, где нужны типизированные, индексируемые
--   поля (суммы, дедлайны, статусы) для быстрых выборок и аналитики.
--
--   Что это даёт бесплатно:
--     • глобальный поиск по всему пространству   — один запрос по entities
--     • бэклинки «задача ↔ расход ↔ страница»    — таблица links
--     • осведомлённость Carmen обо всём           — она читает entities+links
--     • история версий, обзоры, undo, аналитика   — из журнала events
--     • корзина                                    — deleted_at, а не DELETE
--
-- ВСЕГО 12 ТАБЛИЦ. Больше на старте не нужно.
-- ============================================================================

PRAGMA foreign_keys = ON;      -- ссылочная целостность
PRAGMA journal_mode = WAL;     -- быстрые записи, не блокирует чтение
PRAGMA synchronous = NORMAL;   -- разумный баланс скорость/надёжность для десктопа

-- ----------------------------------------------------------------------------
-- 0. Пользователи. Обычно один (локальный профиль). Задел на приглашение.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id          TEXT PRIMARY KEY,                 -- UUID (генерит приложение)
  name        TEXT NOT NULL DEFAULT 'Локальный профиль',
  email       TEXT,                             -- только если пригласят второго
  role        TEXT NOT NULL DEFAULT 'owner',    -- owner | guest
  created_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec')*1000 AS INTEGER))
);

-- ----------------------------------------------------------------------------
-- 1. ХРЕБЕТ. Каждая вещь в пространстве живёт здесь.
--    kind задаёт тип; типизированные поля — в соответствующей *_details.
-- ----------------------------------------------------------------------------
CREATE TABLE entities (
  id          TEXT PRIMARY KEY,                 -- UUID
  user_id     TEXT NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL,                    -- 'task'|'project'|'page'|
                                                -- 'transaction'|'subscription'|
                                                -- 'chat_session'|'doc'|'event'
  title       TEXT NOT NULL DEFAULT '',         -- отображаемое имя / первая строка
  body        TEXT,                             -- описание / контент (markdown)
  tags        TEXT NOT NULL DEFAULT '[]',       -- JSON-массив: ["work","urgent"]
  data        TEXT NOT NULL DEFAULT '{}',       -- JSON: kind-специфичные мелочи,
                                                -- которым не нужен свой столбец
  parent_id   TEXT REFERENCES entities(id),     -- иерархия (проект→подпроект→задача)
  sort_order  REAL NOT NULL DEFAULT 0,          -- ручная сортировка (drag-and-drop)
  created_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec')*1000 AS INTEGER)),
  updated_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec')*1000 AS INTEGER)),
  deleted_at  INTEGER                           -- NULL = живая; иначе в корзине
);

CREATE INDEX idx_entities_user_kind   ON entities(user_id, kind, deleted_at);
CREATE INDEX idx_entities_parent      ON entities(parent_id);
CREATE INDEX idx_entities_updated     ON entities(updated_at);

-- Бампаем updated_at на любой правке (чтобы не забывать в коде)
CREATE TRIGGER trg_entities_touch
AFTER UPDATE ON entities FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at          -- только если код сам не проставил
BEGIN
  UPDATE entities SET updated_at = CAST(unixepoch('now','subsec')*1000 AS INTEGER) WHERE id = NEW.id;
END;

-- Полнотекстовый поиск по всему пространству (один индекс на всё)
CREATE VIRTUAL TABLE entities_fts USING fts5(
  title, body, tags,
  content='entities', content_rowid='rowid'
);
CREATE TRIGGER trg_fts_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(rowid,title,body,tags)
  VALUES (new.rowid,new.title,new.body,new.tags);
END;
CREATE TRIGGER trg_fts_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts,rowid,title,body,tags)
  VALUES('delete',old.rowid,old.title,old.body,old.tags);
END;
CREATE TRIGGER trg_fts_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts,rowid,title,body,tags)
  VALUES('delete',old.rowid,old.title,old.body,old.tags);
  INSERT INTO entities_fts(rowid,title,body,tags)
  VALUES (new.rowid,new.title,new.body,new.tags);
END;

-- Удобное представление: только живые сущности
CREATE VIEW v_live AS SELECT * FROM entities WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2–5. РАСШИРЕНИЯ ХРЕБТА (1:1 к entities). Только типизированные поля,
--       по которым нужны фильтры/сортировки/агрегации.
-- ----------------------------------------------------------------------------

-- 2. Задачи
CREATE TABLE task_details (
  entity_id   TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'open',     -- open|in_progress|review|done|hold
  priority    TEXT NOT NULL DEFAULT 'medium',   -- critical|high|medium|low
  deadline    INTEGER,                          -- unix-время дедлайна (NULL — нет)
  checklist   TEXT NOT NULL DEFAULT '[]'        -- JSON: [{text,done}]
);
CREATE INDEX idx_task_status   ON task_details(status);
CREATE INDEX idx_task_deadline ON task_details(deadline);

-- 3. Транзакции (ручной учёт; оплаты подписок — на паузе)
CREATE TABLE transaction_details (
  entity_id   TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL,                    -- 'expense' | 'income'
  amount      INTEGER NOT NULL,                 -- в МИНОРНЫХ единицах (копейки!)
  currency    TEXT NOT NULL DEFAULT 'RUB',
  category    TEXT,                             -- 'Еда','Транспорт',...
  method      TEXT,                             -- 'Карта','Наличные',...
  occurred_at INTEGER NOT NULL                  -- когда была операция
);
CREATE INDEX idx_txn_time ON transaction_details(occurred_at);
CREATE INDEX idx_txn_cat  ON transaction_details(category);

-- 4. Подписки (только трекинг дат/статусов — БЕЗ платёжной логики)
CREATE TABLE subscription_details (
  entity_id     TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  amount        INTEGER,                        -- копейки, справочно
  currency      TEXT NOT NULL DEFAULT 'RUB',
  period        TEXT NOT NULL DEFAULT 'month',  -- month|year|week|custom
  next_renewal  INTEGER,                        -- дата следующего продления
  status        TEXT NOT NULL DEFAULT 'active', -- active|expiring|overdue|paused|cancelled
  auto_renew    INTEGER NOT NULL DEFAULT 1,     -- 0/1
  url           TEXT,
  notify_days   TEXT NOT NULL DEFAULT '[3]'     -- JSON: за сколько дней напомнить
);
CREATE INDEX idx_sub_renewal ON subscription_details(next_renewal);
CREATE INDEX idx_sub_status  ON subscription_details(status);

-- 5. Страницы базы знаний (Confluence-логика; иерархия — через entities.parent_id)
CREATE TABLE page_details (
  entity_id   TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  format      TEXT NOT NULL DEFAULT 'blocks',   -- blocks|markdown
  icon        TEXT                              -- имя иконки для дерева
);

-- ----------------------------------------------------------------------------
-- 6. СВЯЗИ (граф). Бэклинки между чем угодно: задача↔расход↔страница↔диалог.
-- ----------------------------------------------------------------------------
CREATE TABLE links (
  id          TEXT PRIMARY KEY,
  from_id     TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_id       TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  rel         TEXT NOT NULL DEFAULT 'related',  -- related|mentions|blocks|source|child
  created_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec')*1000 AS INTEGER)),
  UNIQUE(from_id, to_id, rel)
);
CREATE INDEX idx_links_from ON links(from_id);
CREATE INDEX idx_links_to   ON links(to_id);

-- ----------------------------------------------------------------------------
-- 7. ЖУРНАЛ СОБЫТИЙ (append-only). Один механизм — четыре функции:
--    история версий wiki · еженедельный обзор Carmen · аналитика · undo.
-- ----------------------------------------------------------------------------
CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  entity_id   TEXT REFERENCES entities(id),     -- над чем действие (может быть NULL)
  actor       TEXT NOT NULL DEFAULT 'user',     -- user | carmen | system | cmdk
  action      TEXT NOT NULL,                    -- 'create'|'update'|'delete'|
                                                -- 'restore'|'status_change'|...
  before      TEXT,                             -- JSON-снимок ДО (для undo/diff)
  after       TEXT,                             -- JSON-снимок ПОСЛЕ
  created_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec')*1000 AS INTEGER))
);
CREATE INDEX idx_events_entity ON events(entity_id, created_at);
CREATE INDEX idx_events_time   ON events(created_at);

-- ----------------------------------------------------------------------------
-- 8. ВЛОЖЕНИЯ. Файлы лежат на диске, тут — метаданные и путь.
-- ----------------------------------------------------------------------------
CREATE TABLE attachments (
  id          TEXT PRIMARY KEY,
  entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,                    -- относительный путь в хранилище
  mime        TEXT,
  size        INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec')*1000 AS INTEGER))
);
CREATE INDEX idx_attach_entity ON attachments(entity_id);

-- ----------------------------------------------------------------------------
-- 9. ПРАВИЛА AI-ОБРАБОТКИ ДОКУМЕНТОВ (боковое дерево; иерархия через parent_id).
-- ----------------------------------------------------------------------------
CREATE TABLE doc_rules (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  parent_id   TEXT REFERENCES doc_rules(id),    -- папки правил
  name        TEXT NOT NULL,
  file_types  TEXT NOT NULL DEFAULT '[]',       -- JSON: ["pdf","docx","xlsx"]
  action      TEXT,                             -- extract|report|to_wiki|to_tasks|to_excel
  prompt      TEXT,                             -- шаблон промпта с {{filename}} и т.п.
  is_folder   INTEGER NOT NULL DEFAULT 0,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec')*1000 AS INTEGER))
);
CREATE INDEX idx_rules_parent ON doc_rules(parent_id);

-- ----------------------------------------------------------------------------
-- 10. УВЕДОМЛЕНИЯ (локальные + Telegram; каналы — в channel).
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  entity_id   TEXT REFERENCES entities(id),     -- к чему относится (дедлайн/продление)
  title       TEXT NOT NULL,
  body        TEXT,
  channel     TEXT NOT NULL DEFAULT 'local',    -- local | telegram | email
  fire_at     INTEGER,                          -- когда показать/отправить
  sent_at     INTEGER,                          -- когда фактически отправлено
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec')*1000 AS INTEGER))
);
CREATE INDEX idx_notif_fire ON notifications(fire_at, sent_at);

-- ----------------------------------------------------------------------------
-- 11. НАСТРОЙКИ. Одна строка на пользователя, всё остальное — JSON.
--     Темы, обои, шрифты, макеты, часовой пояс, ключ Claude и т.д.
-- ----------------------------------------------------------------------------
CREATE TABLE preferences (
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  theme       TEXT NOT NULL DEFAULT '',         -- ''|light|bordeaux|purple|contrast
  time_zone   TEXT NOT NULL DEFAULT 'Europe/Moscow',
  time_format TEXT NOT NULL DEFAULT '24h',
  date_format TEXT NOT NULL DEFAULT 'DD.MM.YYYY',
  ui          TEXT NOT NULL DEFAULT '{}',       -- JSON: обои, шрифты, порядок меню,
                                                --       макеты рабочих областей
  ai          TEXT NOT NULL DEFAULT '{}',       -- JSON: {claudeKey, useOllama, ...}
  updated_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec')*1000 AS INTEGER))
);

-- ----------------------------------------------------------------------------
-- 12. СООБЩЕНИЯ ЧАТА Carmen. Сам диалог — это entity(kind='chat_session'),
--     а сообщения высокочастотны, поэтому вынесены в свою таблицу.
-- ----------------------------------------------------------------------------
CREATE TABLE chat_messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,                    -- user | assistant
  content     TEXT NOT NULL,
  meta        TEXT NOT NULL DEFAULT '{}',       -- JSON: карточки, вызванные действия
  created_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec')*1000 AS INTEGER))
);
CREATE INDEX idx_msg_session ON chat_messages(session_id, created_at);

-- ============================================================================
-- ПРИМЕРЫ ЗАПРОСОВ, которые эта схема делает тривиальными:
--
--   Глобальный поиск (⌘K):
--     SELECT e.* FROM entities_fts f JOIN entities e ON e.rowid=f.rowid
--     WHERE entities_fts MATCH ? AND e.deleted_at IS NULL LIMIT 20;
--
--   Все живые задачи «в работе» с ближайшим дедлайном:
--     SELECT e.title, t.priority, t.deadline
--     FROM v_live e JOIN task_details t ON t.entity_id=e.id
--     WHERE e.kind='task' AND t.status='in_progress'
--     ORDER BY t.deadline;
--
--   Расходы по категориям за месяц (аналитика):
--     SELECT category, SUM(amount) FROM transaction_details
--     WHERE direction='expense' AND occurred_at >= ?
--     GROUP BY category;
--
--   Что связано с этой задачей (бэклинки для Carmen):
--     SELECT e.* FROM links l JOIN entities e ON e.id=l.to_id
--     WHERE l.from_id = ?;
--
--   Лента изменений страницы (история версий wiki):
--     SELECT created_at, before, after FROM events
--     WHERE entity_id=? AND action='update' ORDER BY created_at DESC;
--
--   Корзина / восстановление:
--     SELECT * FROM entities WHERE deleted_at IS NOT NULL;      -- корзина
--     UPDATE entities SET deleted_at=NULL WHERE id=?;           -- restore
-- ============================================================================
