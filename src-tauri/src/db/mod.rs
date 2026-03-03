pub mod migrations;
pub mod models;

use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub fn get_db_path() -> PathBuf {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("snibox");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("snibox.db")
}

pub fn init_db() -> Result<Connection> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    migrations::run_migrations(&conn)?;

    Ok(conn)
}

pub fn open_connection() -> Result<Connection> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}
