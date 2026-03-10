use crate::db::models::SnippetWithTags;
use crate::drive::api::{DriveApiClient, DriveFile, StorageMode};
use crate::drive::auth::DriveAuth;
use crate::sync_state;
use crate::vault::format::VaultSnippet;
use rusqlite::{Connection, OptionalExtension};
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};

type Db = Arc<StdMutex<Connection>>;

#[derive(Default)]
pub struct DriveSyncStats {
    pub imported: usize,
    pub exported: usize,
    pub updated: usize,
    pub conflicts: usize,
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
                    if let Ok(vault_snippet) = VaultSnippet::parse_from_json(&content) {
                        remote_map.insert(snippet_id.clone(), file);
                        remote_snippets.insert(snippet_id, vault_snippet);
                    }
                }
                Err(error) => {
                    let conn = db.lock().map_err(|e| e.to_string())?;
                    let _ = sync_state::log_activity(
                        &conn,
                        "error",
                        "remote_download",
                        &format!("Failed to download remote snippet: {error}"),
                        None,
                    );
                }
            }
        }
    }

    let local_snippets = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        get_all_snippets_from_db(&conn, true)?
    };
    let local_map: HashMap<String, SnippetWithTags> = local_snippets
        .into_iter()
        .map(|snippet| (snippet.snippet.id.clone(), snippet))
        .collect();

    for (snippet_id, remote_snippet) in &remote_snippets {
        let drive_file = match remote_map.get(snippet_id) {
            Some(file) => file,
            None => continue,
        };

        let conn = db.lock().map_err(|e| e.to_string())?;
        match local_map.get(snippet_id) {
            Some(local_snippet) if local_snippet.snippet.deleted_at.is_some() => {
                sync_state::queue_operation(&conn, snippet_id, "delete", "local_tombstone")?;
            }
            Some(local_snippet) if is_content_different(remote_snippet, local_snippet) => {
                let local_changed = local_snippet
                    .snippet
                    .last_synced_at
                    .as_ref()
                    .map(|synced| local_snippet.snippet.device_updated_at > *synced)
                    .unwrap_or(true);

                if local_changed
                    && local_snippet.snippet.remote_version.as_deref()
                        != drive_file.version.as_deref()
                {
                    if has_pin_only_difference(remote_snippet, local_snippet) {
                        sync_state::queue_operation(
                            &conn,
                            snippet_id,
                            "upsert",
                            "pin_only_race_keep_local",
                        )?;
                        sync_state::log_activity(
                            &conn,
                            "info",
                            "pin_race",
                            "Pin-only race detected during initial sync, keeping local state",
                            Some(snippet_id),
                        )?;
                        continue;
                    }

                    sync_state::record_conflict(
                        &conn,
                        snippet_id,
                        "initial_sync_diverged",
                        local_snippet,
                        remote_snippet,
                    )?;
                    stats.conflicts += 1;
                    continue;
                }

                sync_state::insert_or_replace_snippet(&conn, remote_snippet)?;
                upsert_drive_sync(&conn, snippet_id, drive_file)?;
                sync_state::mark_snippet_synced(&conn, snippet_id, drive_file.version.as_deref())?;
                stats.updated += 1;
            }
            Some(_) => {
                upsert_drive_sync(&conn, snippet_id, drive_file)?;
                sync_state::mark_snippet_synced(&conn, snippet_id, drive_file.version.as_deref())?;
            }
            None => {
                sync_state::insert_or_replace_snippet(&conn, remote_snippet)?;
                upsert_drive_sync(&conn, snippet_id, drive_file)?;
                sync_state::mark_snippet_synced(&conn, snippet_id, drive_file.version.as_deref())?;
                stats.imported += 1;
            }
        }
    }

    let local_only = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        get_all_snippets_from_db(&conn, false)?
            .into_iter()
            .filter(|snippet| !remote_snippets.contains_key(&snippet.snippet.id))
            .collect::<Vec<_>>()
    };

    for local in &local_only {
        let vault_snippet = VaultSnippet::from_snippet_with_tags(local);
        let json = vault_snippet.to_json()?;
        let file_name = format!("snibox_{}.json", local.snippet.id);
        let parents = build_parents(storage_mode, folder_id);
        let token = auth.get_valid_token().await?;

        match api.create_file(&token, &file_name, &json, &parents).await {
            Ok(created) => {
                let conn = db.lock().map_err(|e| e.to_string())?;
                upsert_drive_sync(&conn, &local.snippet.id, &created)?;
                sync_state::mark_snippet_synced(
                    &conn,
                    &local.snippet.id,
                    created.version.as_deref(),
                )?;
                stats.exported += 1;
            }
            Err(error) => {
                let conn = db.lock().map_err(|e| e.to_string())?;
                sync_state::log_activity(
                    &conn,
                    "error",
                    "upload",
                    &format!("Failed to upload {}: {error}", local.snippet.id),
                    Some(&local.snippet.id),
                )?;
                sync_state::queue_operation(&conn, &local.snippet.id, "upsert", "initial_export")?;
            }
        }
    }

    let token = auth.get_valid_token().await?;
    let page_token = api.get_start_page_token(&token, storage_mode).await?;
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        sync_state::set_drive_state(&conn, "page_token", &page_token)?;
        sync_state::set_drive_state(&conn, "last_sync_time", &sync_state::now_timestamp())?;
    }

    process_pending_queue(auth, api, db, storage_mode, folder_id, &mut stats).await?;

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

    let current_page_token = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        sync_state::get_drive_state(&conn, "page_token")?
    };
    let mut current_page_token = match current_page_token {
        Some(token) if !token.trim().is_empty() => token,
        _ => {
            {
                let conn = db.lock().map_err(|e| e.to_string())?;
                sync_state::log_activity(
                    &conn,
                    "info",
                    "sync_bootstrap",
                    "No page token found, running initial sync bootstrap",
                    None,
                )?;
            }
            return initial_sync(auth, api, db, storage_mode, folder_id).await;
        }
    };

    loop {
        let token = auth.get_valid_token().await?;
        let change_list = api.list_changes(&token, &current_page_token, storage_mode).await?;

        for change in &change_list.changes {
            let file_id = match &change.file_id {
                Some(file_id) => file_id.clone(),
                None => continue,
            };

            if change.removed.unwrap_or(false) {
                if let Some(snippet_id) = {
                    let conn = db.lock().map_err(|e| e.to_string())?;
                    find_snippet_by_drive_file_id(&conn, &file_id)?
                } {
                    let conn = db.lock().map_err(|e| e.to_string())?;
                    sync_state::mark_snippet_deleted(&conn, &snippet_id)?;
                    clear_drive_sync(&conn, &snippet_id)?;
                    sync_state::clear_queue_for_snippet(&conn, &snippet_id)?;
                    sync_state::log_activity(
                        &conn,
                        "info",
                        "remote_delete",
                        "Snippet deleted remotely",
                        Some(&snippet_id),
                    )?;
                    stats.updated += 1;
                }
                continue;
            }

            if let Some(file) = &change.file {
                let name = file.name.as_deref().unwrap_or("");
                let Some(snippet_id) = extract_snippet_id(name) else {
                    continue;
                };

                let token = auth.get_valid_token().await?;
                let content = match api.get_file_content(&token, &file_id).await {
                    Ok(content) => content,
                    Err(error) => {
                        let conn = db.lock().map_err(|e| e.to_string())?;
                        sync_state::log_activity(
                            &conn,
                            "error",
                            "remote_download",
                            &format!("Failed to fetch changed file {file_id}: {error}"),
                            Some(&snippet_id),
                        )?;
                        continue;
                    }
                };
                let remote_snippet = match VaultSnippet::parse_from_json(&content) {
                    Ok(snippet) => snippet,
                    Err(error) => {
                        let conn = db.lock().map_err(|e| e.to_string())?;
                        sync_state::log_activity(
                            &conn,
                            "error",
                            "remote_parse",
                            &format!("Failed to parse changed snippet: {error}"),
                            Some(&snippet_id),
                        )?;
                        continue;
                    }
                };

                let conn = db.lock().map_err(|e| e.to_string())?;
                match sync_state::load_snippet_with_tags(&conn, &snippet_id, true)? {
                    Some(local_snippet) if local_snippet.snippet.deleted_at.is_some() => {
                        sync_state::queue_operation(&conn, &snippet_id, "delete", "preserve_local_delete")?;
                    }
                    Some(local_snippet) if is_content_different(&remote_snippet, &local_snippet) => {
                        let local_changed = local_snippet
                            .snippet
                            .last_synced_at
                            .as_ref()
                            .map(|synced| local_snippet.snippet.device_updated_at > *synced)
                            .unwrap_or(true);
                        let version_changed = local_snippet.snippet.remote_version.as_deref()
                            != file.version.as_deref();

                        if local_changed && version_changed {
                            if has_pin_only_difference(&remote_snippet, &local_snippet) {
                                sync_state::queue_operation(
                                    &conn,
                                    &snippet_id,
                                    "upsert",
                                    "pin_only_race_keep_local",
                                )?;
                                sync_state::log_activity(
                                    &conn,
                                    "info",
                                    "pin_race",
                                    "Pin-only race detected, keeping local state",
                                    Some(&snippet_id),
                                )?;
                                continue;
                            }

                            sync_state::record_conflict(
                                &conn,
                                &snippet_id,
                                "remote_changed_while_local_pending",
                                &local_snippet,
                                &remote_snippet,
                            )?;
                            stats.conflicts += 1;
                            continue;
                        }

                        sync_state::insert_or_replace_snippet(&conn, &remote_snippet)?;
                        upsert_drive_sync(&conn, &snippet_id, file)?;
                        sync_state::mark_snippet_synced(&conn, &snippet_id, file.version.as_deref())?;
                        stats.updated += 1;
                    }
                    Some(_) => {
                        upsert_drive_sync(&conn, &snippet_id, file)?;
                        sync_state::mark_snippet_synced(&conn, &snippet_id, file.version.as_deref())?;
                    }
                    None => {
                        sync_state::insert_or_replace_snippet(&conn, &remote_snippet)?;
                        upsert_drive_sync(&conn, &snippet_id, file)?;
                        sync_state::mark_snippet_synced(&conn, &snippet_id, file.version.as_deref())?;
                        stats.imported += 1;
                    }
                }
            }
        }

        if let Some(new_token) = change_list.new_start_page_token {
            let conn = db.lock().map_err(|e| e.to_string())?;
            sync_state::set_drive_state(&conn, "page_token", &new_token)?;
            break;
        }

        if let Some(next_page_token) = change_list.next_page_token {
            current_page_token = next_page_token;
            continue;
        }

        break;
    }

    process_pending_queue(auth, api, db, storage_mode, folder_id, &mut stats).await?;

    Ok(stats)
}

pub async fn process_pending_queue(
    auth: &mut DriveAuth,
    api: &DriveApiClient,
    db: &Db,
    storage_mode: StorageMode,
    folder_id: Option<&str>,
    stats: &mut DriveSyncStats,
) -> Result<(), String> {
    let jobs = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        sync_state::list_pending_queue(&conn)?
    };

    for job in jobs {
        {
            let conn = db.lock().map_err(|e| e.to_string())?;
            sync_state::mark_queue_job_processing(&conn, job.id)?;
        }

        let result: Result<bool, String> = match job.operation.as_str() {
            "delete" => process_delete_job(auth, api, db, &job).await.map(|_| false),
            _ => process_upsert_job(auth, api, db, storage_mode, folder_id, &job).await,
        };

        let conn = db.lock().map_err(|e| e.to_string())?;
        match result {
            Ok(exported) => {
                sync_state::mark_queue_job_done(&conn, job.id)?;
                if exported {
                    stats.exported += 1;
                } else {
                    stats.updated += 1;
                }
            }
            Err(error) => {
                sync_state::mark_queue_job_failed(&conn, job.id, &error)?;
                sync_state::log_activity(
                    &conn,
                    "error",
                    "queue_job",
                    &format!("Failed {} for {}: {error}", job.operation, job.snippet_id),
                    Some(&job.snippet_id),
                )?;
            }
        }
    }

    Ok(())
}

async fn process_upsert_job(
    auth: &mut DriveAuth,
    api: &DriveApiClient,
    db: &Db,
    storage_mode: StorageMode,
    folder_id: Option<&str>,
    job: &sync_state::SyncQueueItem,
) -> Result<bool, String> {
    let (local_snippet, existing_file_id) = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let local = sync_state::load_snippet_with_tags(&conn, &job.snippet_id, true)?
            .ok_or_else(|| format!("Snippet {} not found in DB", job.snippet_id))?;
        let file_id = get_drive_file_id(&conn, &job.snippet_id)?;
        (local, file_id)
    };

    if local_snippet.snippet.deleted_at.is_some() {
        return process_delete_job(auth, api, db, job).await.map(|_| false);
    }

    let vault_snippet = VaultSnippet::from_snippet_with_tags(&local_snippet);
    let json = vault_snippet.to_json()?;

    match existing_file_id {
        Some(file_id) => {
            let token = auth.get_valid_token().await?;
            let updated = api.update_file(&token, &file_id, &json).await?;
            let conn = db.lock().map_err(|e| e.to_string())?;
            upsert_drive_sync_from_parts(
                &conn,
                &job.snippet_id,
                &file_id,
                updated.modified_time.as_deref().unwrap_or(""),
                updated.version.as_deref(),
                updated.md5_checksum.as_deref(),
            )?;
            sync_state::mark_snippet_synced(&conn, &job.snippet_id, updated.version.as_deref())?;
            Ok(false)
        }
        None => {
            let file_name = format!("snibox_{}.json", job.snippet_id);
            let parents = build_parents(storage_mode, folder_id);
            let token = auth.get_valid_token().await?;
            let created = api.create_file(&token, &file_name, &json, &parents).await?;
            let conn = db.lock().map_err(|e| e.to_string())?;
            upsert_drive_sync(&conn, &job.snippet_id, &created)?;
            sync_state::mark_snippet_synced(&conn, &job.snippet_id, created.version.as_deref())?;
            Ok(true)
        }
    }
}

async fn process_delete_job(
    auth: &mut DriveAuth,
    api: &DriveApiClient,
    db: &Db,
    job: &sync_state::SyncQueueItem,
) -> Result<(), String> {
    let file_id = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        get_drive_file_id(&conn, &job.snippet_id)?
    };

    if let Some(file_id) = file_id {
        let token = auth.get_valid_token().await?;
        api.delete_file(&token, &file_id).await?;
    }

    let conn = db.lock().map_err(|e| e.to_string())?;
    clear_drive_sync(&conn, &job.snippet_id)?;
    sync_state::mark_snippet_synced(&conn, &job.snippet_id, None)?;
    Ok(())
}

fn extract_snippet_id(filename: &str) -> Option<String> {
    let name = filename.strip_suffix(".json")?;
    let id = name.strip_prefix("snibox_")?;
    if id.is_empty() {
        None
    } else {
        Some(id.to_string())
    }
}

fn build_parents(storage_mode: StorageMode, folder_id: Option<&str>) -> Vec<String> {
    match storage_mode {
        StorageMode::Appdata => vec!["appDataFolder".to_string()],
        StorageMode::Folder => folder_id
            .map(|folder_id| vec![folder_id.to_string()])
            .unwrap_or_default(),
    }
}

fn is_content_different(remote: &VaultSnippet, local: &SnippetWithTags) -> bool {
    remote.content != local.snippet.content
        || remote.title != local.snippet.title
        || remote.pinned != local.snippet.pinned
        || remote.tags != local.tags
}

fn has_pin_only_difference(remote: &VaultSnippet, local: &SnippetWithTags) -> bool {
    remote.pinned != local.snippet.pinned
        && remote.content == local.snippet.content
        && remote.title == local.snippet.title
        && remote.tags == local.tags
}

fn upsert_drive_sync(conn: &Connection, snippet_id: &str, file: &DriveFile) -> Result<(), String> {
    upsert_drive_sync_from_parts(
        conn,
        snippet_id,
        &file.id,
        file.modified_time.as_deref().unwrap_or(""),
        file.version.as_deref(),
        file.md5_checksum.as_deref(),
    )
}

fn upsert_drive_sync_from_parts(
    conn: &Connection,
    snippet_id: &str,
    drive_file_id: &str,
    modified_time: &str,
    version: Option<&str>,
    md5_checksum: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO drive_sync (snippet_id, drive_file_id, modified_time, version, md5_checksum, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(snippet_id) DO UPDATE SET
            drive_file_id = excluded.drive_file_id,
            modified_time = excluded.modified_time,
            version = excluded.version,
            md5_checksum = excluded.md5_checksum,
            synced_at = excluded.synced_at",
        rusqlite::params![
            snippet_id,
            drive_file_id,
            modified_time,
            version,
            md5_checksum,
            sync_state::now_timestamp()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn clear_drive_sync(conn: &Connection, snippet_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM drive_sync WHERE snippet_id = ?1",
        rusqlite::params![snippet_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_drive_file_id(conn: &Connection, snippet_id: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT drive_file_id FROM drive_sync WHERE snippet_id = ?1",
        rusqlite::params![snippet_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn find_snippet_by_drive_file_id(
    conn: &Connection,
    drive_file_id: &str,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT snippet_id FROM drive_sync WHERE drive_file_id = ?1",
        rusqlite::params![drive_file_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn get_all_snippets_from_db(conn: &Connection, include_deleted: bool) -> Result<Vec<SnippetWithTags>, String> {
    let sql = if include_deleted {
        "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count,
                sync_state, last_synced_at, remote_version, deleted_at, conflict_parent_id, device_updated_at
         FROM snippets"
    } else {
        "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count,
                sync_state, last_synced_at, remote_version, deleted_at, conflict_parent_id, device_updated_at
         FROM snippets
         WHERE deleted_at IS NULL"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let snippets = stmt
        .query_map([], sync_state::row_to_snippet)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for snippet in snippets {
        let tags = sync_state::get_tags_for_snippet(conn, &snippet.id)?;
        results.push(SnippetWithTags { snippet, tags });
    }
    Ok(results)
}

pub fn get_drive_state(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    sync_state::get_drive_state(conn, key)
}

pub fn clear_drive_tables(conn: &Connection) -> Result<(), String> {
    sync_state::clear_drive_tables(conn)
}
