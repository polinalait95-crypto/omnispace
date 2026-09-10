// Точка входа OmniSpace.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod repo;

use db::Db;
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // БД лежит в каталоге данных приложения (у каждой ОС свой).
            let dir = app.path().app_data_dir().expect("app data dir");
            std::fs::create_dir_all(&dir).ok();
            let conn = db::open(&dir.join("omnispace.db")).expect("open db");

            // каталог для файлов вложений
            let files_dir = dir.join("files");
            std::fs::create_dir_all(&files_dir).ok();

            // Гарантируем локального владельца и запоминаем его id.
            let owner_id = repo::ensure_owner(&conn).expect("owner");
            app.manage(Db(Mutex::new(conn)));
            app.manage(commands::Owner(owner_id));
            app.manage(commands::FilesDir(files_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_task,
            commands::list_tasks,
            commands::set_task_status,
            commands::update_task,
            commands::update_transaction,
            commands::update_subscription,
            commands::list_trash,
            commands::purge_entity,
            commands::calendar_items,
            commands::create_session,
            commands::list_sessions,
            commands::add_message,
            commands::list_messages,
            commands::get_prefs,
            commands::save_prefs,
            commands::create_rule,
            commands::list_rules,
            commands::update_rule,
            commands::delete_rule,
            commands::export_all,
            commands::add_transaction,
            commands::list_transactions,
            commands::finance_summary,
            commands::add_budget,
            commands::list_budgets,
            commands::create_page,
            commands::update_page,
            commands::list_pages,
            commands::get_page,
            commands::page_versions,
            commands::create_link,
            commands::list_links,
            commands::add_subscription,
            commands::list_subscriptions,
            commands::set_subscription_status,
            commands::save_attachment,
            commands::list_attachments,
            commands::read_attachment,
            commands::delete_attachment,
            commands::add_entity,
            commands::list_entities,
            commands::search,
            commands::delete_entity,
            commands::restore_entity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OmniSpace");
}
