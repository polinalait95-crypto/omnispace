// Репозиторий хребта: работа с `entities` + расширениями + журналом `events`.
// Каждое изменение атомарно (транзакция) и оставляет запись в events —
// отсюда бесплатно берутся история, undo и обзоры.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

fn uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Entity {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: Option<String>,
    pub tags: String,   // JSON-массив
    pub created_at: i64,
    pub updated_at: i64,
}

fn row_to_entity(r: &rusqlite::Row) -> rusqlite::Result<Entity> {
    Ok(Entity {
        id: r.get("id")?,
        kind: r.get("kind")?,
        title: r.get("title")?,
        body: r.get("body")?,
        tags: r.get("tags")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

/// Записать событие в журнал. Вызывается внутри транзакции изменения.
fn log_event(
    tx: &Connection,
    user_id: &str,
    entity_id: Option<&str>,
    actor: &str,
    action: &str,
    after: Option<&str>,
) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO events(id,user_id,entity_id,actor,action,after,created_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![uuid(), user_id, entity_id, actor, action, after, now()],
    )?;
    Ok(())
}

/// Создать базовую сущность (задача, страница, диалог — любой kind).
pub fn create_entity(
    conn: &mut Connection,
    user_id: &str,
    kind: &str,
    title: &str,
    body: Option<&str>,
    actor: &str,
) -> rusqlite::Result<Entity> {
    let id = uuid();
    let ts = now();
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO entities(id,user_id,kind,title,body,created_at,updated_at)
         VALUES(?1,?2,?3,?4,?5,?6,?6)",
        params![id, user_id, kind, title, body, ts],
    )?;
    let after = serde_json::json!({ "kind": kind, "title": title }).to_string();
    log_event(&tx, user_id, Some(&id), actor, "create", Some(&after))?;
    tx.commit()?;
    get(conn, &id).map(|o| o.expect("just created"))
}

/// Создать задачу: сущность + типизированное расширение task_details.
/// Показывает, как хребет расширяется, оставаясь единой сущностью.
pub fn create_task(
    conn: &mut Connection,
    user_id: &str,
    title: &str,
    priority: &str,
    deadline: Option<i64>,
    actor: &str,
) -> rusqlite::Result<Entity> {
    let id = uuid();
    let ts = now();
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO entities(id,user_id,kind,title,created_at,updated_at)
         VALUES(?1,?2,'task',?3,?4,?4)",
        params![id, user_id, title, ts],
    )?;
    tx.execute(
        "INSERT INTO task_details(entity_id,status,priority,deadline)
         VALUES(?1,'open',?2,?3)",
        params![id, priority, deadline],
    )?;
    let after = serde_json::json!({ "title": title, "priority": priority }).to_string();
    log_event(&tx, user_id, Some(&id), actor, "create", Some(&after))?;
    tx.commit()?;
    get(conn, &id).map(|o| o.expect("just created"))
}

/// Получить одну живую сущность по id.
pub fn get(conn: &Connection, id: &str) -> rusqlite::Result<Option<Entity>> {
    conn.query_row(
        "SELECT * FROM entities WHERE id=?1 AND deleted_at IS NULL",
        params![id],
        row_to_entity,
    )
    .optional()
}

/// Список живых сущностей (опционально по типу), свежие сверху.
pub fn list(conn: &Connection, kind: Option<&str>) -> rusqlite::Result<Vec<Entity>> {
    let mut out = Vec::new();
    if let Some(k) = kind {
        let mut st = conn.prepare(
            "SELECT * FROM entities WHERE deleted_at IS NULL AND kind=?1
             ORDER BY updated_at DESC",
        )?;
        let rows = st.query_map(params![k], row_to_entity)?;
        for r in rows { out.push(r?); }
    } else {
        let mut st = conn.prepare(
            "SELECT * FROM entities WHERE deleted_at IS NULL ORDER BY updated_at DESC",
        )?;
        let rows = st.query_map([], row_to_entity)?;
        for r in rows { out.push(r?); }
    }
    Ok(out)
}

/// Полнотекстовый поиск по всему пространству (⌘K).
pub fn search(conn: &Connection, query: &str) -> rusqlite::Result<Vec<Entity>> {
    let mut st = conn.prepare(
        "SELECT e.* FROM entities_fts f
         JOIN entities e ON e.rowid=f.rowid
         WHERE entities_fts MATCH ?1 AND e.deleted_at IS NULL
         LIMIT 20",
    )?;
    let rows = st.query_map(params![query], row_to_entity)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

/// Мягкое удаление (в корзину) + событие. Обратимо.
pub fn soft_delete(conn: &mut Connection, user_id: &str, id: &str, actor: &str) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE entities SET deleted_at=?1 WHERE id=?2", params![now(), id])?;
    log_event(&tx, user_id, Some(id), actor, "delete", None)?;
    tx.commit()
}

/// Восстановление из корзины + событие.
pub fn restore(conn: &mut Connection, user_id: &str, id: &str, actor: &str) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE entities SET deleted_at=NULL WHERE id=?1", params![id])?;
    log_event(&tx, user_id, Some(id), actor, "restore", None)?;
    tx.commit()
}

/// Задача = сущность + типизированные поля из task_details, для канбана/списка.
#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub body: Option<String>,
    pub status: String,
    pub priority: String,
    pub deadline: Option<i64>,
    pub tags: String,
    pub updated_at: i64,
}

fn row_to_task(r: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: r.get("id")?,
        title: r.get("title")?,
        body: r.get("body")?,
        status: r.get("status")?,
        priority: r.get("priority")?,
        deadline: r.get("deadline")?,
        tags: r.get("tags")?,
        updated_at: r.get("updated_at")?,
    })
}

/// Все живые задачи со статусом и приоритетом (свежие сверху).
pub fn list_tasks(conn: &Connection) -> rusqlite::Result<Vec<Task>> {
    let mut st = conn.prepare(
        "SELECT e.id, e.title, e.body, e.tags, e.updated_at,
                t.status, t.priority, t.deadline
         FROM entities e JOIN task_details t ON t.entity_id = e.id
         WHERE e.deleted_at IS NULL
         ORDER BY e.updated_at DESC",
    )?;
    let rows = st.query_map([], row_to_task)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

/// Сменить статус задачи (перетаскивание в канбане) + событие.
/// Явно бампаем updated_at сущности, чтобы карточка всплыла в своей колонке.
pub fn set_status(
    conn: &mut Connection,
    user_id: &str,
    id: &str,
    status: &str,
    actor: &str,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE task_details SET status=?1 WHERE entity_id=?2", params![status, id])?;
    tx.execute("UPDATE entities SET updated_at=?1 WHERE id=?2", params![now(), id])?;
    let after = serde_json::json!({ "status": status }).to_string();
    log_event(&tx, user_id, Some(id), actor, "status_change", Some(&after))?;
    tx.commit()
}

/// Полное редактирование задачи: название, приоритет, дедлайн.
pub fn update_task(
    conn: &mut Connection,
    user_id: &str,
    id: &str,
    title: &str,
    priority: &str,
    deadline: Option<i64>,
    actor: &str,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE entities SET title=?1, updated_at=?2 WHERE id=?3", params![title, now(), id])?;
    tx.execute(
        "UPDATE task_details SET priority=?1, deadline=?2 WHERE entity_id=?3",
        params![priority, deadline, id],
    )?;
    let after = serde_json::json!({ "title": title, "priority": priority }).to_string();
    log_event(&tx, user_id, Some(id), actor, "update", Some(&after))?;
    tx.commit()
}

// ============================ ФИНАНСЫ ======================================
// Суммы храним в МИНОРНЫХ единицах (копейки) — целыми, без ошибок округления.

#[derive(Debug, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub title: String,
    pub direction: String, // expense | income
    pub amount: i64,       // копейки
    pub category: Option<String>,
    pub method: Option<String>,
    pub occurred_at: i64,
}

fn row_to_txn(r: &rusqlite::Row) -> rusqlite::Result<Transaction> {
    Ok(Transaction {
        id: r.get("id")?,
        title: r.get("title")?,
        direction: r.get("direction")?,
        amount: r.get("amount")?,
        category: r.get("category")?,
        method: r.get("method")?,
        occurred_at: r.get("occurred_at")?,
    })
}

/// Записать расход или доход (сущность + transaction_details) + событие.
#[allow(clippy::too_many_arguments)]
pub fn create_transaction(
    conn: &mut Connection,
    user_id: &str,
    direction: &str,
    amount: i64,
    title: &str,
    category: Option<&str>,
    method: Option<&str>,
    occurred_at: Option<i64>,
    actor: &str,
) -> rusqlite::Result<Transaction> {
    let id = uuid();
    let ts = now();
    let occ = occurred_at.unwrap_or(ts);
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO entities(id,user_id,kind,title,created_at,updated_at)
         VALUES(?1,?2,'transaction',?3,?4,?4)",
        params![id, user_id, title, ts],
    )?;
    tx.execute(
        "INSERT INTO transaction_details(entity_id,direction,amount,category,method,occurred_at)
         VALUES(?1,?2,?3,?4,?5,?6)",
        params![id, direction, amount, category, method, occ],
    )?;
    let after = serde_json::json!({ "direction": direction, "amount": amount }).to_string();
    log_event(&tx, user_id, Some(&id), actor, "create", Some(&after))?;
    tx.commit()?;
    conn.query_row(
        "SELECT e.id,e.title,t.direction,t.amount,t.category,t.method,t.occurred_at
         FROM entities e JOIN transaction_details t ON t.entity_id=e.id WHERE e.id=?1",
        params![id],
        row_to_txn,
    )
}

/// Список операций с опциональными фильтрами (период, категория).
pub fn list_transactions(
    conn: &Connection,
    from: Option<i64>,
    to: Option<i64>,
    category: Option<&str>,
) -> rusqlite::Result<Vec<Transaction>> {
    let mut st = conn.prepare(
        "SELECT e.id,e.title,t.direction,t.amount,t.category,t.method,t.occurred_at
         FROM entities e JOIN transaction_details t ON t.entity_id=e.id
         WHERE e.deleted_at IS NULL
           AND (?1 IS NULL OR t.occurred_at >= ?1)
           AND (?2 IS NULL OR t.occurred_at <= ?2)
           AND (?3 IS NULL OR t.category = ?3)
         ORDER BY t.occurred_at DESC",
    )?;
    let rows = st.query_map(params![from, to, category], row_to_txn)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CategoryTotal { pub category: String, pub total: i64 }

#[derive(Debug, Serialize, Deserialize)]
pub struct Summary {
    pub income: i64,
    pub expense: i64,
    pub by_category: Vec<CategoryTotal>, // расходы по категориям
}

/// Аналитическая сводка за период: доход, расход, разбивка расходов.
pub fn summary(conn: &Connection, from: Option<i64>, to: Option<i64>) -> rusqlite::Result<Summary> {
    let total = |dir: &str| -> rusqlite::Result<i64> {
        conn.query_row(
            "SELECT COALESCE(SUM(t.amount),0)
             FROM entities e JOIN transaction_details t ON t.entity_id=e.id
             WHERE e.deleted_at IS NULL AND t.direction=?1
               AND (?2 IS NULL OR t.occurred_at >= ?2)
               AND (?3 IS NULL OR t.occurred_at <= ?3)",
            params![dir, from, to],
            |r| r.get(0),
        )
    };
    let mut st = conn.prepare(
        "SELECT COALESCE(t.category,'Без категории') AS cat, SUM(t.amount) AS s
         FROM entities e JOIN transaction_details t ON t.entity_id=e.id
         WHERE e.deleted_at IS NULL AND t.direction='expense'
           AND (?1 IS NULL OR t.occurred_at >= ?1)
           AND (?2 IS NULL OR t.occurred_at <= ?2)
         GROUP BY cat ORDER BY s DESC",
    )?;
    let cats = st
        .query_map(params![from, to], |r| Ok(CategoryTotal { category: r.get(0)?, total: r.get(1)? }))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(Summary { income: total("income")?, expense: total("expense")?, by_category: cats })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Envelope { pub id: String, pub category: String, pub limit: i64, pub used: i64 }

/// Создать бюджет-конверт. Конверт — сущность kind='budget' (без миграции схемы).
pub fn create_budget(conn: &mut Connection, user_id: &str, category: &str, limit: i64) -> rusqlite::Result<()> {
    let id = uuid();
    let ts = now();
    let data = serde_json::json!({ "limit": limit }).to_string();
    conn.execute(
        "INSERT INTO entities(id,user_id,kind,title,data,created_at,updated_at)
         VALUES(?1,?2,'budget',?3,?4,?5,?5)",
        params![id, user_id, category, data, ts],
    )?;
    Ok(())
}

/// Конверты с потраченным за ТЕКУЩИЙ месяц (used считается из расходов категории).
pub fn list_budgets(conn: &Connection) -> rusqlite::Result<Vec<Envelope>> {
    let month_start = "CAST(unixepoch(strftime('%Y-%m-01','now'))*1000 AS INTEGER)";
    let sql = format!(
        "SELECT b.id, b.title AS category,
                CAST(json_extract(b.data,'$.limit') AS INTEGER) AS lim,
                COALESCE((
                  SELECT SUM(t.amount) FROM entities e
                  JOIN transaction_details t ON t.entity_id=e.id
                  WHERE e.deleted_at IS NULL AND t.direction='expense'
                    AND t.category=b.title AND t.occurred_at >= {month_start}
                ),0) AS used
         FROM entities b
         WHERE b.kind='budget' AND b.deleted_at IS NULL
         ORDER BY b.title"
    );
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map([], |r| {
        Ok(Envelope { id: r.get("id")?, category: r.get("category")?, limit: r.get("lim")?, used: r.get("used")? })
    })?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

// ======================= БАЗА ЗНАНИЙ (WIKI) ================================
// Страница = entity(kind='page'), контент в entities.body, иерархия — parent_id.
// История версий берётся из журнала events (снимок {title,body} в поле after).

#[derive(Debug, Serialize, Deserialize)]
pub struct PageMeta {
    pub id: String,
    pub title: String,
    pub parent_id: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Page {
    pub id: String,
    pub title: String,
    pub body: Option<String>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Version { pub created_at: i64, pub title: String, pub body: Option<String> }

fn snapshot(title: &str, body: Option<&str>) -> String {
    serde_json::json!({ "title": title, "body": body }).to_string()
}

pub fn create_page(
    conn: &mut Connection,
    user_id: &str,
    title: &str,
    body: Option<&str>,
    parent_id: Option<&str>,
    actor: &str,
) -> rusqlite::Result<Page> {
    let id = uuid();
    let ts = now();
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO entities(id,user_id,kind,title,body,parent_id,created_at,updated_at)
         VALUES(?1,?2,'page',?3,?4,?5,?6,?6)",
        params![id, user_id, title, body, parent_id, ts],
    )?;
    tx.execute(
        "INSERT INTO page_details(entity_id,format) VALUES(?1,'markdown')",
        params![id],
    )?;
    log_event(&tx, user_id, Some(&id), actor, "create", Some(&snapshot(title, body)))?;
    tx.commit()?;
    get_page(conn, &id).map(|o| o.expect("just created"))
}

/// Обновить страницу. Сохраняет ПРЕДЫДУЩИЙ снимок в before — это и есть версия.
pub fn update_page(
    conn: &mut Connection,
    user_id: &str,
    id: &str,
    title: &str,
    body: Option<&str>,
    actor: &str,
) -> rusqlite::Result<Page> {
    // прежнее состояние — в историю
    let (old_title, old_body): (String, Option<String>) = conn.query_row(
        "SELECT title, body FROM entities WHERE id=?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let ts = now();
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE entities SET title=?1, body=?2, updated_at=?3 WHERE id=?4",
        params![title, body, ts, id],
    )?;
    tx.execute(
        "INSERT INTO events(id,user_id,entity_id,actor,action,before,after,created_at)
         VALUES(?1,?2,?3,?4,'update',?5,?6,?7)",
        params![
            uuid(), user_id, id, actor,
            snapshot(&old_title, old_body.as_deref()),
            snapshot(title, body), ts
        ],
    )?;
    tx.commit()?;
    get_page(conn, id).map(|o| o.expect("exists"))
}

pub fn list_pages(conn: &Connection) -> rusqlite::Result<Vec<PageMeta>> {
    let mut st = conn.prepare(
        "SELECT e.id, e.title, e.parent_id, p.icon
         FROM entities e JOIN page_details p ON p.entity_id=e.id
         WHERE e.deleted_at IS NULL ORDER BY e.title",
    )?;
    let rows = st.query_map([], |r| Ok(PageMeta {
        id: r.get(0)?, title: r.get(1)?, parent_id: r.get(2)?, icon: r.get(3)?,
    }))?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

pub fn get_page(conn: &Connection, id: &str) -> rusqlite::Result<Option<Page>> {
    conn.query_row(
        "SELECT id,title,body,parent_id FROM entities WHERE id=?1 AND deleted_at IS NULL",
        params![id],
        |r| Ok(Page { id: r.get(0)?, title: r.get(1)?, body: r.get(2)?, parent_id: r.get(3)? }),
    )
    .optional()
}

/// История версий страницы из журнала (снимки, свежие сверху).
pub fn page_versions(conn: &Connection, id: &str) -> rusqlite::Result<Vec<Version>> {
    let mut st = conn.prepare(
        "SELECT created_at, after FROM events
         WHERE entity_id=?1 AND after IS NOT NULL AND action IN ('create','update')
         ORDER BY created_at DESC",
    )?;
    let raw = st
        .query_map(params![id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(raw.into_iter().map(|(ts, json)| {
        let v: serde_json::Value = serde_json::from_str(&json).unwrap_or_default();
        Version {
            created_at: ts,
            title: v.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            body: v.get("body").and_then(|x| x.as_str()).map(str::to_string),
        }
    }).collect())
}

/// Связать две сущности (бэклинк). Дубликаты игнорируются (UNIQUE).
pub fn create_link(conn: &Connection, from: &str, to: &str, rel: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO links(id,from_id,to_id,rel,created_at) VALUES(?1,?2,?3,?4,?5)",
        params![uuid(), from, to, rel, now()],
    )?;
    Ok(())
}

/// Все живые сущности, связанные с данной (в обе стороны).
pub fn list_links(conn: &Connection, id: &str) -> rusqlite::Result<Vec<Entity>> {
    let mut st = conn.prepare(
        "SELECT * FROM entities WHERE deleted_at IS NULL AND id IN (
           SELECT to_id FROM links WHERE from_id=?1
           UNION SELECT from_id FROM links WHERE to_id=?1
         ) ORDER BY updated_at DESC",
    )?;
    let rows = st.query_map(params![id], row_to_entity)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

// ===================== ПОДПИСКИ (только трекер) ============================
// Оплаты на паузе — храним даты продления и статусы, статус вычисляем из дат.

#[derive(Debug, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub title: String,
    pub amount: Option<i64>,     // копейки, справочно
    pub currency: String,
    pub period: String,
    pub next_renewal: Option<i64>,
    pub status: String,          // вычисленный: active|expiring|overdue|paused|cancelled
    pub auto_renew: bool,
    pub url: Option<String>,
    pub notify_days: String,     // JSON-массив
}

const DAY_MS: i64 = 86_400_000;

/// Статус выводится из базового и даты продления (paused/cancelled — вручную).
fn derive_status(base: &str, next: Option<i64>, notify_days: &str, now_ms: i64) -> String {
    if base == "paused" || base == "cancelled" {
        return base.to_string();
    }
    match next {
        None => "active".into(),
        Some(n) if n < now_ms => "overdue".into(),
        Some(n) => {
            let max_days = serde_json::from_str::<Vec<i64>>(notify_days)
                .ok()
                .and_then(|v| v.into_iter().max())
                .unwrap_or(3);
            if n - now_ms <= max_days * DAY_MS { "expiring".into() } else { "active".into() }
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn create_subscription(
    conn: &mut Connection,
    user_id: &str,
    title: &str,
    amount: Option<i64>,
    period: &str,
    next_renewal: Option<i64>,
    notify_days: &str,
    url: Option<&str>,
    actor: &str,
) -> rusqlite::Result<()> {
    let id = uuid();
    let ts = now();
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO entities(id,user_id,kind,title,created_at,updated_at)
         VALUES(?1,?2,'subscription',?3,?4,?4)",
        params![id, user_id, title, ts],
    )?;
    tx.execute(
        "INSERT INTO subscription_details(entity_id,amount,period,next_renewal,status,notify_days,url)
         VALUES(?1,?2,?3,?4,'active',?5,?6)",
        params![id, amount, period, next_renewal, notify_days, url],
    )?;
    log_event(&tx, user_id, Some(&id), actor, "create", None)?;
    tx.commit()
}

pub fn list_subscriptions(conn: &Connection) -> rusqlite::Result<Vec<Subscription>> {
    let now_ms = now();
    let mut st = conn.prepare(
        "SELECT e.id,e.title,s.amount,s.currency,s.period,s.next_renewal,
                s.status,s.auto_renew,s.url,s.notify_days
         FROM entities e JOIN subscription_details s ON s.entity_id=e.id
         WHERE e.deleted_at IS NULL ORDER BY s.next_renewal",
    )?;
    let rows = st.query_map([], |r| {
        let base: String = r.get(6)?;
        let next: Option<i64> = r.get(5)?;
        let notify: String = r.get(9)?;
        Ok(Subscription {
            id: r.get(0)?,
            title: r.get(1)?,
            amount: r.get(2)?,
            currency: r.get(3)?,
            period: r.get(4)?,
            next_renewal: next,
            status: derive_status(&base, next, &notify, now_ms),
            auto_renew: r.get::<_, i64>(7)? != 0,
            url: r.get(8)?,
            notify_days: notify,
        })
    })?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

/// Ручная смена статуса (на паузу / отменить / вернуть в active).
pub fn set_subscription_status(conn: &mut Connection, user_id: &str, id: &str, status: &str, actor: &str) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE subscription_details SET status=?1 WHERE entity_id=?2", params![status, id])?;
    tx.execute("UPDATE entities SET updated_at=?1 WHERE id=?2", params![now(), id])?;
    let after = serde_json::json!({ "status": status }).to_string();
    log_event(&tx, user_id, Some(id), actor, "status_change", Some(&after))?;
    tx.commit()
}

// ===================== ВЛОЖЕНИЯ (файлы на диске) ===========================
// Байты кладём в files_dir/<id>_<имя>, метаданные — в таблицу attachments.

#[derive(Debug, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub entity_id: String,
    pub file_name: String,
    pub mime: Option<String>,
    pub size: i64,
    pub created_at: i64,
}

fn row_to_attachment(r: &rusqlite::Row) -> rusqlite::Result<Attachment> {
    Ok(Attachment {
        id: r.get("id")?,
        entity_id: r.get("entity_id")?,
        file_name: r.get("file_name")?,
        mime: r.get("mime")?,
        size: r.get("size")?,
        created_at: r.get("created_at")?,
    })
}

/// Сохранить файл: записать байты на диск и метаданные в БД.
pub fn save_attachment(
    conn: &Connection,
    files_dir: &Path,
    entity_id: &str,
    file_name: &str,
    mime: Option<&str>,
    bytes: &[u8],
) -> rusqlite::Result<Attachment> {
    let id = uuid();
    let stored = format!("{id}_{file_name}");
    fs::create_dir_all(files_dir).ok();
    fs::write(files_dir.join(&stored), bytes)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let ts = now();
    conn.execute(
        "INSERT INTO attachments(id,entity_id,file_name,file_path,mime,size,created_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![id, entity_id, file_name, stored, mime, bytes.len() as i64, ts],
    )?;
    Ok(Attachment {
        id, entity_id: entity_id.into(), file_name: file_name.into(),
        mime: mime.map(str::to_string), size: bytes.len() as i64, created_at: ts,
    })
}

pub fn list_attachments(conn: &Connection, entity_id: &str) -> rusqlite::Result<Vec<Attachment>> {
    let mut st = conn.prepare(
        "SELECT id,entity_id,file_name,mime,size,created_at
         FROM attachments WHERE entity_id=?1 ORDER BY created_at DESC",
    )?;
    let rows = st.query_map(params![entity_id], row_to_attachment)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

/// Прочитать байты вложения (для скачивания/просмотра).
pub fn read_attachment(conn: &Connection, files_dir: &Path, id: &str) -> rusqlite::Result<Vec<u8>> {
    let path: String = conn.query_row(
        "SELECT file_path FROM attachments WHERE id=?1",
        params![id],
        |r| r.get(0),
    )?;
    fs::read(files_dir.join(path)).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
}

/// Удалить вложение: файл с диска и строку из БД.
pub fn delete_attachment(conn: &Connection, files_dir: &Path, id: &str) -> rusqlite::Result<()> {
    if let Some(path) = conn
        .query_row("SELECT file_path FROM attachments WHERE id=?1", params![id], |r| r.get::<_, String>(0))
        .optional()?
    {
        fs::remove_file(files_dir.join(path)).ok();
    }
    conn.execute("DELETE FROM attachments WHERE id=?1", params![id])?;
    Ok(())
}

/// Редактировать транзакцию.
#[allow(clippy::too_many_arguments)]
pub fn update_transaction(
    conn: &mut Connection,
    user_id: &str,
    id: &str,
    direction: &str,
    amount: i64,
    title: &str,
    category: Option<&str>,
    occurred_at: i64,
    actor: &str,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE entities SET title=?1, updated_at=?2 WHERE id=?3", params![title, now(), id])?;
    tx.execute(
        "UPDATE transaction_details SET direction=?1, amount=?2, category=?3, occurred_at=?4 WHERE entity_id=?5",
        params![direction, amount, category, occurred_at, id],
    )?;
    let after = serde_json::json!({ "direction": direction, "amount": amount }).to_string();
    log_event(&tx, user_id, Some(id), actor, "update", Some(&after))?;
    tx.commit()
}

/// Редактировать подписку (кроме вычисляемого статуса).
#[allow(clippy::too_many_arguments)]
pub fn update_subscription(
    conn: &mut Connection,
    user_id: &str,
    id: &str,
    title: &str,
    amount: Option<i64>,
    period: &str,
    next_renewal: Option<i64>,
    notify_days: &str,
    url: Option<&str>,
    actor: &str,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE entities SET title=?1, updated_at=?2 WHERE id=?3", params![title, now(), id])?;
    tx.execute(
        "UPDATE subscription_details SET amount=?1, period=?2, next_renewal=?3, notify_days=?4, url=?5 WHERE entity_id=?6",
        params![amount, period, next_renewal, notify_days, url, id],
    )?;
    log_event(&tx, user_id, Some(id), actor, "update", None)?;
    tx.commit()
}

/// Сущность в корзине (для раздела «Корзина»).
#[derive(Debug, Serialize, Deserialize)]
pub struct Trashed { pub id: String, pub kind: String, pub title: String, pub deleted_at: i64 }

/// Всё, что лежит в корзине (мягко удалённое), свежее сверху.
pub fn list_trash(conn: &Connection) -> rusqlite::Result<Vec<Trashed>> {
    let mut st = conn.prepare(
        "SELECT id, kind, title, deleted_at FROM entities
         WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )?;
    let rows = st.query_map([], |r| Ok(Trashed {
        id: r.get(0)?, kind: r.get(1)?, title: r.get(2)?, deleted_at: r.get(3)?,
    }))?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

/// Окончательно удалить сущность (из корзины). Каскад уберёт детали, связи,
/// вложения-строки; файлы с диска чистит вызывающий по списку вложений.
/// Историю самой сущности тоже удаляем (это перманентное удаление).
pub fn purge(conn: &mut Connection, user_id: &str, id: &str, actor: &str) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    // событие purge — без ссылки на исчезающую строку (id кладём в after)
    let after = serde_json::json!({ "purged": id }).to_string();
    log_event(&tx, user_id, None, actor, "purge", Some(&after))?;
    // events на сущность не каскадятся — убираем вручную, иначе FK не даст удалить
    tx.execute("DELETE FROM events WHERE entity_id=?1", params![id])?;
    tx.execute("DELETE FROM entities WHERE id=?1", params![id])?;
    tx.commit()
}

// ===================== КАЛЕНДАРЬ (вью над датами) ==========================
// Не отдельная сущность: собираем дедлайны задач и даты продления подписок.

#[derive(Debug, Serialize, Deserialize)]
pub struct CalItem {
    pub id: String,
    pub kind: String,   // task | subscription
    pub title: String,
    pub date: i64,
    pub status: String, // статус задачи или вычисленный статус подписки
}

/// Все датированные события в диапазоне [from, to].
pub fn calendar_items(conn: &Connection, from: i64, to: i64) -> rusqlite::Result<Vec<CalItem>> {
    let mut out = Vec::new();

    // дедлайны задач
    let mut st = conn.prepare(
        "SELECT e.id, e.title, t.deadline, t.status
         FROM entities e JOIN task_details t ON t.entity_id=e.id
         WHERE e.deleted_at IS NULL AND t.deadline IS NOT NULL
           AND t.deadline BETWEEN ?1 AND ?2",
    )?;
    for r in st.query_map(params![from, to], |r| Ok(CalItem {
        id: r.get(0)?, title: r.get(1)?, date: r.get(2)?, status: r.get(3)?, kind: "task".into(),
    }))? { out.push(r?); }

    // продления подписок (статус вычисляем из даты)
    let now_ms = now();
    let mut st = conn.prepare(
        "SELECT e.id, e.title, s.next_renewal, s.status, s.notify_days
         FROM entities e JOIN subscription_details s ON s.entity_id=e.id
         WHERE e.deleted_at IS NULL AND s.next_renewal IS NOT NULL
           AND s.next_renewal BETWEEN ?1 AND ?2",
    )?;
    for r in st.query_map(params![from, to], |r| {
        let next: i64 = r.get(2)?;
        let base: String = r.get(3)?;
        let notify: String = r.get(4)?;
        Ok(CalItem {
            id: r.get(0)?, title: r.get(1)?, date: next, kind: "subscription".into(),
            status: derive_status(&base, Some(next), &notify, now_ms),
        })
    })? { out.push(r?); }

    out.sort_by_key(|c| c.date);
    Ok(out)
}

// ===================== CARMEN (чат-ассистент) ==============================
// Диалог = entity(kind='chat_session'); сообщения — в chat_messages.

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSession { pub id: String, pub title: String, pub updated_at: i64 }

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage { pub id: String, pub role: String, pub content: String, pub meta: String, pub created_at: i64 }

pub fn create_session(conn: &mut Connection, user_id: &str, title: &str) -> rusqlite::Result<ChatSession> {
    let id = uuid();
    let ts = now();
    conn.execute(
        "INSERT INTO entities(id,user_id,kind,title,created_at,updated_at) VALUES(?1,?2,'chat_session',?3,?4,?4)",
        params![id, user_id, title, ts],
    )?;
    Ok(ChatSession { id, title: title.into(), updated_at: ts })
}

pub fn list_sessions(conn: &Connection) -> rusqlite::Result<Vec<ChatSession>> {
    let mut st = conn.prepare(
        "SELECT id, title, updated_at FROM entities
         WHERE kind='chat_session' AND deleted_at IS NULL ORDER BY updated_at DESC",
    )?;
    let rows = st.query_map([], |r| Ok(ChatSession { id: r.get(0)?, title: r.get(1)?, updated_at: r.get(2)? }))?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

/// Добавить сообщение в сессию (роль user|assistant), meta — JSON карточки/действия.
pub fn add_message(conn: &mut Connection, session_id: &str, role: &str, content: &str, meta: &str) -> rusqlite::Result<ChatMessage> {
    let id = uuid();
    let ts = now();
    conn.execute(
        "INSERT INTO chat_messages(id,session_id,role,content,meta,created_at) VALUES(?1,?2,?3,?4,?5,?6)",
        params![id, session_id, role, content, meta, ts],
    )?;
    // подсветить сессию наверх и подставить заголовок из первого сообщения
    conn.execute("UPDATE entities SET updated_at=?1 WHERE id=?2", params![ts, session_id])?;
    conn.execute(
        "UPDATE entities SET title=substr(?1,1,60)
         WHERE id=?2 AND kind='chat_session' AND (title='' OR title='Новый диалог')",
        params![content, session_id],
    )?;
    Ok(ChatMessage { id, role: role.into(), content: content.into(), meta: meta.into(), created_at: ts })
}

pub fn list_messages(conn: &Connection, session_id: &str) -> rusqlite::Result<Vec<ChatMessage>> {
    let mut st = conn.prepare(
        "SELECT id, role, content, meta, created_at FROM chat_messages
         WHERE session_id=?1 ORDER BY created_at",
    )?;
    let rows = st.query_map(params![session_id], |r| Ok(ChatMessage {
        id: r.get(0)?, role: r.get(1)?, content: r.get(2)?, meta: r.get(3)?, created_at: r.get(4)?,
    }))?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

// ===================== НАСТРОЙКИ (preferences) =============================

#[derive(Debug, Serialize, Deserialize)]
pub struct Prefs {
    pub theme: String,
    pub time_zone: String,
    pub time_format: String,
    pub date_format: String,
    pub ui: String, // JSON: обои, шрифты, порядок меню, макеты
}

pub fn get_prefs(conn: &Connection, user_id: &str) -> rusqlite::Result<Prefs> {
    conn.query_row(
        "SELECT theme, time_zone, time_format, date_format, ui FROM preferences WHERE user_id=?1",
        params![user_id],
        |r| Ok(Prefs {
            theme: r.get(0)?, time_zone: r.get(1)?, time_format: r.get(2)?,
            date_format: r.get(3)?, ui: r.get(4)?,
        }),
    )
}

/// Сохранить настройки (upsert одной строки на пользователя).
pub fn save_prefs(conn: &Connection, user_id: &str, p: &Prefs) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO preferences(user_id,theme,time_zone,time_format,date_format,ui,updated_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(user_id) DO UPDATE SET
           theme=?2, time_zone=?3, time_format=?4, date_format=?5, ui=?6, updated_at=?7",
        params![user_id, p.theme, p.time_zone, p.time_format, p.date_format, p.ui, now()],
    )?;
    Ok(())
}

// ===================== AI-ОБРАБОТКА ДОКУМЕНТОВ =============================
// Правила и папки правил — древовидная структура в таблице doc_rules.

#[derive(Debug, Serialize, Deserialize)]
pub struct DocRule {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub file_types: String, // JSON-массив: ["pdf","docx","xlsx"]
    pub action: Option<String>,
    pub prompt: Option<String>,
    pub is_folder: bool,
    pub sort_order: f64,
}

fn row_to_rule(r: &rusqlite::Row) -> rusqlite::Result<DocRule> {
    Ok(DocRule {
        id: r.get("id")?,
        parent_id: r.get("parent_id")?,
        name: r.get("name")?,
        file_types: r.get("file_types")?,
        action: r.get("action")?,
        prompt: r.get("prompt")?,
        is_folder: r.get::<_, i64>("is_folder")? != 0,
        sort_order: r.get("sort_order")?,
    })
}

#[allow(clippy::too_many_arguments)]
pub fn create_rule(
    conn: &Connection,
    user_id: &str,
    parent_id: Option<&str>,
    name: &str,
    file_types: &str,
    action: Option<&str>,
    prompt: Option<&str>,
    is_folder: bool,
) -> rusqlite::Result<DocRule> {
    let id = uuid();
    conn.execute(
        "INSERT INTO doc_rules(id,user_id,parent_id,name,file_types,action,prompt,is_folder,sort_order,created_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,0,?9)",
        params![id, user_id, parent_id, name, file_types, action, prompt, is_folder as i64, now()],
    )?;
    get_rule(conn, &id).map(|o| o.expect("just created"))
}

pub fn get_rule(conn: &Connection, id: &str) -> rusqlite::Result<Option<DocRule>> {
    conn.query_row(
        "SELECT id,parent_id,name,file_types,action,prompt,is_folder,sort_order FROM doc_rules WHERE id=?1",
        params![id], row_to_rule,
    ).optional()
}

pub fn list_rules(conn: &Connection) -> rusqlite::Result<Vec<DocRule>> {
    let mut st = conn.prepare(
        "SELECT id,parent_id,name,file_types,action,prompt,is_folder,sort_order
         FROM doc_rules ORDER BY sort_order, name",
    )?;
    let rows = st.query_map([], row_to_rule)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

#[allow(clippy::too_many_arguments)]
pub fn update_rule(
    conn: &Connection, id: &str, name: &str, file_types: &str,
    action: Option<&str>, prompt: Option<&str>,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE doc_rules SET name=?1, file_types=?2, action=?3, prompt=?4 WHERE id=?5",
        params![name, file_types, action, prompt, id],
    )?;
    Ok(())
}

/// Удалить правило (и вложенные, если это папка).
pub fn delete_rule(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM doc_rules WHERE id=?1 OR parent_id=?1", params![id])?;
    Ok(())
}

// ===================== ЭКСПОРТ / БЭКАП =====================================
// Полный снимок всех таблиц в JSON — «вся жизнь в одном файле».

pub fn export_all(conn: &Connection) -> rusqlite::Result<String> {
    // сериализуем каждую таблицу как массив объектов
    fn dump(conn: &Connection, table: &str) -> rusqlite::Result<serde_json::Value> {
        let mut st = conn.prepare(&format!("SELECT * FROM {table}"))?;
        let cols: Vec<String> = st.column_names().into_iter().map(String::from).collect();
        let rows = st.query_map([], |r| {
            let mut obj = serde_json::Map::new();
            for (i, c) in cols.iter().enumerate() {
                let v = match r.get_ref(i)? {
                    rusqlite::types::ValueRef::Null => serde_json::Value::Null,
                    rusqlite::types::ValueRef::Integer(n) => serde_json::json!(n),
                    rusqlite::types::ValueRef::Real(f) => serde_json::json!(f),
                    rusqlite::types::ValueRef::Text(t) => serde_json::json!(String::from_utf8_lossy(t)),
                    rusqlite::types::ValueRef::Blob(_) => serde_json::Value::Null,
                };
                obj.insert(c.clone(), v);
            }
            Ok(serde_json::Value::Object(obj))
        })?;
        let mut arr = Vec::new();
        for row in rows { arr.push(row?); }
        Ok(serde_json::Value::Array(arr))
    }

    let tables = [
        "users", "entities", "task_details", "transaction_details",
        "subscription_details", "page_details", "links", "events",
        "attachments", "doc_rules", "notifications", "preferences", "chat_messages",
    ];
    let mut snapshot = serde_json::Map::new();
    snapshot.insert("version".into(), serde_json::json!(1));
    snapshot.insert("exported_at".into(), serde_json::json!(now()));
    for t in tables {
        snapshot.insert(t.into(), dump(conn, t)?);
    }
    Ok(serde_json::Value::Object(snapshot).to_string())
}

/// Гарантировать наличие локального пользователя-владельца. Возвращает его id.
pub fn ensure_owner(conn: &Connection) -> rusqlite::Result<String> {
    if let Some(id) = conn
        .query_row("SELECT id FROM users WHERE role='owner' LIMIT 1", [], |r| r.get::<_, String>(0))
        .optional()?
    {
        return Ok(id);
    }
    let id = uuid();
    conn.execute("INSERT INTO users(id) VALUES(?1)", params![id])?;
    conn.execute("INSERT INTO preferences(user_id) VALUES(?1)", params![id])?;
    Ok(id)
}
