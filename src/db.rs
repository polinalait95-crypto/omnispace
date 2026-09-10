// Подключение к SQLite и миграции.
// rusqlite с bundled-SQLite: движок компилируется внутрь приложения — никаких
// системных зависимостей, работает на Windows и macOS Intel одинаково.
// bundled включает FTS5 и JSON1, которые нужны нашей схеме.

use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

// Обёртка состояния для Tauri: одно соединение под мьютексом.
// Для локального однопользовательского приложения этого достаточно.
pub struct Db(pub Mutex<Connection>);

// Список миграций. Каждая — (версия, SQL). Порядок = порядок применения.
// Добавляя новую версию, просто дописываем строку — старые не трогаем.
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../migrations/0001_init.sql")),
];

/// Открыть БД по пути, настроить PRAGMA и накатить недостающие миграции.
pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;",
    )?;
    migrate(&conn)?;
    Ok(conn)
}

/// Открыть БД в памяти (для тестов).
pub fn open_memory() -> rusqlite::Result<Connection> {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    migrate(&conn)?;
    Ok(conn)
}

/// Накатить все миграции, версия которых выше текущего user_version.
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (version, sql) in MIGRATIONS {
        if *version > current {
            conn.execute_batch(sql)?;
            // user_version нельзя параметризовать — форматируем безопасно (i64).
            conn.execute_batch(&format!("PRAGMA user_version = {version};"))?;
        }
    }
    Ok(())
}
