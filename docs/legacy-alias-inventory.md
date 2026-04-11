# Legacy Alias Inventory

Generated at: 2026-04-11T03:58:21.366Z
Repo root: `.`
Total hits: **53**

## Summary

| Pattern | Type | Total Matches | Files |
| --- | --- | ---: | ---: |
| `MORPHE_* (any env-style token)` | env | 43 | 9 |
| `morpheCli` | identifier | 7 | 2 |
| `morphe_cli` | identifier | 2 | 2 |
| `"morphe-cli"` | identifier | 1 | 1 |

## Details

### `MORPHE_* (any env-style token)`

- `docs/engine-neutral-refactor-plan.md` (11)
  - L104: 3. provider 選擇改為中性環境變數優先（`PATCH_PROVIDER`），並保留 legacy fallback（`MORPHE_PATCH_PROVIDER`）
  - L142: 2. env provider 解析優先序（`PATCH_PROVIDER` > `MORPHE_PATCH_PROVIDER`）
  - L155: 1. `PATCH_WORKSPACE`（legacy: `MORPHE_WORKSPACE`）
  - L156: 2. `PATCH_KEYSTORE_PATH`（legacy: `MORPHE_KEYSTORE_PATH`）
  - L157: 3. `PATCH_KEYSTORE_BASE64`（legacy: `MORPHE_KEYSTORE_BASE64`）
  - L158: 4. `PATCH_PORTABLE`（legacy: `MORPHE_PORTABLE`）
  - L205: 1. `PATCH_PAGE_TIMEOUT_MS`（legacy: `MORPHE_PAGE_TIMEOUT_MS`）
  - L206: 2. `PATCH_DOWNLOAD_TIMEOUT_MS`（legacy: `MORPHE_DOWNLOAD_TIMEOUT_MS`）
  - L207: 3. `PATCH_HTTP_CACHE_TTL_MS`（legacy: `MORPHE_HTTP_CACHE_TTL_MS`）
  - L222: 1. `PATCH_CLI_REPO`（legacy fallback: `MORPHE_CLI_REPO`）
- `tests/env-aliases.test.js` (11)
  - L51: { PATCH_WORKSPACE: "/new", MORPHE_WORKSPACE: "/old" },
  - L53: ["MORPHE_WORKSPACE"],
  - L62: { MORPHE_WORKSPACE: "/old" },
  - L64: ["MORPHE_WORKSPACE"],
  - L67: assert.strictEqual(resolution.sourceKey, "MORPHE_WORKSPACE");
  - L73: { MORPHE_KEYSTORE_PATH: "/tmp/legacy.keystore" },
  - L75: ["MORPHE_KEYSTORE_PATH"],
  - L150: MORPHE_PAGE_TIMEOUT_MS: "23456",
  - L151: MORPHE_DOWNLOAD_TIMEOUT_MS: "456789",
  - L152: MORPHE_HTTP_CACHE_TTL_MS: "34567",
- `desktop/web/src/lib/app-constants.js` (6)
  - L22: export const MORPHE_SOURCE_REPOS_KEY = "morphe.source.repos"
  - L40: export const MORPHE_REMOTE_STABLE_VALUE = ENGINE_REMOTE_STABLE_VALUE
  - L41: export const MORPHE_REMOTE_DEV_VALUE = ENGINE_REMOTE_DEV_VALUE
  - L47: export const LEGACY_MORPHE_SOURCE_REPOS_KEY = MORPHE_SOURCE_REPOS_KEY
  - L51: export const LEGACY_MORPHE_REMOTE_STABLE_VALUE = MORPHE_REMOTE_STABLE_VALUE
  - L53: export const LEGACY_MORPHE_REMOTE_DEV_VALUE = MORPHE_REMOTE_DEV_VALUE
- `docs/cli.md` (5)
  - L67: 1. 環境變數 `PATCH_KEYSTORE_PATH`（舊版相容：`MORPHE_KEYSTORE_PATH`）
  - L69: 3. `PATCH_KEYSTORE_BASE64`（舊版相容：`MORPHE_KEYSTORE_BASE64`，會產生暫存 keystore）
  - L78: 1. `PATCH_PAGE_TIMEOUT_MS`（舊版相容：`MORPHE_PAGE_TIMEOUT_MS`）
  - L79: 2. `PATCH_DOWNLOAD_TIMEOUT_MS`（舊版相容：`MORPHE_DOWNLOAD_TIMEOUT_MS`）
  - L80: 3. `PATCH_HTTP_CACHE_TTL_MS`（舊版相容：`MORPHE_HTTP_CACHE_TTL_MS`）
- `README.md` (3)
  - L37: - Override workspace: `--workspace <path>` or `PATCH_WORKSPACE=/path` (legacy: `MORPHE_WORKSPACE`)
  - L128: - `MORPHE_KEYSTORE_BASE64`
  - L129: 4. If `MORPHE_KEYSTORE_BASE64` is not set, workflows will use `morphe-test.keystore` in the repository.
- `README.zh-TW.md` (3)
  - L37: - 可用 `--workspace <path>` 或 `PATCH_WORKSPACE` 覆寫 workspace（舊版相容：`MORPHE_WORKSPACE`）
  - L128: - `MORPHE_KEYSTORE_BASE64`
  - L129: 4. 如果沒設定 `MORPHE_KEYSTORE_BASE64`，workflow 會自動使用倉庫內的 `morphe-test.keystore`。
- `tests/providers.test.js` (2)
  - L40: const env = { PATCH_PROVIDER: "stub", MORPHE_PATCH_PROVIDER: "morphe" };
  - L45: const env = { MORPHE_PATCH_PROVIDER: "stub" };
- `.github/workflows/release.yml` (1)
  - L122: PATCH_KEYSTORE_BASE64: ${{ secrets.PATCH_KEYSTORE_BASE64 || secrets.MORPHE_KEYSTORE_BASE64 }}
- `.github/workflows/scheduled-build.yml` (1)
  - L117: PATCH_KEYSTORE_BASE64: ${{ secrets.PATCH_KEYSTORE_BASE64 || secrets.MORPHE_KEYSTORE_BASE64 }}

### `morpheCli`

- `docs/engine-neutral-refactor-plan.md` (6)
  - L242: 1. `patchCli`（與 `morpheCli` 並存）
  - L243: 2. `updateConfigSection` 對 `morpheCli/patchCli` 做雙向同步，避免狀態分裂
  - L244: 3. 高頻讀取點改為新鍵優先（`patchCli` > `morpheCli`）
  - L257: 3. 保留舊鍵 fallback（`patchCli` 不存在時讀 `morpheCli`）
  - L353: 2. CI release metadata 改為 `patchCli` 主欄位，`morpheCli` 僅保留相容：
  - L374: 2. CI metadata 改為只輸出/讀取 `patchCli`（移除 `morpheCli` fallback）
- `scripts/ci/report-legacy-aliases.js` (1)
  - L24: { key: "morpheCli", type: "identifier", regex: /\bmorpheCli\b/gu },

### `morphe_cli`

- `docs/engine-neutral-refactor-plan.md` (1)
  - L370: 1. config section：`[engine]`（不再讀 `[morphe-cli]` / `morphe_cli`）
- `scripts/ci/report-legacy-aliases.js` (1)
  - L23: { key: "morphe_cli", type: "identifier", regex: /\bmorphe_cli\b/gu },

### `"morphe-cli"`

- `scripts/ci/report-legacy-aliases.js` (1)
  - L22: { key: "\"morphe-cli\"", type: "identifier", regex: /"morphe-cli"/gu },

## Notes

- This report is for staged cleanup planning; it does not enforce failures by default.
- Use `node ./scripts/ci/report-legacy-aliases.js --fail-on-hits` to fail CI when any legacy alias remains.

