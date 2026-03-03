use crate::db::models::SnippetWithTags;
use crate::vault::format::VaultSnippet;

pub struct ConflictResult {
    pub conflict_snippet: SnippetWithTags,
    pub conflict_vault_snippet: VaultSnippet,
}

pub fn create_conflict_copy(
    local: &SnippetWithTags,
) -> ConflictResult {
    let device_name = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let new_id = uuid::Uuid::new_v4().to_string();
    let original_title = local
        .snippet
        .title
        .as_deref()
        .unwrap_or("Untitled");
    let conflict_title = format!("{} (conflict from {})", original_title, device_name);

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let conflict_snippet = SnippetWithTags {
        snippet: crate::db::models::Snippet {
            id: new_id.clone(),
            title: Some(conflict_title.clone()),
            content: local.snippet.content.clone(),
            pinned: local.snippet.pinned,
            created_at: now.clone(),
            updated_at: now.clone(),
            last_used_at: None,
            use_count: 0,
        },
        tags: local.tags.clone(),
    };

    let conflict_vault = VaultSnippet::from_snippet_with_tags(&conflict_snippet);

    ConflictResult {
        conflict_snippet,
        conflict_vault_snippet: conflict_vault,
    }
}

pub fn should_conflict(stored_version: Option<&str>, remote_version: Option<&str>) -> bool {
    match (stored_version, remote_version) {
        (Some(stored), Some(remote)) => stored != remote,
        (None, Some(_)) => true,
        _ => false,
    }
}
