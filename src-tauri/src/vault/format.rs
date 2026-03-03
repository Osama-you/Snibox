use crate::db::models::{Snippet, SnippetWithTags};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultSnippet {
    pub id: String,
    pub title: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl VaultSnippet {
    pub fn from_snippet_with_tags(snippet_with_tags: &SnippetWithTags) -> Self {
        Self {
            id: snippet_with_tags.snippet.id.clone(),
            title: snippet_with_tags.snippet.title.clone(),
            content: snippet_with_tags.snippet.content.clone(),
            tags: snippet_with_tags.tags.clone(),
            pinned: snippet_with_tags.snippet.pinned,
            created_at: snippet_with_tags.snippet.created_at.clone(),
            updated_at: snippet_with_tags.snippet.updated_at.clone(),
        }
    }

    pub fn to_snippet_with_tags(&self) -> SnippetWithTags {
        SnippetWithTags {
            snippet: Snippet {
                id: self.id.clone(),
                title: self.title.clone(),
                content: self.content.clone(),
                pinned: self.pinned,
                created_at: self.created_at.clone(),
                updated_at: self.updated_at.clone(),
                last_used_at: None,
                use_count: 0,
            },
            tags: self.tags.clone(),
        }
    }

    pub fn parse_from_json(json_str: &str) -> Result<Self, String> {
        serde_json::from_str(json_str).map_err(|e| format!("Failed to parse JSON: {}", e))
    }

    pub fn to_json(&self) -> Result<String, String> {
        serde_json::to_string_pretty(self).map_err(|e| format!("Failed to serialize JSON: {}", e))
    }

    pub fn updated_at_timestamp(&self) -> Result<DateTime<Utc>, String> {
        DateTime::parse_from_rfc3339(&self.updated_at)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(|e| format!("Failed to parse updated_at: {}", e))
    }
}
