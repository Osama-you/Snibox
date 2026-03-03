fn main() {
    // Load ../.env so env!() macros can read GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env");
    if env_path.exists() {
        for item in dotenvy::from_path_iter(&env_path).expect("Failed to read .env") {
            let (key, value) = item.expect("Invalid .env entry");
            println!("cargo:rustc-env={}={}", key, value);
        }
        println!("cargo:rerun-if-changed={}", env_path.display());
    }

    tauri_build::build()
}
