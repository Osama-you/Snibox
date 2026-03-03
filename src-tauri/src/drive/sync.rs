use crate::db::models::{Snippet, SnippetWithTags};
use crate::drive::api::{DriveApiClient, DriveFile, StorageMode};
use crate::drive::auth::DriveAuth;
use crate::drive::conflict;
use crate::vault::format::VaultSnippet;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};

type Db = Arc<StdMutex<Connection>>;

pub struct DriveSyncStats {
    pub imported: usize,
    pub exported: usize,
    pub updated: usize,
    pub conflicts: usize,
}

impl Default for DriveSyncStats {
    fn default() -> Self {
        Self { imported: 0, exported: 0, updated: 0, conflicts: 0 }
    }
}

pub async fn initial_sync(
    auth: &mut DriveAuth,
    api: &DriveApiClient,
    db: &Db,
    storage_mode: StorageMode,
    folder_id: Option<&str>,
) -> Result<DriveSyncStats, String> {
    let token = auth.get_valid_token().await?;
    let remote_files = api.list_files(&token, storage_mode, folder_id).await?;
    let mut stats = DriveSyncStats::default();

    let mut remote_map: HashMap<String, DriveFile> = HashMap::new();
    let mut remote_snippets: HashMap<String, VaultSnippet> = HashMap::new();

    for file in remote_files {
        let name = file.name.as_deref().unwrap_or("");
        if let Some(snippet_id) = extract_snippet_id(name) {
            let token = auth.get_valid_token().await?;
            match api.get_file_content(&token, &file.id).await {
                Ok(content) => {
                    if let Ok(vs) = VaultSnippet::parse_from_json(&content) {
                        remote_map.insert(snippet_id.clone(), file);
                        remote_snippets.insert(snippet_id, vs);
                    }
                }
                Err(e) => eprintln!("[drive] Failed to download {}: {}", name, e),
            }
        }
    }

    let db_snippets = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        get_all_snippets_from_db(&conn)?
    };
    let db_map: HashMap<String, SnippetWithTags> =
        db_snippets.into_iter().map(|s| (s.snippet.id.clone(), s)).collect();

    for (snippet_id, remote_vs) in &remote_snippets {
        if let Some(local) = db_map.get(snippet_id) {
            let remote_newer = is_remote_newer(remote_vs, local);
            if remote_newer {
                let conn = db.lock().map_err(|e| e.to_string())?;
                update_snippet_in_db(&conn, remote_vs)?;
                stats.updated += 1;
            } else if is_content_different(remote_vs, local) {
                let cr = conflict::create_conflict_copy(local);
                {
                    let conn = db.lock().map_err(|e| e.to_string())?;
                    insert_snippet_into_db(&conn, &cr.conflict_vault_snippet)?;
                    update_snippet_in_db(&conn, remote_vs)?;
                }

                let token = auth.get_valid_token().await?;
                let file_name = format!("snibox_{}.json", cr.conflict_snippet.snippet.id);
                let parents = build_parents(storage_mode, folder_id);
                let json = cr.conflict_vault_snippet.to_json()?;
                let _ = api.create_file(&token, &file_name, &json, &parents).await;
                stats.conflicts += 1;
            }
        } else {
            let conn = db.lock().map_err(|e| e.to_string())?;
            insert_snippet_into_db(&conn, remote_vs)?;
            stats.imported += 1;
        }

        if let Some(drive_file) = remote_map.get(snippet_id) {
            let conn = db.lock().map_err(|e| e.to_string())?;
            upsert_drive_sync(&conn, snippet_id, drive_file)?;
        }
    }

    let local_only: Vec<SnippetWithTags> = {
        let all_local = {
            let conn = db.lock().map_err(|e| e.to_string())?;
            get_all_snippets_from_db(&conn)?
        };
        all_local.into_iter().filter(|s| !remote_snippets.contains_key(&s.snippet.id)).collect()
    };

    for local in &local_only {
        let vs = VaultSnippet::from_snippet_with_tags(local);
        let json = vs.to_json()?;
        let file_name = format!("snibox_{}.json", local.snippet.id);
        let parents = build_parents(storage_mode, folder_id);

        let token = auth.get_valid_token().await?;
        match api.create_file(&token, &file_name, &json, &parents).await {
            Ok(created) => {
                let conn = db.lock().map_err(|e| e.to_string())?;
                upsert_drive_sync(&conn, &local.snippet.id, &created)?;
                stats.exported += 1;
            }
            Err(e) => eprintln!("[drive] Failed to upload {}: {}", local.snippet.id, e),
        }
    }

    let token = auth.get_valid_token().await?;
    let page_token = api.get_start_page_token(&token, storage_mode).await?;
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        set_drive_state(&conn, "page_token", &page_token)?;
    }

    Ok(stats)
}

pub async fn incremental_sync(
    auth: &mut DriveAuth,
    api: &DriveApiClient,
    db: &Db,
    storage_mode: StorageMode,
    folder_id: Option<&str>,
) -> Result<DriveSyncStats, String> {
    let mut stats = DriveSyncStats::default();

    let stored_token = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        get_drive_state(&conn, "page_token")?
            .ok_or("No page token stored -- run initial sync first")?
    };

    let mut current_page_token = stored_token;

    loop {
        let token = auth.get_valid_token().await?;
        let change_list = api.list_changes(&token, &current_page_token, storage_mode).await?;

        for change in &change_list.changes {
            let file_id = match &change.file_id {
                Some(id) => id.clone(),
                None => continue,
            };

            if change.removed.unwrap_or(false) {
                let snippet_id = {
                    let conn = db.lock().map_err(|e| e.to_string())?;
                    find_snippet_by_drive_file_id(&conn, &file_id)?
                };
                if let Some(sid) = snippet_id {
                    let conn = db.lock().map_err(|e| e.to_string())?;
                    conn.execute("DELETE FROM snippets WHERE id = ?1", rusqlite::params![sid])
                        .map_err(|e| e.to_string())?;
                    conn.execute("DELETE FROM drive_sync WHERE snippet_id = ?1", rusqlite::params![sid])
                        .map_err(|e| e.to_string())?;
                    stats.updated += 1;
                }
                continue;
            }

            if let Some(file) = &change.file {
                let name = file.name.as_deref().unwrap_or("");
                if let Some(snippet_id) = extract_snippet_id(name) {
                    let (stored_version, local_opt, synced_at) = {
                        let conn = db.lock().map_err(|e| e.to_string())?;
                        let ver = get_stored_version(&conn, &snippet_id)?;
                        let local = get_snippet_from_db(&conn, &snippet_id)?;
                        let sa = get_synced_at(&conn, &snippet_id)?;
                        (ver, local, sa)
                    };

                    let remote_version = file.version.as_deref();
                    if stored_version.as_deref() == remote_version && remote_version.is_some() {
                        continue;
                    }

                    let token = auth.get_valid_token().await?;
                    match api.get_file_content(&token, &file_id).await {
                        Ok(content) => {
                            if let Ok(remote_vs) = VaultSnippet::parse_from_json(&content) {
                                match local_opt {
                                    Some(local_swt) => {
                                        if is_content_different(&remote_vs, &local_swt) {
                                            let local_changed = synced_at.as_ref().map_or(true, |sa| {
                                                local_swt.snippet.updated_at > *sa
                                            });

                                            if local_changed && conflict::should_conflict(stored_version.as_deref(), remote_version) {
                                                let cr = conflict::create_conflict_copy(&local_swt);
                                                {
                                                    let conn = db.lock().map_err(|e| e.to_string())?;
                                                    insert_snippet_into_db(&conn, &cr.conflict_vault_snippet)?;
                                                }
                                                let token = auth.get_valid_token().await?;
                                                let fname = format!("snibox_{}.json", cr.conflict_snippet.snippet.id);
                                                let parents = build_parents(storage_mode, folder_id);
                                                let json = cr.conflict_vault_snippet.to_json()?;
                                                let _ = api.create_file(&token, &fname, &json, &parents).await;
                                                stats.conflicts += 1;
                                            }

                                            let conn = db.lock().map_err(|e| e.to_string())?;
                                            update_snippet_in_db(&conn, &remote_vs)?;
                                            upsert_drive_sync(&conn, &snippet_id, file)?;
                                            stats.updated += 1;
                                        }
                                    }
                                    None => {
                                        let conn = db.lock().map_err(|e| e.to_string())?;
                                        insert_snippet_into_db(&conn, &remote_vs)?;
                                        upsert_drive_sync(&conn, &snippet_id, file)?;
                                        stats.imported += 1;
                                    }
                                }
                            }
                        }
                        Err(e) => eprintln!("[drive] Failed to fetch changed file {}: {}", file_id, e),
                    }
                }
            }
        }

        if let Some(new_token) = change_list.new_start_page_token {
            let conn = db.lock().map_err(|e| e.to_string())?;
            set_drive_state(&conn, "page_token", &new_token)?;
            break;
        } else if let Some(next) = change_list.next_page_token {
            current_page_token = next;
        } else {
            break;
        }
    }

    push_local_changes(auth, api, db, storage_mode, folder_id, &mut stats).await?;

    Ok(stats)
}

async fn push_local_changes(
    auth: &mut DriveAuth,
    api: &DriveApiClient,
    db: &Db,
    storage_mode: StorageMode,
    folder_id: Option<&str>,
    stats: &mut DriveSyncStats,
) -> Result<(), String> {
    let snippets_to_push: Vec<(SnippetWithTags, Option<String>, Option<String>)> = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let db_snippets = get_all_snippets_from_db(&conn)?;
        db_snippets.into_iter().filter_map(|local| {
            let synced = get_synced_at(&conn, &local.snippet.id).ok()?;
            let needs_push = match &synced {
                Some(sa) => local.snippet.updated_at > *sa,
                None => true,
            };
            if !needs_push { return None; }
            let file_id = get_drive_file_id(&conn, &local.snippet.id).ok()?;
            Some((local, file_id, synced))
        }).collect()
    };

    for (local, existing_file_id, _synced) in &snippets_to_push {
        let vs = VaultSnippet::from_snippet_with_tags(local);
        let json = vs.to_json()?;

        match existing_file_id {
            Some(fid) => {
                let token = auth.get_valid_token().await?;
                match api.update_file(&token, fid, &json).await {
                    Ok(updated) => {
                        let conn = db.lock().map_err(|e| e.to_string())?;
                        upsert_drive_sync_from_parts(
                            &conn,
                            &local.snippet.id,
                            fid,
                            updated.modified_time.as_deref().unwrap_or(""),
                            updated.version.as_deref(),
                            updated.md5_checksum.as_deref(),
                        )?;
                    }
                    Err(e) => eprintln!("[drive] Failed to update {}: {}", local.snippet.id, e),
                }
            }
            None => {
                let file_name = format!("snibox_{}.json", local.snippet.id);
                let parents = build_parents(storage_mode, folder_id);
                let token = auth.get_valid_token().await?;
                match api.create_file(&token, &file_name, &json, &parents).await {
                    Ok(created) => {
                        let conn = db.lock().map_err(|e| e.to_string())?;
                        upsert_drive_sync(&conn, &local.snippet.id, &created)?;
                        stats.exported += 1;
                    }
                    Err(e) => eprintln!("[drive] Failed to upload {}: {}", local.snippet.id, e),
                }
            }
        }
    }

    Ok(())
}

pub async fn push_single_snippet(
    auth: &mut DriveAuth,
    api: &DriveApiClient,
    db: &Db,
    snippet_id: &str,
    storage_mode: StorageMode,
    folder_id: Option<&str>,
) -> Result<(), String> {
    let (local, existing_file_id, stored_version) = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let local = get_snippet_from_db(&conn, snippet_id)?
            .ok_or_else(|| format!("Snippet {} not found in DB", snippet_id))?;
        let fid = get_drive_file_id(&conn, snippet_id)?;
        let ver = get_stored_version(&conn, snippet_id)?;
        (local, fid, ver)
    };

    let vs = VaultSnippet::from_snippet_with_tags(&local);
    let json = vs.to_json()?;

    match existing_file_id {
        Some(fid) => {
            let token = auth.get_valid_token().await?;
            let meta = api.get_file_metadata(&token, &fid).await;

            if let Ok(meta) = meta {
                if conflict::should_conflict(stored_version.as_deref(), meta.version.as_deref()) {
                    let cr = conflict::create_conflict_copy(&local);
                    {
                        let conn = db.lock().map_err(|e| e.to_string())?;
                        insert_snippet_into_db(&conn, &cr.conflict_vault_snippet)?;
                    }
                    let token = auth.get_valid_token().await?;
                    let fname = format!("snibox_{}.json", cr.conflict_snippet.snippet.id);
                    let parents = build_parents(storage_mode, folder_id);
                    let cjson = cr.conflict_vault_snippet.to_json()?;
                    let _ = api.create_file(&token, &fname, &cjson, &parents).await;
                }
            }

            let token = auth.get_valid_token().await?;
            let updated = api.update_file(&token, &fid, &json).await?;
            let conn = db.lock().map_err(|e| e.to_string())?;
            upsert_drive_sync_from_parts(
                &conn,
                snippet_id,
                &fid,
                updated.modified_time.as_deref().unwrap_or(""),
                updated.version.as_deref(),
                updated.md5_checksum.as_deref(),
            )?;
        }
        None => {
            let file_name = format!("snibox_{}.json", snippet_id);
            let parents = build_parents(storage_mode, folder_id);
            let token = auth.get_valid_token().await?;
            let created = api.create_file(&token, &file_name, &json, &parents).await?;
            let conn = db.lock().map_err(|e| e.to_string())?;
            upsert_drive_sync(&conn, snippet_id, &created)?;
        }
    }

    Ok(())
}

pub async fn delete_remote_snippet(
    auth: &mut DriveAuth,
    api: &DriveApiClient,
    db: &Db,
    snippet_id: &str,
) -> Result<(), String> {
    let file_id = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        get_drive_file_id(&conn, snippet_id)?
    };

    if let Some(fid) = file_id {
        let token = auth.get_valid_token().await?;
        api.delete_file(&token, &fid).await?;
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM drive_sync WHERE snippet_id = ?1", rusqlite::params![snippet_id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// --- Helpers ---

fn extract_snippet_id(filename: &str) -> Option<String> {
    let name = filename.strip_suffix(".json")?;
    let id = name.strip_prefix("snibox_")?;
    if id.is_empty() { None } else { Some(id.to_string()) }
}

fn build_parents(storage_mode: StorageMode, folder_id: Option<&str>) -> Vec<String> {
    match storage_mode {
        StorageMode::Appdata => vec!["appDataFolder".to_string()],
        StorageMode::Folder => folder_id.map(|id| vec![id.to_string()]).unwrap_or_default(),
    }
}

fn is_remote_newer(remote: &VaultSnippet, local: &SnippetWithTags) -> bool {
    remote.updated_at > local.snippet.updated_at
}

fn is_content_different(remote: &VaultSnippet, local: &SnippetWithTags) -> bool {
    remote.content != local.snippet.content
        || remote.title != local.snippet.title
        || remote.pinned != local.snippet.pinned
        || remote.tags != local.tags
}

// --- DB helpers (all sync, never called across awaits) ---

fn upsert_drive_sync(conn: &Connection, snippet_id: &str, file: &DriveFile) -> Result<(), String> {
    upsert_drive_sync_from_parts(
        conn, snippet_id, &file.id,
        file.modified_time.as_deref().unwrap_or(""),
        file.version.as_deref(),
        file.md5_checksum.as_deref(),
    )
}

fn upsert_drive_sync_from_parts(
    conn: &Connection, snippet_id: &str, drive_file_id: &str,
    modified_time: &str, version: Option<&str>, md5_checksum: Option<&str>,
) -> Result<(), String> {
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    conn.execute(
        "INSERT OR REPLACE INTO drive_sync (snippet_id, drive_file_id, modified_time, version, md5_checksum, synced_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![snippet_id, drive_file_id, modified_time, version, md5_checksum, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn get_drive_file_id(conn: &Connection, snippet_id: &str) -> Result<Option<String>, String> {
    match conn.query_row("SELECT drive_file_id FROM drive_sync WHERE snippet_id = ?1", rusqlite::params![snippet_id], |row| row.get(0)) {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn get_stored_version(conn: &Connection, snippet_id: &str) -> Result<Option<String>, String> {
    match conn.query_row("SELECT version FROM drive_sync WHERE snippet_id = ?1", rusqlite::params![snippet_id], |row| row.get(0)) {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn get_synced_at(conn: &Connection, snippet_id: &str) -> Result<Option<String>, String> {
    match conn.query_row("SELECT synced_at FROM drive_sync WHERE snippet_id = ?1", rusqlite::params![snippet_id], |row| row.get(0)) {
        Ok(sa) => Ok(Some(sa)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn find_snippet_by_drive_file_id(conn: &Connection, drive_file_id: &str) -> Result<Option<String>, String> {
    match conn.query_row("SELECT snippet_id FROM drive_sync WHERE drive_file_id = ?1", rusqlite::params![drive_file_id], |row| row.get(0)) {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn set_drive_state(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute("INSERT OR REPLACE INTO drive_state (key, value) VALUES (?1, ?2)", rusqlite::params![key, value])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_drive_state(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    match conn.query_row("SELECT value FROM drive_state WHERE key = ?1", rusqlite::params![key], |row| row.get(0)) {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn clear_drive_tables(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM drive_sync", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM drive_state", []).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_conflict_count(conn: &Connection) -> Result<usize, String> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM snippets WHERE title LIKE '%(conflict from %)'", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count as usize)
}

fn get_all_snippets_from_db(conn: &Connection) -> Result<Vec<SnippetWithTags>, String> {
    let mut stmt = conn.prepare("SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count FROM snippets")
        .map_err(|e| e.to_string())?;
    let snippets: Vec<Snippet> = stmt.query_map([], |row| {
        Ok(Snippet {
            id: row.get(0)?, title: row.get(1)?, content: row.get(2)?,
            pinned: row.get::<_, i64>(3)? != 0, created_at: row.get(4)?,
            updated_at: row.get(5)?, last_used_at: row.get(6)?, use_count: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut result = Vec::new();
    for snippet in snippets {
        let tags = get_tags_for_snippet(conn, &snippet.id)?;
        result.push(SnippetWithTags { snippet, tags });
    }
    Ok(result)
}

fn get_snippet_from_db(conn: &Connection, id: &str) -> Result<Option<SnippetWithTags>, String> {
    match conn.query_row(
        "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count FROM snippets WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok(Snippet {
            id: row.get(0)?, title: row.get(1)?, content: row.get(2)?,
            pinned: row.get::<_, i64>(3)? != 0, created_at: row.get(4)?,
            updated_at: row.get(5)?, last_used_at: row.get(6)?, use_count: row.get(7)?,
        }),
    ) {
        Ok(snippet) => {
            let tags = get_tags_for_snippet(conn, &snippet.id)?;
            Ok(Some(SnippetWithTags { snippet, tags }))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn get_tags_for_snippet(conn: &Connection, snippet_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare("SELECT t.name FROM tags t JOIN snippet_tags st ON t.id = st.tag_id WHERE st.snippet_id = ?1 ORDER BY t.name")
        .map_err(|e| e.to_string())?;
    let tags: Vec<String> = stmt.query_map(rusqlite::params![snippet_id], |row| row.get(0))
        .map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    Ok(tags)
}

fn set_tags_for_snippet(conn: &Connection, snippet_id: &str, tags: &[String]) -> Result<(), String> {
    conn.execute("DELETE FROM snippet_tags WHERE snippet_id = ?1", rusqlite::params![snippet_id])
        .map_err(|e| e.to_string())?;
    for tag_name in tags {
        let tag_name = tag_name.trim().to_lowercase();
        if tag_name.is_empty() { continue; }
        let tag_id = uuid::Uuid::new_v4().to_string();
        conn.execute("INSERT OR IGNORE INTO tags (id, name) VALUES (?1, ?2)", rusqlite::params![tag_id, tag_name])
            .map_err(|e| e.to_string())?;
        let actual_tag_id: String = conn.query_row("SELECT id FROM tags WHERE name = ?1", rusqlite::params![tag_name], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        conn.execute("INSERT OR IGNORE INTO snippet_tags (snippet_id, tag_id) VALUES (?1, ?2)", rusqlite::params![snippet_id, actual_tag_id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn insert_snippet_into_db(conn: &Connection, vs: &VaultSnippet) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO snippets (id, title, content, pinned, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![vs.id, vs.title, vs.content, vs.pinned as i64, vs.created_at, vs.updated_at],
    ).map_err(|e| e.to_string())?;
    set_tags_for_snippet(conn, &vs.id, &vs.tags)?;
    Ok(())
}

fn update_snippet_in_db(conn: &Connection, vs: &VaultSnippet) -> Result<(), String> {
    conn.execute(
        "UPDATE snippets SET title = ?1, content = ?2, pinned = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![vs.title, vs.content, vs.pinned as i64, vs.updated_at, vs.id],
    ).map_err(|e| e.to_string())?;
    set_tags_for_snippet(conn, &vs.id, &vs.tags)?;
    Ok(())
}
