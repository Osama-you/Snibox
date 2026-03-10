use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Snippet {
    pub id: String,
    pub title: Option<String>,
    pub content: String,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
    pub last_used_at: Option<String>,
    pub use_count: i64,
    pub sync_state: String,
    pub last_synced_at: Option<String>,
    pub remote_version: Option<String>,
    pub deleted_at: Option<String>,
    pub conflict_parent_id: Option<String>,
    pub device_updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnippetWithTags {
    #[serde(flatten)]
    pub snippet: Snippet,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Draft {
    pub id: String,
    pub snippet_id: Option<String>,
    pub title: Option<String>,
    pub content: Option<String>,
    pub tags: Option<String>,
    pub saved_at: String,
}
