# CLI 參數說明

目前建議使用入口：

```bash
node ./cli/main.js [options]
```

## 支援參數

| 參數 | 說明 |
| --- | --- |
| `-c, --config <path>` | 指定設定檔路徑，預設 `./config.toml` |
| `--morphe-cli` | 只測試/準備 `morphe-cli` jar，跳過 APK 與 patches 流程 |
| `--download-only` | 只處理 APK 下載，跳過 patches 與 patch 打包流程 |
| `--patches-only` | 只處理 patches 檔案，跳過 APK 下載與 patch 打包流程 |
| `--dry-run` | 僅輸出預計執行步驟，不實際下載或打包 |
| `--force` | 強制重新下載已存在的檔案（APK / `.mpp` / `.jar`） |
| `--clear-cache` | 執行前先清空 workspace cache 目錄 |
| `--no-task-log` | 關閉本次任務資料夾與 log 落盤 |
| `--workspace <path>` | 指定 workspace 根目錄（downloads/patches/output/runtime 都會走此路徑） |
| `--migrate-workspace` | 一次性將舊根目錄資料夾遷移到 workspace |
| `-h, --help` | 顯示說明 |

## 互斥規則

以下模式一次只能使用一個：

- `--morphe-cli`
- `--download-only`
- `--patches-only`

若同時指定多個，程式會直接報錯。

## 簡單範例

```bash
# 使用預設 config.toml 完整流程執行
node ./cli/main.js

# 指定設定檔
node ./cli/main.js --config ./config.toml

# 只下載 APK（不 patch）
node ./cli/main.js --download-only

# 只測試 morphe-cli 下載/解析
node ./cli/main.js --morphe-cli

# 模擬執行，不做實際變更
node ./cli/main.js --dry-run

# 強制重抓資源
node ./cli/main.js --force

# 指定 workspace
node ./cli/main.js --workspace ./workspace

# 清空 cache 後執行
node ./cli/main.js --clear-cache
```

## 簽章路徑來源優先序

`cli/main.js` 最終使用的 keystore 路徑優先序如下（由高到低）：

1. 環境變數 `PATCH_KEYSTORE_PATH`（舊版相容：`MORPHE_KEYSTORE_PATH`）
2. `config.toml` 的 `[signing].keystore_path`
3. `PATCH_KEYSTORE_BASE64`（舊版相容：`MORPHE_KEYSTORE_BASE64`，會產生暫存 keystore）
4. workspace 預設 `workspace/keystore/morphe-test.keystore`（有啟用 workspace 參數時）
5. `config.toml` 同層的 `morphe-test.keystore`

補充：
- 若使用 legacy 環境變數（`MORPHE_*`），程式會提示 deprecation warning，但仍維持相容。

## Runtime 網路參數（可選）

1. `PATCH_PAGE_TIMEOUT_MS`（舊版相容：`MORPHE_PAGE_TIMEOUT_MS`）
2. `PATCH_DOWNLOAD_TIMEOUT_MS`（舊版相容：`MORPHE_DOWNLOAD_TIMEOUT_MS`）
3. `PATCH_HTTP_CACHE_TTL_MS`（舊版相容：`MORPHE_HTTP_CACHE_TTL_MS`）
