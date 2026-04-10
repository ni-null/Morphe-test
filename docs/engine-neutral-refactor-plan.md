# Engine-Neutral Refactor Plan (Phased + Checkpoints)

Last updated: 2026-04-11  
Goal: 將專案從 `morphe` 專用命名與耦合，逐步演進成可支援多種補丁引擎（不一次性破壞現有功能）。

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
