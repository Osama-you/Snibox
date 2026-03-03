pub mod conflict;
pub mod format;
pub mod watcher;

use crate::db::models::SnippetWithTags;
use format::VaultSnippet;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use watcher::VaultWatcher;

pub struct VaultManager {
    vault_path: PathBuf,
}

impl VaultManager {
    pub fn new<P: AsRef<Path>>(vault_path: P) -> Result<Self, String> {
        let vault_path = vault_path.as_ref().to_path_buf();
        let snippets_dir = vault_path.join("snippets");

        fs::create_dir_all(&snippets_dir)
            .map_err(|e| format!("Failed to create snippets directory: {}", e))?;

        Ok(Self { vault_path })
    }

    pub fn snippets_dir(&self) -> PathBuf {
        self.vault_path.join("snippets")
    }

    fn snippet_file_path(&self, id: &str) -> PathBuf {
        self.snippets_dir().join(format!("{}.json", id))
    }

    pub fn write_snippet(&self, snippet: &SnippetWithTags) -> Result<(), String> {
        let vault_snippet = VaultSnippet::from_snippet_with_tags(snippet);
        let json = vault_snippet.to_json()?;
        let file_path = self.snippet_file_path(&snippet.snippet.id);

        fs::write(&file_path, json)
            .map_err(|e| format!("Failed to write snippet file: {}", e))?;

        Ok(())
    }

    pub fn delete_snippet(&self, id: &str) -> Result<(), String> {
        let file_path = self.snippet_file_path(id);

        if file_path.exists() {
            fs::remove_file(&file_path)
                .map_err(|e| format!("Failed to delete snippet file: {}", e))?;
        }

        Ok(())
    }

    pub fn read_snippet(&self, id: &str) -> Result<Option<VaultSnippet>, String> {
        let file_path = self.snippet_file_path(id);

        if !file_path.exists() {
            return Ok(None);
        }

        let json = fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read snippet file: {}", e))?;

        let snippet = VaultSnippet::parse_from_json(&json)?;
        Ok(Some(snippet))
    }

    pub fn list_all_snippets(&self) -> Result<Vec<VaultSnippet>, String> {
        let snippets_dir = self.snippets_dir();
        let mut snippets = Vec::new();

        let entries = fs::read_dir(&snippets_dir)
            .map_err(|e| format!("Failed to read snippets directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                let json = fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read file {:?}: {}", path, e))?;

                match VaultSnippet::parse_from_json(&json) {
                    Ok(snippet) => snippets.push(snippet),
                    Err(e) => {
                        log::warn!("Failed to parse snippet from {:?}: {}", path, e);
                    }
                }
            }
        }

        Ok(snippets)
    }

    pub fn sync_with_database(
        &self,
        conn: &Connection,
    ) -> Result<SyncStats, String> {
        let vault_snippets = self.list_all_snippets()?;
        let mut stats = SyncStats::default();

        let db_snippets = get_all_snippets_from_db(conn)?;

        for vault_snippet in vault_snippets {
            if let Some(existing) = db_snippets.iter().find(|s| s.snippet.id == vault_snippet.id) {
                if should_update_from_vault(&vault_snippet, existing)? {
                    if let Some(conflict) =
                        conflict::detect_and_resolve_conflict(conn, &vault_snippet, existing)?
                    {
                        self.write_snippet(&conflict)?;
                        stats.conflicts += 1;
                    }

                    update_snippet_in_db(conn, &vault_snippet)?;
                    stats.updated += 1;
                }
            } else {
                insert_snippet_into_db(conn, &vault_snippet)?;
                stats.imported += 1;
            }
        }

        for db_snippet in db_snippets {
            if !vault_snippet_exists(&self, &db_snippet.snippet.id) {
                self.write_snippet(&db_snippet)?;
                stats.exported += 1;
            }
        }

        Ok(stats)
    }

    pub fn start_watcher(
        &self,
        app_handle: tauri::AppHandle,
    ) -> Result<VaultWatcher, String> {
        VaultWatcher::new(&self.vault_path, app_handle)
    }
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct SyncStats {
    pub imported: usize,
    pub exported: usize,
    pub updated: usize,
    pub conflicts: usize,
}

fn vault_snippet_exists(manager: &VaultManager, id: &str) -> bool {
    manager.snippet_file_path(id).exists()
}

fn should_update_from_vault(
    vault_snippet: &VaultSnippet,
    db_snippet: &SnippetWithTags,
) -> Result<bool, String> {
    if vault_snippet.content != db_snippet.snippet.content
        || vault_snippet.title != db_snippet.snippet.title
        || vault_snippet.pinned != db_snippet.snippet.pinned
        || vault_snippet.tags != db_snippet.tags
    {
        let vault_time = vault_snippet.updated_at_timestamp()?;
        let db_time = chrono::DateTime::parse_from_rfc3339(&db_snippet.snippet.updated_at)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .map_err(|e| format!("Failed to parse DB timestamp: {}", e))?;

        Ok(vault_time > db_time)
    } else {
        Ok(false)
    }
}

fn get_all_snippets_from_db(conn: &Connection) -> Result<Vec<SnippetWithTags>, String> {
    let mut stmt = conn
        .prepare("SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count FROM snippets")
        .map_err(|e| e.to_string())?;

    let snippets: Vec<crate::db::models::Snippet> = stmt
        .query_map([], |row| {
            Ok(crate::db::models::Snippet {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                pinned: row.get::<_, i64>(3)? != 0,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                last_used_at: row.get(6)?,
                use_count: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut result = Vec::new();
    for snippet in snippets {
        let tags = get_tags_for_snippet(conn, &snippet.id)?;
        result.push(SnippetWithTags { snippet, tags });
    }

    Ok(result)
}

fn get_tags_for_snippet(conn: &Connection, snippet_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN snippet_tags st ON t.id = st.tag_id
             WHERE st.snippet_id = ?1
             ORDER BY t.name",
        )
        .map_err(|e| e.to_string())?;

    let tags: Vec<String> = stmt
        .query_map(rusqlite::params![snippet_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

fn set_tags_for_snippet(
    conn: &Connection,
    snippet_id: &str,
    tags: &[String],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM snippet_tags WHERE snippet_id = ?1",
        rusqlite::params![snippet_id],
    )
    .map_err(|e| e.to_string())?;

    for tag_name in tags {
        let tag_name = tag_name.trim().to_lowercase();
        if tag_name.is_empty() {
            continue;
        }

        let tag_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, name) VALUES (?1, ?2)",
            rusqlite::params![tag_id, tag_name],
        )
        .map_err(|e| e.to_string())?;

        let actual_tag_id: String = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                rusqlite::params![tag_name],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT OR IGNORE INTO snippet_tags (snippet_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![snippet_id, actual_tag_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn insert_snippet_into_db(conn: &Connection, vault_snippet: &VaultSnippet) -> Result<(), String> {
    conn.execute(
        "INSERT INTO snippets (id, title, content, pinned, created_at, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            vault_snippet.id,
            vault_snippet.title,
            vault_snippet.content,
            vault_snippet.pinned as i64,
            vault_snippet.created_at,
            vault_snippet.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    set_tags_for_snippet(conn, &vault_snippet.id, &vault_snippet.tags)?;
    Ok(())
}

fn update_snippet_in_db(conn: &Connection, vault_snippet: &VaultSnippet) -> Result<(), String> {
    conn.execute(
        "UPDATE snippets SET title = ?1, content = ?2, pinned = ?3, updated_at = ?4 
         WHERE id = ?5",
        rusqlite::params![
            vault_snippet.title,
            vault_snippet.content,
            vault_snippet.pinned as i64,
            vault_snippet.updated_at,
            vault_snippet.id,
        ],
    )
    .map_err(|e| e.to_string())?;

    set_tags_for_snippet(conn, &vault_snippet.id, &vault_snippet.tags)?;
    Ok(())
}

pub fn process_vault_change(
    conn: &Connection,
    vault_manager: &VaultManager,
) -> Result<(), String> {
    let vault_snippets = vault_manager.list_all_snippets()?;
    let db_snippets = get_all_snippets_from_db(conn)?;

    let vault_ids: std::collections::HashSet<String> =
        vault_snippets.iter().map(|s| s.id.clone()).collect();
    let db_ids: std::collections::HashSet<String> = db_snippets
        .iter()
        .map(|s| s.snippet.id.clone())
        .collect();

    for vault_snippet in &vault_snippets {
        if let Some(existing) = db_snippets.iter().find(|s| s.snippet.id == vault_snippet.id) {
            if should_update_from_vault(vault_snippet, existing)? {
                update_snippet_in_db(conn, vault_snippet)?;
            }
        } else {
            insert_snippet_into_db(conn, vault_snippet)?;
        }
    }

    for db_id in db_ids {
        if !vault_ids.contains(&db_id) {
            conn.execute("DELETE FROM snippets WHERE id = ?1", rusqlite::params![db_id])
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
