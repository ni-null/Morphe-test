# Engine-Neutral Refactor Plan (Phased + Checkpoints)

Last updated: 2026-04-11  
Goal: 將專案從 `morphe` 專用命名與耦合，逐步演進成可支援多種補丁引擎（不一次性破壞現有功能）。

## 0. Execution Status

1. [x] CP0 - Baseline Freeze (lightweight baseline + plan file established)
2. [x] CP1 - Phase A 完成
3. [x] CP2 - Phase B 完成
4. [x] CP3 - Phase C 完成
5. [ ] CP4 - Phase D 完成
6. [x] CP5 - Phase E 完成
7. [ ] CP6 - Phase F 完成

### Completed Log

1. 2026-04-11 / Phase A + CP1
   1. 新增 engine-neutral constants aliases（僅 alias，不改 runtime 行為）
   2. 保留 legacy constants，並標註 `@deprecated` 導向新命名
   3. 變更檔案：
      1. `desktop/web/src/lib/app-constants.js`
2. 2026-04-11 / Phase B + CP2
   1. IPC handlers 新增中性 method aliases（舊 method 保留）
   2. ipcClient 新增中性 API wrappers（可與舊 API 並行）
   3. 變更檔案：
      1. `desktop/ipc/handlers.js`
      2. `desktop/web/src/lib/ipcClient.js`
3. 2026-04-11 / Phase C + CP3
   1. config.toml 參數改為雙讀雙寫（舊鍵 `patches_repo` + 新鍵 `source_repo`）
   2. localStorage key 改為雙讀雙寫（新 key + legacy key 同步）
   3. 更新 TOML 文件遷移說明
   4. 變更檔案：
      1. `desktop/web/src/lib/app-constants.js`
      2. `desktop/web/src/lib/app-config.js`
      3. `desktop/web/src/hooks/useAppController.js`
      4. `desktop/web/src/pages/AssetsPage/hooks/useSourceAssetsState.js`
      5. `docs/toml.md`
4. 2026-04-11 / Phase D（Part 1，尚未達 CP4 gate）
   1. `useSourceAssetsState` 新增 `engine / patchBundle` 命名 alias（保留舊欄位）
   2. `useAppController` 對 `assetsPageProps` 同步輸出中性欄位
   3. `AssetsPage` 優先使用中性欄位，舊欄位作 fallback，避免破壞相容性
   4. 變更檔案：
      1. `desktop/web/src/pages/AssetsPage/hooks/useSourceAssetsState.js`
      2. `desktop/web/src/hooks/useAppController.js`
      3. `desktop/web/src/pages/AssetsPage/index.jsx`
5. 2026-04-11 / Phase D（Part 2，尚未達 CP4 gate）
   1. `useBuildSourceSelectors` 新增 `engine / patchBundle` select alias 輸出
   2. `BuildPage` 與 `BuildSourceSection` 加入新舊 props fallback，優先採中性命名
   3. `MorpheSettingsDialog` 與 `PatchesSettingsDialog` 加入中性欄位 fallback
   4. 變更檔案：
      1. `desktop/web/src/pages/BuildPage/hooks/useBuildSourceSelectors.js`
      2. `desktop/web/src/pages/BuildPage/index.jsx`
      3. `desktop/web/src/pages/BuildPage/components/BuildSourceSection.jsx`
      4. `desktop/web/src/hooks/useAppController.js`
      5. `desktop/web/src/pages/AssetsPage/components/MorpheSettingsDialog.jsx`
      6. `desktop/web/src/pages/AssetsPage/components/PatchesSettingsDialog.jsx`
6. 2026-04-11 / Phase D（Part 3，尚未達 CP4 gate）
   1. `useAppController` 新增 Dialog 對外 props alias：
      1. `engineSettingsDialogProps`
      2. `patchBundleSettingsDialogProps`
   2. `main.jsx` 改為優先使用新 alias，舊鍵 fallback
   3. 變更檔案：
      1. `desktop/web/src/hooks/useAppController.js`
      2. `desktop/web/src/main.jsx`
7. 2026-04-11 / Phase D（Part 4，尚未達 CP4 gate）
   1. `dialogStore` 新增中性 open state 與 setter：
      1. `engineSettingsOpen` / `setEngineSettingsOpen`
      2. `patchBundleSettingsOpen` / `setPatchBundleSettingsOpen`
   2. 新舊 setter 雙向同步，避免狀態分裂
   3. `useAppController` 改為優先使用中性 dialog state/setter，舊鍵 fallback
   4. 變更檔案：
      1. `desktop/web/src/stores/dialogStore.js`
      2. `desktop/web/src/hooks/useAppController.js`
8. 2026-04-11 / Phase D（Part 5，尚未達 CP4 gate）
   1. `useSourceAssetsState` 支援 `engineSettingsOpen / patchBundleSettingsOpen`（舊鍵 fallback）
   2. `useAppController` 傳入新舊 settings open props 至 assets state hook
   3. 變更檔案：
      1. `desktop/web/src/pages/AssetsPage/hooks/useSourceAssetsState.js`
      2. `desktop/web/src/hooks/useAppController.js`
9. 2026-04-11 / Phase E（Part 1，尚未達 CP5 gate）
   1. 新增 patch provider 架構：
      1. `providers/morphe.js`
      2. `providers/index.js`
   2. `main.js` 改為透過 provider 執行：
      1. CLI jar / patches 檔案解析
      2. 版本候選查詢
      3. patch command 執行
   3. `desktop/ipc/task-service.js` 改為透過 provider 執行：
      1. source save
      2. compatible versions
      3. patch entries
   4. 保留既有行為，不切換預設 provider（仍為 `morphe`）
   6. 變更檔案：
      1. `providers/morphe.js`
      2. `providers/index.js`
      3. `main.js`
      4. `desktop/ipc/task-service.js`
10. 2026-04-11 / Phase E（Part 2，尚未達 CP5 gate）
   1. 新增第二個 provider stub 並註冊：
      1. `providers/stub.js`
      2. `providers/index.js`
   2. `providers/index.js` 新增 provider 介面檢查（啟動時驗證必要方法）
   3. provider 選擇改為中性環境變數優先（`PATCH_PROVIDER`），並保留 legacy fallback（`MORPHE_PATCH_PROVIDER`）
   4. 變更檔案：
      1. `providers/stub.js`
      2. `providers/index.js`
      3. `main.js`
      4. `desktop/ipc/task-service.js`
11. 2026-04-11 / Phase E（Part 3，尚未達 CP5 gate）
   1. 任務與產物 metadata 新增 `patchProviderId`：
      1. CLI `task-info.json`
      2. CLI `release-metadata.json`
      3. Desktop task summary（live/history）
   2. 舊任務紀錄相容：若歷史 `task-info.json` 無 `patchProviderId`，則 fallback 目前 provider id
   3. 變更檔案：
      1. `main.js`
      2. `desktop/ipc/task-service.js`
12. 2026-04-11 / Phase E（Part 4，尚未達 CP5 gate）
   1. 前端歷史任務卡片與 Task Log dialog 顯示 `patchProviderId`
   2. 舊資料相容：無 `patchProviderId` 時不顯示 provider 次標
   3. i18n 新增 provider 顯示字串（en / zh-TW）
   4. 變更檔案：
      1. `desktop/web/src/hooks/useTaskDialogState.js`
      2. `desktop/web/src/hooks/useAppController.js`
      3. `desktop/web/src/components/dialogs/TaskDialogs.jsx`
      4. `desktop/web/src/pages/HistoryPage/components/HistoryTaskList.jsx`
      5. `desktop/web/i18n/locales/en.json`
      6. `desktop/web/i18n/locales/zh-TW.json`
13. 2026-04-11 / Phase E（Part 5，尚未達 CP5 gate）
   1. Build 產物列表（Generated APK）加入 `patchProviderId` 顯示
   2. `useBuildExecutionState` 將 task-level provider 資訊帶入 artifact rows
   3. i18n 新增 build provider 顯示字串（en / zh-TW）
   4. 變更檔案：
      1. `desktop/web/src/pages/BuildPage/hooks/useBuildExecutionState.js`
      2. `desktop/web/src/pages/BuildPage/components/GeneratedApksSection.jsx`
      3. `desktop/web/i18n/locales/en.json`
      4. `desktop/web/i18n/locales/zh-TW.json`
14. 2026-04-11 / Phase E（Part 6，達成 CP5 gate）
   1. 新增 provider smoke tests：
      1. provider registry（`morphe` / `stub`）
      2. env provider 解析優先序（`PATCH_PROVIDER` > `MORPHE_PATCH_PROVIDER`）
      3. unsupported provider error 行為
   2. 新增 provider registry helper：
      1. `listPatchProviderIds()`
   3. 驗證結果：
      1. `npm run test:providers` pass
      2. `npm run test:patch-naming` pass
   4. 變更檔案：
      1. `providers/index.js`
      2. `tests/providers.test.js`
      3. `package.json`
15. 2026-04-11 / Phase F（Part 1，尚未達 CP6 gate）
   1. 新增環境變數中性名稱（新鍵優先，舊鍵 fallback）：
      1. `PATCH_WORKSPACE`（legacy: `MORPHE_WORKSPACE`）
      2. `PATCH_KEYSTORE_PATH`（legacy: `MORPHE_KEYSTORE_PATH`）
      3. `PATCH_KEYSTORE_BASE64`（legacy: `MORPHE_KEYSTORE_BASE64`）
      4. `PATCH_PORTABLE`（legacy: `MORPHE_PORTABLE`）
   2. Desktop 啟動 CLI 任務時，同步注入新舊 keystore env key
   3. 新增 env alias smoke tests
   4. 更新 README / CLI / Desktop 文件說明
   6. 變更檔案：
      1. `main.js`
      2. `desktop/ipc/task-service.js`
      3. `desktop/ipc/cli-connector.js`
      4. `utils/signing.js`
      5. `utils/workspace.js`
      6. `tests/env-aliases.test.js`
      7. `package.json`
      8. `README.md`
      9. `README.zh-TW.md`
      10. `docs/cli.md`
      11. `docs/desktop.md`
16. 2026-04-11 / Phase F（Part 2，尚未達 CP6 gate）
   1. 新增共用 env alias 工具（含 once warning）：
      1. `resolveEnvWithLegacy`
      2. `warnLegacyEnvUsage`
   2. provider / workspace / signing 套用 legacy env deprecation warning
   3. 新增 env alias 測試覆蓋：
      1. 新鍵優先
      2. 舊鍵 fallback
      3. warning once 行為
   4. 變更檔案：
      1. `utils/env-alias.js`
      2. `providers/index.js`
      3. `main.js`
      4. `desktop/ipc/task-service.js`
      5. `utils/workspace.js`
      6. `utils/signing.js`
      7. `tests/env-aliases.test.js`
      8. `docs/cli.md`
17. 2026-04-11 / Phase F（Part 3，尚未達 CP6 gate）
   1. 新增 legacy alias 盤點腳本：
      1. `scripts/ci/report-legacy-aliases.js`
      2. `npm run report:legacy-aliases`
      3. `npm run report:legacy-aliases:check`
   2. 產生基線報告：`docs/legacy-alias-inventory.md`
   3. 腳本排除自我掃描（`docs/legacy-alias-inventory.md`），避免報告遞迴膨脹
   4. 變更檔案：
      1. `scripts/ci/report-legacy-aliases.js`
      2. `package.json`
      3. `docs/legacy-alias-inventory.md`
18. 2026-04-11 / Phase F（Part 4，尚未達 CP6 gate）
   1. Runtime env 參數改為中性名稱優先（保留 legacy fallback）：
      1. `PATCH_PAGE_TIMEOUT_MS`（legacy: `MORPHE_PAGE_TIMEOUT_MS`）
      2. `PATCH_DOWNLOAD_TIMEOUT_MS`（legacy: `MORPHE_DOWNLOAD_TIMEOUT_MS`）
      3. `PATCH_HTTP_CACHE_TTL_MS`（legacy: `MORPHE_HTTP_CACHE_TTL_MS`）
   2. Runtime 接上 legacy warning 機制（同 alias pair 僅提示一次）
   3. 新增測試覆蓋 runtime env alias 的新鍵優先、舊鍵 fallback 與 warning once
   4. `createRuntime` call sites 傳入 warning logger（CLI / Desktop）
   5. 更新 README / CLI 文件
   6. 變更檔案：
      1. `utils/runtime.js`
      2. `tests/env-aliases.test.js`
      3. `README.md`
      4. `README.zh-TW.md`
      5. `docs/cli.md`
      6. `main.js`
      7. `desktop/ipc/task-service.js`
19. 2026-04-11 / Phase F（Part 5，尚未達 CP6 gate）
   1. CI release check scripts 改為中性 env key 優先：
      1. `PATCH_CLI_REPO`（legacy fallback: `MORPHE_CLI_REPO`）
   2. 套用 legacy env deprecation warning（CI scripts）
   3. GitHub workflows 改為傳入 `PATCH_CLI_REPO`
   4. 重新產生 legacy alias inventory（`Total hits` 下降）
   5. 變更檔案：
      1. `scripts/ci/check-channel-release.js`
      2. `scripts/ci/check-release-exists.js`
      3. `.github/workflows/release.yml`
      4. `.github/workflows/scheduled-build.yml`
      5. `docs/legacy-alias-inventory.md`
20. 2026-04-11 / Phase F（Part 6，尚未達 CP6 gate）
   1. CI build workflows keystore env key 改為中性名稱：
      1. `PATCH_KEYSTORE_BASE64`（由 `secrets.PATCH_KEYSTORE_BASE64` 優先，fallback `secrets.MORPHE_KEYSTORE_BASE64`）
   2. 重新產生 legacy alias inventory（`Total hits` 再下降）
   3. 變更檔案：
      1. `.github/workflows/release.yml`
      2. `.github/workflows/scheduled-build.yml`
      3. `docs/legacy-alias-inventory.md`
21. 2026-04-11 / Phase F（Part 7，尚未達 CP6 gate）
   1. 前端 config model 新增 engine source section alias：
      1. `patchCli`（與 `morpheCli` 並存）
   2. `updateConfigSection` 對 `morpheCli/patchCli` 做雙向同步，避免狀態分裂
   3. 高頻讀取點改為新鍵優先（`patchCli` > `morpheCli`）
   4. 重新產生 legacy alias inventory（`Total hits` 再下降）
   5. 變更檔案：
      1. `desktop/web/src/lib/app-config.js`
      2. `desktop/web/src/hooks/useAppController.js`
      3. `desktop/web/src/hooks/useConfigLifecycle.js`
      4. `desktop/web/src/pages/BuildPage/hooks/useBuildSourceSelectors.js`
      5. `desktop/web/src/pages/BuildPage/hooks/useAppPatchSettingsState.js`
      6. `desktop/web/src/pages/AssetsPage/components/MorpheSettingsDialog.jsx`
      7. `docs/legacy-alias-inventory.md`
22. 2026-04-11 / Phase F（Part 8，尚未達 CP6 gate）
   1. `useSourceAssetsState` 改為 `patchCli` 優先（讀取與寫入）
   2. `useBuildSourceSelectors` 的 engine source 寫入改為 `patchCli`
   3. 保留舊鍵 fallback（`patchCli` 不存在時讀 `morpheCli`）
   4. 重新產生 legacy alias inventory（`Total hits` 再下降）
   5. 變更檔案：
      1. `desktop/web/src/pages/AssetsPage/hooks/useSourceAssetsState.js`
      2. `desktop/web/src/pages/BuildPage/hooks/useBuildSourceSelectors.js`
      3. `docs/legacy-alias-inventory.md`
23. 2026-04-11 / Phase F（Part 9，尚未達 CP6 gate）
   1. `MorpheSettingsDialog` 寫入改為 `patchCli`
   2. 相關資產/建置 source selector 鏈路完成 `patchCli` 寫入對齊
   3. 重新產生 legacy alias inventory（`Total hits` 再下降）
   4. 變更檔案：
      1. `desktop/web/src/pages/AssetsPage/components/MorpheSettingsDialog.jsx`
      2. `docs/legacy-alias-inventory.md`
24. 2026-04-11 / Phase F（Part 10，尚未達 CP6 gate）
   1. `useBuildSourceSelectors` 內部命名改為中性（engine*）
   2. `useAppController` build props 以中性 selector 為主，legacy selector 由 alias 映射
   3. 對外 props 仍保留 legacy 欄位，避免破壞相容
   4. 重新產生 legacy alias inventory（維持低風險漸進式）
   5. 變更檔案：
      1. `desktop/web/src/pages/BuildPage/hooks/useBuildSourceSelectors.js`
      2. `desktop/web/src/hooks/useAppController.js`
      3. `docs/legacy-alias-inventory.md`
25. 2026-04-11 / Phase F（Part 11，尚未達 CP6 gate）
   1. `useConfigLifecycle` 參數新增中性 alias：
      1. `setEngineSourceRepoOptions`
      2. `defaultEngineSourceRepo`
   2. hook 內部改用中性名稱，保留舊參數 fallback
   3. `useAppController` callsite 傳入新參數（舊參數仍保留）
   4. 重新產生 legacy alias inventory（穩定）
   5. 變更檔案：
      1. `desktop/web/src/hooks/useConfigLifecycle.js`
      2. `desktop/web/src/hooks/useAppController.js`
      3. `docs/legacy-alias-inventory.md`
26. 2026-04-11 / Phase F（Part 12，尚未達 CP6 gate）
   1. `app-config` 切換使用中性常數：
      1. `DEFAULT_ENGINE_SOURCE_REPO`
   2. `useAppController` 切換 engine source 常數引用：
      1. `ENGINE_REMOTE_STABLE_VALUE / ENGINE_REMOTE_DEV_VALUE`
      2. `DEFAULT_ENGINE_SOURCE_REPO`
      3. legacy storage key 僅保留 fallback（`LEGACY_MORPHE_SOURCE_REPOS_KEY`）
   3. 重新產生 legacy alias inventory（`Total hits` 明顯下降）
   4. 變更檔案：
      1. `desktop/web/src/lib/app-config.js`
      2. `desktop/web/src/hooks/useAppController.js`
      3. `docs/legacy-alias-inventory.md`
27. 2026-04-11 / Phase F（Part 13，尚未達 CP6 gate）
   1. `app-constants` 主從關係重排：
      1. 中性常數作為主定義
      2. `MORPHE_* / PATCHES_*` 常數保留為 alias（含 legacy token 相容）
   2. 保留 legacy persisted key 常數，避免既有 localStorage/key 行為改變
   3. 重新產生 legacy alias inventory（`Total hits` 再下降）
   4. 變更檔案：
      1. `desktop/web/src/lib/app-constants.js`
      2. `docs/legacy-alias-inventory.md`
28. 2026-04-11 / Phase F（Part 14，尚未達 CP6 gate）
   1. `useAppController` 內部依賴改為 `engine / patchBundle` 主路徑
   2. legacy props 由 alias 映射輸出（不影響現有頁面介面）
   3. confirm action 對 source file 刪除改走 `onDeleteEngineFile / onDeletePatchBundleFile`
   4. 重新產生 legacy alias inventory（維持穩定）
   5. 變更檔案：
      1. `desktop/web/src/hooks/useAppController.js`
      2. `docs/legacy-alias-inventory.md`
29. 2026-04-11 / Phase F（Part 15，尚未達 CP6 gate）
   1. `app-config` 內部變數命名改為中性詞彙：
      1. engine source（原 `morphe*`）
      2. patch bundle（原 `patches*` 部分內部命名對齊）
   2. TOML 相容行為不變（仍讀寫 `[morphe-cli]` / `[patches]` 及舊鍵）
   3. 重新產生 legacy alias inventory（`Total hits` 再下降）
   4. 變更檔案：
      1. `desktop/web/src/lib/app-config.js`
      2. `docs/legacy-alias-inventory.md`
30. 2026-04-11 / Phase F（Part 16，尚未達 CP6 gate）
   1. `useAppController` 回傳 props 區塊去重：
      1. build selector legacy alias 抽成共用物件
      2. assets legacy alias 抽成共用物件
      3. engine/patch-bundle settings dialog props 抽成 shared props
   2. 內部行為不變，外部 props 介面保持相容
   3. 重新產生 legacy alias inventory（保持穩定）
   4. 變更檔案：
      1. `desktop/web/src/hooks/useAppController.js`
      2. `docs/legacy-alias-inventory.md`
31. 2026-04-11 / Phase F（Part 17，尚未達 CP6 gate）
   1. `AssetsPage/index.jsx` 來源模型收斂：
      1. `engineSourceModel`
      2. `patchBundleSourceModel`
   2. 移除大量 `currentMorphe*/currentPatches*` 過渡變數，改由 model 統一映射
   3. 行為不變（仍保留 legacy props 相容輸入）
   4. 重新產生 legacy alias inventory（穩定）
   5. 變更檔案：
      1. `desktop/web/src/pages/AssetsPage/index.jsx`
      2. `docs/legacy-alias-inventory.md`
32. 2026-04-11 / Phase F（Part 18，尚未達 CP6 gate）
   1. Assets/Build dialog 與 hook 內部命名清理（維持外部 API 相容）：
      1. `MorpheSettingsDialog` 內部改為 `engine*` 變數
      2. `PatchesSettingsDialog` 內部改為 `patchBundle*` 變數
      3. `useAppPatchSettingsState` cache key 內部改為 `patchCliCfg`
   2. CI release metadata 改為 `patchCli` 主欄位，`morpheCli` 僅保留相容：
      1. merge/build/reuse/release-notes 腳本同步讀寫中性欄位優先
   3. 驗證：
      1. `npm run test:providers` pass
      2. `npm run test:patch-naming` pass
      3. `npm run report:legacy-aliases` → `Total hits: 143`（由 148 下降）
   4. 變更檔案：
      1. `desktop/web/src/pages/AssetsPage/components/MorpheSettingsDialog.jsx`
      2. `desktop/web/src/pages/AssetsPage/components/PatchesSettingsDialog.jsx`
      3. `desktop/web/src/pages/BuildPage/hooks/useAppPatchSettingsState.js`
      4. `scripts/ci/merge-channel-metadata.js`
      5. `scripts/ci/build-channel.js`
      6. `scripts/ci/reuse-channel-assets.js`
      7. `scripts/ci/generate-release-notes.js`
      8. `docs/legacy-alias-inventory.md`
33. 2026-04-11 / Phase F（Part 19，尚未達 CP6 gate）
   1. 執行路徑改為新鍵單一路徑（移除 runtime 相容 fallback）：
      1. config section：`[engine]`（不再讀 `[morphe-cli]` / `morphe_cli`）
      2. source type：`engine-cli`（不再使用 `morphe-cli`）
      3. workspace source folder：`engine-cli/`
      4. env keys：`PATCH_*`（provider/workspace/runtime/signing/CI 不再讀 `MORPHE_*`）
   2. CI metadata 改為只輸出/讀取 `patchCli`（移除 `morpheCli` fallback）
   3. 前端儲存路徑改為單 key（移除 localStorage legacy key fallback 寫讀）
   4. 驗證：
      1. `npm run test:providers` pass
      2. `npm run test:env-aliases` pass
      3. `npm run test:patch-naming` pass
      4. `npm run report:legacy-aliases` → `Total hits: 54`
   5. 變更檔案：
      1. `main.js`
      2. `desktop/ipc/task-service.js`
      3. `desktop/ipc/cli-connector.js`
      4. `utils/workspace.js`
      5. `utils/runtime.js`
      6. `utils/signing.js`
      7. `providers/index.js`
      8. `scripts/morphe-cli.js`
      9. `scripts/ci/check-channel-release.js`
      10. `scripts/ci/check-release-exists.js`
      11. `scripts/ci/merge-channel-metadata.js`
      12. `scripts/ci/build-channel.js`
      13. `scripts/ci/reuse-channel-assets.js`
      14. `scripts/ci/generate-release-notes.js`
      15. `desktop/web/src/lib/app-config.js`
      16. `desktop/web/src/lib/app-constants.js`
      17. `desktop/web/src/hooks/useAppController.js`
      18. `desktop/web/src/hooks/useConfigLifecycle.js`
      19. `desktop/web/src/pages/AssetsPage/hooks/useSourceAssetsState.js`
      20. `desktop/web/src/pages/AssetsPage/index.jsx`
      21. `desktop/web/src/pages/AssetsPage/utils/assetsPageUtils.js`
      22. `desktop/web/src/pages/BuildPage/utils/buildProgressUtils.js`
      23. `desktop/web/i18n/locales/en.json`
      24. `desktop/web/i18n/locales/zh-TW.json`
      25. `desktop/web/src/main.jsx`
      26. `tests/providers.test.js`
      27. `tests/env-aliases.test.js`
      28. `docs/legacy-alias-inventory.md`
34. 2026-04-11 / Phase F（Part 20，尚未達 CP6 gate）
   1. 刪除/替換舊檔：
      1. `scripts/morphe-cli.js` → `scripts/engine-cli.js`
      2. `providers/morphe.js` → `providers/engine-provider.js`
      3. 刪除未使用舊文件：`morphe-cli.md`
   2. Desktop IPC bridge 命名切換：
      1. `window.morpheDesktop` → `window.patcherDesktop`
      2. IPC channel：`morphe:invoke` → `patcher:invoke`
   3. CLI-only 模式命名切換：
      1. `--morphe-cli` / `morpheCliOnly` → `--engine-cli` / `engineCliOnly`
      2. 同步 main / IPC handlers / task-service / app-tasks / cli-connector
   4. 殘留掃描：
      1. `npm run report:legacy-aliases` 重新產生
      2. `Total hits: 53`
   5. 驗證：
      1. `node --check`（preload/constants/ipcClient/engine-provider/engine-cli/handlers）pass
      2. `npm run test:providers` pass
   6. 變更檔案：
      1. `scripts/engine-cli.js`
      2. `providers/engine-provider.js`
      3. `providers/index.js`
      4. `desktop/preload.js`
      5. `desktop/ipc/constants.js`
      6. `desktop/web/src/lib/ipcClient.js`
      7. `utils/cli.js`
      8. `main.js`
      9. `desktop/ipc/cli-connector.js`
      10. `desktop/ipc/task-service.js`
      11. `desktop/ipc/handlers.js`
      12. `desktop/web/src/lib/app-tasks.js`
      13. `docs/desktop.md`
      14. `docs/legacy-alias-inventory.md`
      15. `morphe-cli.md`（deleted）
35. 2026-04-11 / Phase F（Part 21，尚未達 CP6 gate）
   1. 新增 GUI 預設 repo 資料檔：
      1. `desktop/web/data/source-repo-defaults.json`
      2. 集中管理 `engine / patchBundle / microg` 預設 repo
   2. 前端改為由資料檔讀取預設值：
      1. `app-constants` 匯入 JSON 並導出 `DEFAULT_*_SOURCE_REPO`
      2. Assets/Mircrog/Build selector 不再硬編碼 repo 字串
   3. 變更檔案：
      1. `desktop/web/data/source-repo-defaults.json`
      2. `desktop/web/src/lib/app-constants.js`
      3. `desktop/web/src/pages/AssetsPage/index.jsx`
      4. `desktop/web/src/pages/MircrogPage/index.jsx`
      5. `desktop/web/src/pages/BuildPage/hooks/useBuildSourceSelectors.js`

## 1. 原則

1. 不做一次性大改名；先建立相容層，再逐步替換。
2. 每階段都可獨立發版、可回滾。
3. 舊行為優先穩定：舊 config、舊 IPC、舊 localStorage key 先持續支援。
4. 每階段都有可驗收檢查點（checkpoint gate）。

## 2. 範圍與非範圍

### 範圍

1. 命名中性化（morphe -> engine/provider/source）。
2. IPC 與設定模型建立相容層。
3. 執行管線 provider 化（先包一層，後續可插拔）。

### 非範圍（本次不做）

1. 一次性刪除全部舊名稱。
2. 直接切換現有預設 engine 行為。
3. 一次併入所有新補丁引擎實作。

## 3. 分階段計畫

## Phase A - 中性名詞模型與別名常數（零行為變更）

### 目標

1. 建立中性語彙：`engine`, `provider`, `artifact source`, `bundle`。
2. 先保留舊常數，新增新常數別名。

### 主要變更

1. `desktop/web/src/lib/app-constants.js` 新增中性 key 常數。
2. 舊常數保留（標記 `@deprecated` 註解）。

### 驗收

1. 功能完全不變。
2. 無 UI/IPC 行為差異。

### 回滾

1. 直接移除新增別名常數，不影響既有流程。

---

## Phase B - IPC 相容層（雙方法名）

### 目標

1. 新增中性 IPC 方法名（例如 `fetchEngineVersions`）。
2. 舊方法名繼續可用，指向同一實作。

### 主要變更

1. `desktop/ipc/handlers.js`：新舊 method mapping。
2. `desktop/web/src/lib/ipcClient.js`：新增中性 client API。

### 驗收

1. 舊前端不改也可運作。
2. 新 API 可由 smoke test 呼叫成功。

### 回滾

1. 保留舊 method，移除新 method mapping。

---

## Phase C - Config / Storage 雙讀雙寫

### 目標

1. 舊 `toml` key 可讀；新 key 同步寫入。
2. localStorage key 雙讀雙寫，確保升級無痛。

### 主要變更

1. `desktop/web/src/lib/app-config.js`
2. `desktop/web/src/hooks/*`（repo key、source key）
3. `docs/toml.md` 補 migration 說明。

### 驗收

1. 使用舊 config 啟動成功。
2. 保存後新舊 key 都存在且可讀。

### 回滾

1. 停止新 key 寫入，保留舊 key 邏輯。

---

## Phase D - UI 內部命名遷移

### 目標

1. 將 hook/state/function 名稱換成中性命名。
2. 對外 props 先保持相容（必要時加 mapping）。

### 主要變更

1. `desktop/web/src/hooks/useAppController.js`
2. `desktop/web/src/pages/*`

### 驗收

1. UI 功能一致（build/assets/history/microg 等頁面）。
2. 無 runtime error。

### 回滾

1. 透過 mapping 層恢復舊 props key。

---

## Phase E - 執行管線 Provider 化

### 目標

1. 將 patch 執行流程抽象成 provider interface。
2. 先提供 `MorpheProvider` 實作，行為不變。

### 主要變更

1. `main.js` / `desktop/ipc/task-service.js` 抽離 provider 呼叫。
2. 新增 `providers/` 模組（例如 `providers/morphe.js`）。

### 驗收

1. 現有任務流程與輸出一致。
2. provider 切換機制可擴充（至少能註冊第二 provider stub）。

### 回滾

1. `main.js` 直接回退到舊直接呼叫路徑。

---

## Phase F - 棄用清理與文件收斂

### 目標

1. 移除過渡相容層（需至少 1~2 個版本觀察）。
2. 更新所有文件與測試基線。

### 主要變更

1. 刪除 `@deprecated` 常數與舊 API alias。
2. `README*`, `docs/*` 更新。

### 驗收

1. 無舊名稱依賴。
2. 測試全綠。

### 回滾

1. 回補 alias 層（保留一版 emergency patch 分支）。

## 4. Checkpoints (Gate)

## CP0 - Baseline Freeze

1. 建立基線標籤（建議 git tag：`pre-engine-neutral`）。
2. 收斂目前已知問題清單。
3. 建立 smoke test 腳本（啟動任務、下載 source、讀歷史）。

Gate:

1. 基線可重現，且 smoke test 可執行。

## CP1 - Phase A 完成

Gate:

1. 編譯/啟動成功。
2. 行為 0 差異。

## CP2 - Phase B 完成

Gate:

1. 新舊 IPC 方法都能成功回應。
2. E2E 不回歸。

## CP3 - Phase C 完成

Gate:

1. 舊 config 與舊 localStorage 在升級後可正常運行。
2. 雙讀雙寫驗證通過。

## CP4 - Phase D 完成

Gate:

1. UI 流程與核心互動無破壞。
2. 無命名遺漏導致 undefined。

## CP5 - Phase E 完成

Gate:

1. Provider 抽象落地，MorpheProvider 行為對齊舊版。
2. 可註冊第二 provider（stub）且不影響現有流程。

## CP6 - Phase F 完成

Gate:

1. 舊 alias 移除後全測試通過。
2. 文件與代碼一致。

## 5. 建議 PR 切分

1. PR-1: Phase A + 基礎測試調整（小）
2. PR-2: Phase B（小）
3. PR-3: Phase C（中）
4. PR-4: Phase D（中）
5. PR-5: Phase E（中偏大）
6. PR-6: Phase F（小）

## 6. 風險控制

1. 每階段保留 feature flag：`ENABLE_ENGINE_NEUTRAL_API`（預設關閉或僅內部開）。
2. 保留 rollback 分支：`hotfix/legacy-morphe-alias`。
3. 每階段上線前跑 smoke + 最小回歸：
   1. 啟動/停止任務
   2. source 版本拉取與下載
   3. 任務歷史與產物讀取
   4. 設定檔讀寫

## 7. 執行順序建議（本週）

1. 先做 CP0 / CP1（最低風險）
2. 接著 CP2（打通新舊 API）
3. 最後再進 CP3（資料相容層）

---

如果要直接開始，我建議下一步從 **Phase A (PR-1)** 著手：先新增中性常數與 alias，不動任何 runtime 行為。
