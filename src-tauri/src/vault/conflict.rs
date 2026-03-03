use crate::db::models::SnippetWithTags;
use crate::vault::format::VaultSnippet;
use rusqlite::Connection;

pub fn detect_and_resolve_conflict(
    conn: &Connection,
    vault_snippet: &VaultSnippet,
    existing_snippet: &SnippetWithTags,
) -> Result<Option<SnippetWithTags>, String> {
    let _vault_updated = vault_snippet
        .updated_at_timestamp()
        .map_err(|e| format!("Invalid vault timestamp: {}", e))?;

    let _db_updated = chrono::DateTime::parse_from_rfc3339(&existing_snippet.snippet.updated_at)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .map_err(|e| format!("Invalid DB timestamp: {}", e))?;

    if vault_snippet.content != existing_snippet.snippet.content
        || vault_snippet.title != existing_snippet.snippet.title
    {
        let device_name = hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "device".to_string());

        let conflict_id = uuid::Uuid::new_v4().to_string();
        let conflict_title = match &existing_snippet.snippet.title {
            Some(t) => Some(format!("{} (conflict from {})", t, device_name)),
            None => Some(format!("(conflict from {})", device_name)),
        };

        conn.execute(
            "INSERT INTO snippets (id, title, content, pinned, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                conflict_id,
                conflict_title,
                existing_snippet.snippet.content,
                existing_snippet.snippet.pinned as i64,
                existing_snippet.snippet.created_at,
                existing_snippet.snippet.updated_at,
            ],
        )
        .map_err(|e| e.to_string())?;

        for tag in &existing_snippet.tags {
            let tag_id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT OR IGNORE INTO tags (id, name) VALUES (?1, ?2)",
                rusqlite::params![tag_id, tag],
            )
            .map_err(|e| e.to_string())?;

            let actual_tag_id: String = conn
                .query_row(
                    "SELECT id FROM tags WHERE name = ?1",
                    rusqlite::params![tag],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            conn.execute(
                "INSERT OR IGNORE INTO snippet_tags (snippet_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![conflict_id, actual_tag_id],
            )
            .map_err(|e| e.to_string())?;
        }

        let conflict_snippet = SnippetWithTags {
            snippet: crate::db::models::Snippet {
                id: conflict_id.clone(),
                title: conflict_title.clone(),
                content: existing_snippet.snippet.content.clone(),
                pinned: existing_snippet.snippet.pinned,
                created_at: existing_snippet.snippet.created_at.clone(),
                updated_at: existing_snippet.snippet.updated_at.clone(),
                last_used_at: existing_snippet.snippet.last_used_at.clone(),
                use_count: existing_snippet.snippet.use_count,
            },
            tags: existing_snippet.tags.clone(),
        };

        return Ok(Some(conflict_snippet));
    }

    Ok(None)
}
