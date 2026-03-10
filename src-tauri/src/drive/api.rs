use serde::{Deserialize, Serialize};

const DRIVE_FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL: &str = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_CHANGES_URL: &str = "https://www.googleapis.com/drive/v3/changes";

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StorageMode {
    Appdata,
    Folder,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    pub id: String,
    pub name: Option<String>,
    pub modified_time: Option<String>,
    pub md5_checksum: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileList {
    pub files: Vec<DriveFile>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub file_id: Option<String>,
    pub removed: Option<bool>,
    pub file: Option<DriveFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeList {
    pub changes: Vec<Change>,
    pub next_page_token: Option<String>,
    pub new_start_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPageToken {
    pub start_page_token: String,
}

pub struct DriveApiClient {
    http: reqwest::Client,
}

impl DriveApiClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }

    pub async fn find_folder(
        &self,
        token: &str,
        name: &str,
        storage_mode: StorageMode,
    ) -> Result<Option<DriveFile>, String> {
        let (spaces, q) = match storage_mode {
            StorageMode::Appdata => (
                "appDataFolder",
                format!(
                    "name = '{}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                    name
                ),
            ),
            StorageMode::Folder => (
                "drive",
                format!(
                    "name = '{}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false",
                    name
                ),
            ),
        };

        let url = format!(
            "{}?spaces={}&q={}&fields=files(id,name)&pageSize=1",
            DRIVE_FILES_URL,
            spaces,
            crate::drive::auth::urlencoding::encode(&q),
        );

        let resp = self
            .http
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Find folder request failed: {}", e))?;

        let list: FileList = parse_response(resp).await?;
        Ok(list.files.into_iter().next())
    }

    pub async fn find_or_create_folder(
        &self,
        token: &str,
        name: &str,
        storage_mode: StorageMode,
    ) -> Result<DriveFile, String> {
        if let Some(existing) = self.find_folder(token, name, storage_mode).await? {
            return Ok(existing);
        }
        self.create_folder(token, name, storage_mode).await
    }

    pub async fn create_folder(
        &self,
        token: &str,
        name: &str,
        storage_mode: StorageMode,
    ) -> Result<DriveFile, String> {
        let parents = match storage_mode {
            StorageMode::Appdata => vec!["appDataFolder".to_string()],
            StorageMode::Folder => vec![],
        };

        let body = serde_json::json!({
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": parents,
        });

        let resp = self
            .http
            .post(DRIVE_FILES_URL)
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Create folder request failed: {}", e))?;

        parse_response(resp).await
    }

    pub async fn create_file(
        &self,
        token: &str,
        name: &str,
        content: &str,
        parents: &[String],
    ) -> Result<DriveFile, String> {
        let metadata = serde_json::json!({
            "name": name,
            "parents": parents,
        });

        let boundary = "snibox_boundary_314159";
        let body = format!(
            "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{}\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n{}\r\n--{boundary}--",
            serde_json::to_string(&metadata).unwrap_or_default(),
            content,
            boundary = boundary,
        );

        let resp = self
            .http
            .post(format!(
                "{}?uploadType=multipart&fields=id,name,modifiedTime,md5Checksum,version",
                DRIVE_UPLOAD_URL
            ))
            .bearer_auth(token)
            .header(
                "Content-Type",
                format!("multipart/related; boundary={}", boundary),
            )
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Create file request failed: {}", e))?;

        parse_response(resp).await
    }

    pub async fn update_file(
        &self,
        token: &str,
        file_id: &str,
        content: &str,
    ) -> Result<DriveFile, String> {
        let resp = self
            .http
            .patch(format!(
                "{}/{}?uploadType=media&fields=id,name,modifiedTime,md5Checksum,version",
                DRIVE_UPLOAD_URL, file_id
            ))
            .bearer_auth(token)
            .header("Content-Type", "application/json")
            .body(content.to_string())
            .send()
            .await
            .map_err(|e| format!("Update file request failed: {}", e))?;

        parse_response(resp).await
    }

    pub async fn get_file_content(&self, token: &str, file_id: &str) -> Result<String, String> {
        let resp = self
            .http
            .get(format!("{}/{}?alt=media", DRIVE_FILES_URL, file_id))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Get file content request failed: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Get file content failed: {}", body));
        }

        resp.text()
            .await
            .map_err(|e| format!("Failed to read file content: {}", e))
    }

    pub async fn delete_file(&self, token: &str, file_id: &str) -> Result<(), String> {
        let resp = self
            .http
            .delete(format!("{}/{}", DRIVE_FILES_URL, file_id))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Delete file request failed: {}", e))?;

        if !resp.status().is_success() && resp.status().as_u16() != 404 {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Delete file failed: {}", body));
        }

        Ok(())
    }

    pub async fn list_files(
        &self,
        token: &str,
        storage_mode: StorageMode,
        folder_id: Option<&str>,
    ) -> Result<Vec<DriveFile>, String> {
        let mut all_files = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let (spaces, q) = match storage_mode {
                StorageMode::Appdata => (
                    "appDataFolder",
                    "name contains 'snibox_' and mimeType != 'application/vnd.google-apps.folder'"
                        .to_string(),
                ),
                StorageMode::Folder => {
                    let fid = folder_id.ok_or("Folder ID required for folder mode")?;
                    (
                        "drive",
                        format!(
                            "'{}' in parents and name contains 'snibox_' and mimeType != 'application/vnd.google-apps.folder'",
                            fid
                        ),
                    )
                }
            };

            let mut url = format!(
                "{}?spaces={}&q={}&fields=nextPageToken,files(id,name,modifiedTime,md5Checksum,version)&pageSize=1000",
                DRIVE_FILES_URL,
                spaces,
                crate::drive::auth::urlencoding::encode(&q),
            );

            if let Some(pt) = &page_token {
                url.push_str(&format!("&pageToken={}", pt));
            }

            let resp = self
                .http
                .get(&url)
                .bearer_auth(token)
                .send()
                .await
                .map_err(|e| format!("List files request failed: {}", e))?;

            let list: FileList = parse_response(resp).await?;
            all_files.extend(list.files);

            match list.next_page_token {
                Some(pt) => page_token = Some(pt),
                None => break,
            }
        }

        Ok(all_files)
    }

    pub async fn get_start_page_token(
        &self,
        token: &str,
        storage_mode: StorageMode,
    ) -> Result<String, String> {
        let spaces = match storage_mode {
            StorageMode::Appdata => "appDataFolder",
            StorageMode::Folder => "drive",
        };

        let resp = self
            .http
            .get(format!(
                "{}/startPageToken?spaces={}",
                DRIVE_CHANGES_URL, spaces
            ))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Get start page token failed: {}", e))?;

        let spt: StartPageToken = parse_response(resp).await?;
        Ok(spt.start_page_token)
    }

    pub async fn list_changes(
        &self,
        token: &str,
        page_token: &str,
        storage_mode: StorageMode,
    ) -> Result<ChangeList, String> {
        let spaces = match storage_mode {
            StorageMode::Appdata => "appDataFolder",
            StorageMode::Folder => "drive",
        };

        let resp = self
            .http
            .get(format!(
                "{}?pageToken={}&spaces={}&includeRemoved=true&fields=changes(fileId,removed,file(id,name,modifiedTime,md5Checksum,version)),nextPageToken,newStartPageToken&pageSize=1000",
                DRIVE_CHANGES_URL, page_token, spaces
            ))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("List changes request failed: {}", e))?;

        parse_response(resp).await
    }
}

async fn parse_response<T: serde::de::DeserializeOwned>(
    resp: reqwest::Response,
) -> Result<T, String> {
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Drive API error {}: {}", status, body));
    }
    resp.json()
        .await
        .map_err(|e| format!("Failed to parse Drive response: {}", e))
}
