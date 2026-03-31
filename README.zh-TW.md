# Morphe Auto APK Patch

自動下載 APK、抓取 patch、執行 morphe-cli 打包，輸出 patched APK。

英文版本請參考 [README.md](./README.md)。

## 快速開始
1. 安裝需求
- Node.js 18+
- Java 21+
- `curl`

2. 安裝套件
```bash
npm ci
```

3. 準備設定與簽章檔
- 編輯 `config.toml`
- 本地測試請放置 `morphe-test.keystore` 於專案根目錄

4. 執行
```bash
node ./main.js --config ./config.toml
```

5. 結果位置
- 輸出 APK：`output/<app>/`
- 建置資訊：`output/release-metadata.json`

## 最小設定範例
```toml
[morphe-cli]
patches_repo = "MorpheApp/morphe-cli"

[patches]
patches_repo = "MorpheApp/morphe-patches"
mode = "stable"

[youtube]
apk = "remote"
```

## CI Workflows
- 手動發布：`.github/workflows/release.yml`
- 定時建置（不發布）：`.github/workflows/scheduled-build.yml`

## Fork 後如何自己跑
1. Fork 專案到自己的 GitHub 倉庫。
2. 到 `Settings -> Actions -> General`：
- 開啟 Actions（允許 workflow 執行）
- `Workflow permissions` 設為 `Read and write permissions`（手動發布需要）
3. 到 `Settings -> Secrets and variables -> Actions` 新增（可選）：
- `MORPHE_KEYSTORE_BASE64`
4. 如果沒設定 `MORPHE_KEYSTORE_BASE64`，workflow 會自動使用倉庫內的 `morphe-test.keystore`。
5. 進入 `Actions` 頁面：
- 手動執行 `Manual Build And Release APK` 進行發布
- 或啟用 `Scheduled Build APK (No Release)` 等待排程自動建置