# CLI 參數說明

目前建議使用入口：

```bash
node ./main.js [options]
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
node ./main.js

# 指定設定檔
node ./main.js --config ./config.toml

# 只下載 APK（不 patch）
node ./main.js --download-only

# 只測試 morphe-cli 下載/解析
node ./main.js --morphe-cli

# 模擬執行，不做實際變更
node ./main.js --dry-run

# 強制重抓資源
node ./main.js --force
```
