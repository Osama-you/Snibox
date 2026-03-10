use chrono::{DateTime, Duration, Utc};
use keyring::Entry;
use serde::Deserialize;

const KEYRING_SERVICE: &str = "com.snibox.app";
const KEYRING_USER: &str = "google_drive_refresh";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES: &str = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file";

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: i64,
    refresh_token: Option<String>,
}

pub struct DriveAuth {
    client_id: String,
    client_secret: String,
    access_token: Option<String>,
    token_expiry: Option<DateTime<Utc>>,
    http_client: reqwest::Client,
}

impl DriveAuth {
    pub fn new(client_id: String, client_secret: String) -> Self {
        Self {
            client_id,
            client_secret,
            access_token: None,
            token_expiry: None,
            http_client: reqwest::Client::new(),
        }
    }

    pub fn build_auth_url(&self, redirect_port: u16, code_challenge: &str) -> String {
        let redirect_uri = format!("http://localhost:{}", redirect_port);
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
            AUTH_ENDPOINT,
            urlencoding::encode(&self.client_id),
            urlencoding::encode(&redirect_uri),
            urlencoding::encode(SCOPES),
            urlencoding::encode(code_challenge),
        )
    }

    pub async fn exchange_code(
        &mut self,
        code: &str,
        redirect_port: u16,
        code_verifier: &str,
    ) -> Result<(), String> {
        let redirect_uri = format!("http://localhost:{}", redirect_port);
        let params = [
            ("code", code),
            ("client_id", &self.client_id),
            ("client_secret", &self.client_secret),
            ("redirect_uri", &redirect_uri),
            ("grant_type", "authorization_code"),
            ("code_verifier", code_verifier),
        ];

        let resp = self
            .http_client
            .post(TOKEN_ENDPOINT)
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Token exchange request failed: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Token exchange failed: {}", body));
        }

        let token_resp: TokenResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse token response: {}", e))?;

        self.access_token = Some(token_resp.access_token);
        self.token_expiry = Some(Utc::now() + Duration::seconds(token_resp.expires_in));

        if let Some(refresh_token) = token_resp.refresh_token {
            self.store_refresh_token(&refresh_token)?;
        }

        Ok(())
    }

    pub async fn refresh_access_token(&mut self) -> Result<(), String> {
        let refresh_token = self.load_refresh_token()?;

        let params = [
            ("refresh_token", refresh_token.as_str()),
            ("client_id", &self.client_id),
            ("client_secret", &self.client_secret),
            ("grant_type", "refresh_token"),
        ];

        let resp = self
            .http_client
            .post(TOKEN_ENDPOINT)
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Token refresh request failed: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Token refresh failed (may be revoked): {}", body));
        }

        let token_resp: TokenResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

        self.access_token = Some(token_resp.access_token);
        self.token_expiry = Some(Utc::now() + Duration::seconds(token_resp.expires_in));

        if let Some(new_refresh) = token_resp.refresh_token {
            self.store_refresh_token(&new_refresh)?;
        }

        Ok(())
    }

    pub async fn get_valid_token(&mut self) -> Result<String, String> {
        let needs_refresh = match (&self.access_token, &self.token_expiry) {
            (Some(_), Some(expiry)) => Utc::now() + Duration::seconds(60) >= *expiry,
            (None, _) => true,
            _ => true,
        };

        if needs_refresh {
            self.refresh_access_token().await?;
        }

        self.access_token
            .clone()
            .ok_or_else(|| "No access token available".to_string())
    }

    fn store_refresh_token(&self, token: &str) -> Result<(), String> {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| format!("Keyring entry error: {}", e))?;
        entry
            .set_password(token)
            .map_err(|e| format!("Failed to store refresh token: {}", e))
    }

    fn load_refresh_token(&self) -> Result<String, String> {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| format!("Keyring entry error: {}", e))?;
        entry
            .get_password()
            .map_err(|e| format!("Failed to load refresh token: {}", e))
    }

    pub fn clear_tokens(&mut self) -> Result<(), String> {
        self.access_token = None;
        self.token_expiry = None;
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| format!("Keyring entry error: {}", e))?;
        let _ = entry.delete_credential();
        Ok(())
    }
}

pub fn generate_pkce() -> (String, String) {
    use oauth2::PkceCodeChallenge;
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    (challenge.as_str().to_string(), verifier.secret().to_string())
}

pub(crate) mod urlencoding {
    pub fn encode(s: &str) -> String {
        url_escape(s)
    }

    fn url_escape(s: &str) -> String {
        let mut result = String::with_capacity(s.len() * 2);
        for b in s.bytes() {
            match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    result.push(b as char)
                }
                _ => {
                    result.push('%');
                    result.push_str(&format!("{:02X}", b));
                }
            }
        }
        result
    }
}
