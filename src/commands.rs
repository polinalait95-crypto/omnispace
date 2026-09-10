// Tauri-команды = мост между фронтендом и репозиторием.
// Пока тонкие; когда появится полный слой действий (actions.ts), команды будут
// звать dispatch(), но форма вызова из UI останется той же.

use crate::db::Db;
use crate::repo::{self, Entity};
use tauri::State;

// Единый owner-id держим в состоянии, чтобы не искать каждый раз.
pub struct Owner(pub String);

// Каталог для файлов вложений (внутри каталога данных приложения).
pub struct FilesDir(pub std::path::PathBuf);

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn add_subscription(
    title: String,
    amount: Option<i64>,
    period: Option<String>,
    next_renewal: Option<i64>,
    notify_days: Option<String>,
    url: Option<String>,
    db: State<Db>,
    owner: State<Owner>,
) -> Result<(), String> {
    let mut conn = lock(&db);
    repo::create_subscription(
        &mut conn, &owner.0, &title, amount,
        period.as_deref().unwrap_or("month"), next_renewal,
        notify_days.as_deref().unwrap_or("[3]"), url.as_deref(), "user",
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_subscriptions(db: State<Db>) -> Result<Vec<repo::Subscription>, String> {
    let conn = lock(&db);
    repo::list_subscriptions(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_subscription_status(id: String, status: String, db: State<Db>, owner: State<Owner>) -> Result<(), String> {
    let mut conn = lock(&db);
    repo::set_subscription_status(&mut conn, &owner.0, &id, &status, "user").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_attachment(
    entity_id: String,
    file_name: String,
    mime: Option<String>,
    bytes: Vec<u8>,
    db: State<Db>,
    files: State<FilesDir>,
) -> Result<repo::Attachment, String> {
    let conn = lock(&db);
    repo::save_attachment(&conn, &files.0, &entity_id, &file_name, mime.as_deref(), &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_attachments(entity_id: String, db: State<Db>) -> Result<Vec<repo::Attachment>, String> {
    let conn = lock(&db);
    repo::list_attachments(&conn, &entity_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_attachment(id: String, db: State<Db>, files: State<FilesDir>) -> Result<Vec<u8>, String> {
    let conn = lock(&db);
    repo::read_attachment(&conn, &files.0, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_attachment(id: String, db: State<Db>, files: State<FilesDir>) -> Result<(), String> {
    let conn = lock(&db);
    repo::delete_attachment(&conn, &files.0, &id).map_err(|e| e.to_string())
}

fn lock<'a>(db: &'a State<Db>) -> std::sync::MutexGuard<'a, rusqlite::Connection> {
    db.0.lock().expect("db mutex")
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_rule(parent_id: Option<String>, name: String, file_types: String, action: Option<String>, prompt: Option<String>, is_folder: bool, db: State<Db>, owner: State<Owner>) -> Result<repo::DocRule, String> {
    let conn = lock(&db);
    repo::create_rule(&conn, &owner.0, parent_id.as_deref(), &name, &file_types, action.as_deref(), prompt.as_deref(), is_folder).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_rules(db: State<Db>) -> Result<Vec<repo::DocRule>, String> {
    let conn = lock(&db);
    repo::list_rules(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_rule(id: String, name: String, file_types: String, action: Option<String>, prompt: Option<String>, db: State<Db>) -> Result<(), String> {
    let conn = lock(&db);
    repo::update_rule(&conn, &id, &name, &file_types, action.as_deref(), prompt.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_rule(id: String, db: State<Db>) -> Result<(), String> {
    let conn = lock(&db);
    repo::delete_rule(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_all(db: State<Db>) -> Result<String, String> {
    let conn = lock(&db);
    repo::export_all(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_prefs(db: State<Db>, owner: State<Owner>) -> Result<repo::Prefs, String> {
    let conn = lock(&db);
    repo::get_prefs(&conn, &owner.0).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_prefs(prefs: repo::Prefs, db: State<Db>, owner: State<Owner>) -> Result<(), String> {
    let conn = lock(&db);
    repo::save_prefs(&conn, &owner.0, &prefs).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_session(title: Option<String>, db: State<Db>, owner: State<Owner>) -> Result<repo::ChatSession, String> {
    let mut conn = lock(&db);
    repo::create_session(&mut conn, &owner.0, title.as_deref().unwrap_or("Новый диалог")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_sessions(db: State<Db>) -> Result<Vec<repo::ChatSession>, String> {
    let conn = lock(&db);
    repo::list_sessions(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_message(session_id: String, role: String, content: String, meta: Option<String>, db: State<Db>) -> Result<repo::ChatMessage, String> {
    let mut conn = lock(&db);
    repo::add_message(&mut conn, &session_id, &role, &content, meta.as_deref().unwrap_or("{}")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_messages(session_id: String, db: State<Db>) -> Result<Vec<repo::ChatMessage>, String> {
    let conn = lock(&db);
    repo::list_messages(&conn, &session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn calendar_items(from: i64, to: i64, db: State<Db>) -> Result<Vec<repo::CalItem>, String> {
    let conn = lock(&db);
    repo::calendar_items(&conn, from, to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_task(id: String, title: String, priority: String, deadline: Option<i64>, db: State<Db>, owner: State<Owner>) -> Result<(), String> {
    let mut conn = lock(&db);
    repo::update_task(&mut conn, &owner.0, &id, &title, &priority, deadline, "user").map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_transaction(id: String, direction: String, amount: i64, title: String, category: Option<String>, occurred_at: i64, db: State<Db>, owner: State<Owner>) -> Result<(), String> {
    let mut conn = lock(&db);
    repo::update_transaction(&mut conn, &owner.0, &id, &direction, amount, &title, category.as_deref(), occurred_at, "user").map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_subscription(id: String, title: String, amount: Option<i64>, period: String, next_renewal: Option<i64>, notify_days: String, url: Option<String>, db: State<Db>, owner: State<Owner>) -> Result<(), String> {
    let mut conn = lock(&db);
    repo::update_subscription(&mut conn, &owner.0, &id, &title, amount, &period, next_renewal, &notify_days, url.as_deref(), "user").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_trash(db: State<Db>) -> Result<Vec<repo::Trashed>, String> {
    let conn = lock(&db);
    repo::list_trash(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn purge_entity(id: String, db: State<Db>, owner: State<Owner>, files: State<FilesDir>) -> Result<(), String> {
    let mut conn = lock(&db);
    // сперва удалить файлы вложений с диска
    if let Ok(atts) = repo::list_attachments(&conn, &id) {
        for a in atts { let _ = repo::delete_attachment(&conn, &files.0, &a.id); }
    }
    repo::purge(&mut conn, &owner.0, &id, "user").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_task(
    title: String,
    priority: Option<String>,
    deadline: Option<i64>,
    db: State<Db>,
    owner: State<Owner>,
) -> Result<Entity, String> {
    let mut conn = lock(&db);
    repo::create_task(
        &mut conn,
        &owner.0,
        &title,
        priority.as_deref().unwrap_or("medium"),
        deadline,
        "user",
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_entity(
    kind: String,
    title: String,
    body: Option<String>,
    db: State<Db>,
    owner: State<Owner>,
) -> Result<Entity, String> {
    let mut conn = lock(&db);
    repo::create_entity(&mut conn, &owner.0, &kind, &title, body.as_deref(), "user")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_page(title: String, body: Option<String>, parent_id: Option<String>, db: State<Db>, owner: State<Owner>) -> Result<repo::Page, String> {
    let mut conn = lock(&db);
    repo::create_page(&mut conn, &owner.0, &title, body.as_deref(), parent_id.as_deref(), "user").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_page(id: String, title: String, body: Option<String>, db: State<Db>, owner: State<Owner>) -> Result<repo::Page, String> {
    let mut conn = lock(&db);
    repo::update_page(&mut conn, &owner.0, &id, &title, body.as_deref(), "user").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_pages(db: State<Db>) -> Result<Vec<repo::PageMeta>, String> {
    let conn = lock(&db);
    repo::list_pages(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_page(id: String, db: State<Db>) -> Result<Option<repo::Page>, String> {
    let conn = lock(&db);
    repo::get_page(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn page_versions(id: String, db: State<Db>) -> Result<Vec<repo::Version>, String> {
    let conn = lock(&db);
    repo::page_versions(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_link(from: String, to: String, rel: Option<String>, db: State<Db>) -> Result<(), String> {
    let conn = lock(&db);
    repo::create_link(&conn, &from, &to, rel.as_deref().unwrap_or("related")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_links(id: String, db: State<Db>) -> Result<Vec<repo::Entity>, String> {
    let conn = lock(&db);
    repo::list_links(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn add_transaction(
    direction: String,
    amount: i64,
    title: String,
    category: Option<String>,
    method: Option<String>,
    occurred_at: Option<i64>,
    db: State<Db>,
    owner: State<Owner>,
) -> Result<repo::Transaction, String> {
    let mut conn = lock(&db);
    repo::create_transaction(
        &mut conn, &owner.0, &direction, amount, &title,
        category.as_deref(), method.as_deref(), occurred_at, "user",
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_transactions(
    from: Option<i64>,
    to: Option<i64>,
    category: Option<String>,
    db: State<Db>,
) -> Result<Vec<repo::Transaction>, String> {
    let conn = lock(&db);
    repo::list_transactions(&conn, from, to, category.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn finance_summary(from: Option<i64>, to: Option<i64>, db: State<Db>) -> Result<repo::Summary, String> {
    let conn = lock(&db);
    repo::summary(&conn, from, to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_budget(category: String, limit: i64, db: State<Db>, owner: State<Owner>) -> Result<(), String> {
    let mut conn = lock(&db);
    repo::create_budget(&mut conn, &owner.0, &category, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_budgets(db: State<Db>) -> Result<Vec<repo::Envelope>, String> {
    let conn = lock(&db);
    repo::list_budgets(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_tasks(db: State<Db>) -> Result<Vec<repo::Task>, String> {
    let conn = lock(&db);
    repo::list_tasks(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_task_status(
    id: String,
    status: String,
    db: State<Db>,
    owner: State<Owner>,
) -> Result<(), String> {
    let mut conn = lock(&db);
    repo::set_status(&mut conn, &owner.0, &id, &status, "user").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_entities(kind: Option<String>, db: State<Db>) -> Result<Vec<Entity>, String> {
    let conn = lock(&db);
    repo::list(&conn, kind.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search(query: String, db: State<Db>) -> Result<Vec<Entity>, String> {
    let conn = lock(&db);
    repo::search(&conn, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_entity(id: String, db: State<Db>, owner: State<Owner>) -> Result<(), String> {
    let mut conn = lock(&db);
    repo::soft_delete(&mut conn, &owner.0, &id, "user").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_entity(id: String, db: State<Db>, owner: State<Owner>) -> Result<(), String> {
    let mut conn = lock(&db);
    repo::restore(&mut conn, &owner.0, &id, "user").map_err(|e| e.to_string())
}
