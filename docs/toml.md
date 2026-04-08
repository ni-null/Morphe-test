# config.toml 參數說明

本文檔說明 `config.toml` 可用參數。建議把配置集中在 TOML，不在檔案中放大量註解。

## 結構總覽

- `[global]`：全域設定（例如 workspace）
- `[morphe-cli]`：`morphe-cli` jar 來源設定
- `[patches]`：patches 檔案來源設定
- `[signing]`：簽章設定（keystore / alias / password）
- `[app-name]`：每個 App 一個區塊（例如 `[youtube]`）

## `[global]`

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `workspace` | `string` | 指定 workspace 根目錄（downloads/patches/output/runtime/toml）。 |

## `[morphe-cli]`

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `mode` | `string` | `stable` / `dev` / `local`。`local` 時需提供 `path`。 |
| `patches_repo` | `string` | `morphe-cli` 的 GitHub repo（例如 `MorpheApp/morphe-cli`）。`stable/dev` 模式使用。 |
| `path` | `string` | 本地 jar 路徑。`local` 模式使用。 |
| `ver` | `string` | 指定 jar 檔名（可選），例如 `morphe-cli-1.6.3-all.jar`。 |

## `[patches]`

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `mode` | `string` | `stable` / `dev` / `local`。`local` 時需提供 `path`。 |
| `patches_repo` | `string` | patches 的 GitHub repo（例如 `MorpheApp/morphe-patches`）。`stable/dev` 模式使用。 |
| `path` | `string` | 本地 `.mpp` 路徑。`local` 模式使用。 |
| `ver` | `string` | 指定 patches 檔名（可選），例如 `patches-1.23.0-dev.1.mpp`。 |

## `[signing]`

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `keystore_path` / `keystore-path` / `path` | `string` | keystore 路徑（可絕對或相對 `config.toml`）。 |
| `store_password` / `store-password` / `keystore_password` | `string` | keystore 密碼（可選）。 |
| `entry_alias` / `entry-alias` / `alias` | `string` | 簽章 alias（可選）。 |
| `entry_password` / `entry-password` / `key_password` | `string` | 簽章 entry 密碼（可選）。 |

## `[app-name]`（每個 App 區塊）

### 基本模式

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `mode` | `string` / `bool` | `"remote"`（線上來源）/ `"local"`（本地 APK）/ `false`（略過此 app）。 |
| `ver` | `string` | 指定目標版本（可選）。 |

### local 模式

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `local_apk` | `string` | 本地 APK 路徑（可選）。未設定時使用預設路徑。 |

### remote 模式（建議）

remote fallback 順序：`apkmirror -> uptodown -> archive`

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `apkmirror-dlurl` / `apkmirror_dlurl` | `string` | APKMirror app 頁面 URL。 |
| `uptodown-dlurl` / `uptodown_dlurl` | `string` | Uptodown app 頁面 URL。 |
| `archive-dlurl` / `archive_dlurl` | `string` | archive.org 檔案目錄 URL。 |

### APKMirror 專用（可選）

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `type` | `string` | 變體篩選，例如 `APK` / `BUNDLE`。 |
| `arch` | `string` | 目標架構，例如 `arm64-v8a` / `armeabi-v7a` / `universal`。 |
| `dpi` | `string` | 目標 DPI，例如 `nodpi`。 |
| `release_prefix` | `string` | release slug 前綴（特殊命名 app 需要）。 |
| `variant_hint` | `string` | 變體提示字串，協助挑選候選連結。 |
| `apkmirror_user_agent` | `string` | 覆寫 APKMirror 請求 UA。 |
| `apkmirror_accept_language` | `string` | 覆寫 `Accept-Language`。 |
| `apkmirror_cookie` | `string` | 指定 cookie header。 |
| `cf_clearance` | `string` | 指定 Cloudflare clearance token。 |

### 其他 provider 鍵（可選）

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `apkpure-dlurl` / `apkpure_dlurl` | `string` | APKPure app/download URL。 |

## 範例

```toml
[morphe-cli]
patches_repo = "MorpheApp/morphe-cli"
mode = "stable"
path = ""

[patches]
patches_repo = "MorpheApp/morphe-patches"
mode = "stable"
path = ""

[signing]
keystore_path = "./workspace/keystore/morphe-test.keystore"

[youtube]
mode = "remote"
package_name = "com.google.android.youtube"
apkmirror-dlurl = "https://www.apkmirror.com/apk/google-inc/youtube"
uptodown-dlurl = "https://youtube.en.uptodown.com/android"
archive-dlurl = "https://dn790002.ca.archive.org/0/items/jhc-apks/apks/com.google.android.youtube/"
```
