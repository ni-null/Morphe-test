# config.toml 參數說明

本文檔說明 `config.toml` 可用參數。建議把配置集中在 TOML，不在檔案中放大量註解。

## 結構總覽

- `[global]`：全域預設值
- `[morphe-cli]`：`morphe-cli` jar 來源設定
- `[patches]`：patches 檔案來源設定
- `[app-name]`：每個 App 一個區塊（例如 `[youtube]`）

## `[global]`

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `patches` | `string` | 共用 patches 檔案路徑（可選）。若 app 區塊未覆寫，會使用此值。 |

## `[morphe-cli]`

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `patches_repo` | `string` | `morphe-cli` 的 GitHub repo（例如 `MorpheApp/morphe-cli`）。 |
| `ver` | `string` | 指定 jar 檔名（可選），例如 `morphe-cli-1.6.3-all.jar`。 |

## `[patches]`

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `patches_repo` | `string` | patches 的 GitHub repo（例如 `MorpheApp/morphe-patches`）。 |
| `mode` | `string` | `stable` 或 `dev`。`stable` 偏向非 dev 資產，`dev` 偏向 dev 資產。 |
| `ver` | `string` | 指定 patches 檔名（可選），例如 `patches-1.23.0-dev.1.mpp`。 |

## `[app-name]`（每個 App 區塊）

### 基本模式

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `apk` | `string` | `remote` 或 `local`。 |
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
| `download_url` | `string` | 直接下載 URL（若設定，provider 解析會優先使用）。 |
| `release_url` | `string` | 指定 release 頁（常用於 APKMirror 精準定位，可選）。 |

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

### 其他 provider 相容鍵（可選）

| 參數 | 型別 | 說明 |
| --- | --- | --- |
| `app_url` / `app-url` | `string` | Uptodown / Archive / APKPure 可用的通用 app URL 欄位。 |
| `apkpure-dlurl` / `apkpure_dlurl` | `string` | APKPure app/download URL。 |

## 範例

```toml
[global]
patches = "./patches/youtube.mpp"

[morphe-cli]
patches_repo = "MorpheApp/morphe-cli"

[patches]
patches_repo = "MorpheApp/morphe-patches"
mode = "stable"

[youtube]
apk = "remote"
apkmirror-dlurl = "https://www.apkmirror.com/apk/google-inc/youtube"
uptodown-dlurl = "https://youtube.en.uptodown.com/android"
archive-dlurl = "https://dn790002.ca.archive.org/0/items/jhc-apks/apks/com.google.android.youtube/"
```
