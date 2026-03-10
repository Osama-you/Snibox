import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repository = (
  process.env.SNIBOX_UPDATER_REPOSITORY ||
  process.env.GITHUB_REPOSITORY ||
  ""
).trim();
const pubkey = (
  process.env.SNIBOX_UPDATER_PUBKEY ||
  process.env.TAURI_SIGNING_PUBLIC_KEY ||
  ""
).trim();

if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
  throw new Error(
    "Missing or invalid SNIBOX_UPDATER_REPOSITORY (expected owner/repo).",
  );
}

if (!pubkey) {
  throw new Error(
    "Missing updater public key. Set SNIBOX_UPDATER_PUBKEY (or TAURI_SIGNING_PUBLIC_KEY).",
  );
}

const endpoint = `https://github.com/${repository}/releases/latest/download/latest.json`;
const configPath = path.join(process.cwd(), "src-tauri", "tauri.conf.json");
const configRaw = await readFile(configPath, "utf8");
const config = JSON.parse(configRaw);

if (!config.plugins) {
  config.plugins = {};
}
if (!config.plugins.updater) {
  config.plugins.updater = {};
}

config.plugins.updater.endpoints = [endpoint];
config.plugins.updater.pubkey = pubkey;

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log(`Configured updater endpoint: ${endpoint}`);
