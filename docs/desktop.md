# Desktop Architecture (CLI Core + IPC)

## Goal
- Keep CLI (`main.js`) as the single execution core.
- Desktop UI is an optional shell built with Electron + React.
- Remove standalone `web-api` HTTP server and use IPC only.

## Components
- `main.js`: CLI entry and full patch pipeline.
- `desktop/main.js`: Electron app bootstrap.
- `desktop/preload.js`: secure bridge (`contextBridge`) for renderer.
- `desktop/ipc/handlers.js`: IPC router and app service operations.
- `desktop/ipc/task-service.js`: task/state layer (spawn CLI, history, logs, cache, sources).
- `desktop/web/`: React renderer UI (loaded by Electron).

## Communication
- Renderer calls `window.morpheDesktop.invoke(method, payload)`.
- Electron main handles `morphe:invoke` via `ipcMain.handle`.
- No localhost port, no Express process, no HTTP polling mismatch from process split.

## Task Flow
1. UI sends `startTask` through IPC.
2. Desktop service spawns `node main.js ...` child process.
3. Service keeps live task state in memory and persists task artifacts/logs in workspace.
4. UI polls `listTasks`/`fetchTaskLog` via IPC.

## Config / Signing in Desktop
- Desktop 預設設定檔為 `<workspace>/toml/default.toml`。
- GUI 選擇 keystore 後，會同步寫入 TOML 的 `[signing].keystore_path`。
- 啟動任務時，Desktop 仍會以環境變數 `MORPHE_KEYSTORE_PATH` 傳入目前選擇值，確保本次任務與 UI 一致。

## Dev / Build Commands
- `npm run web:ui`: start Vite renderer only.
- `npm run web:build`: build renderer.
- `npm run desktop:dev`: start Vite + Electron (IPC mode).
- `npm run desktop:start`: build renderer then run Electron.
- `npm run desktop:pack`: package desktop app.
