import defaultPackageMetaMap from "../data/package-name-meta.json"

export const DEFAULT_PACKAGE_META_MAP =
  defaultPackageMetaMap && typeof defaultPackageMetaMap === "object" ? defaultPackageMetaMap : {}

export const RESERVED_SECTIONS = new Set([
  "global",
  "morphe-cli",
  "morphe_cli",
  "patches",
  "signing",
  "sign",
])

export const LIVE_BUILD_TASK_ID_KEY = "morphe.liveBuildTaskId"
export const MORPHE_SOURCE_REPOS_KEY = "morphe.source.repos"
export const PATCHES_SOURCE_REPOS_KEY = "patches.source.repos"
export const MICROG_SOURCE_REPOS_KEY = "microg.source.repos"
export const KEYSTORE_SELECTED_PATH_KEY = "morphe.signing.keystore.path"
export const DEFAULT_MORPHE_SOURCE_REPO = "MorpheApp/morphe-cli"
export const DEFAULT_PATCHES_SOURCE_REPO = "MorpheApp/morphe-patches"
export const DEFAULT_MICROG_SOURCE_REPO = "MorpheApp/MicroG-RE"
export const APP_VER_AUTO_VALUE = "__APP_AUTO__"
export const MORPHE_REMOTE_STABLE_VALUE = "__MORPHE_REMOTE_STABLE__"
export const MORPHE_REMOTE_DEV_VALUE = "__MORPHE_REMOTE_DEV__"
export const PATCHES_REMOTE_STABLE_VALUE = "__PATCHES_REMOTE_STABLE__"
export const PATCHES_REMOTE_DEV_VALUE = "__PATCHES_REMOTE_DEV__"

export const PACKAGE_NAME_LABELS = Object.fromEntries(
  Object.entries(defaultPackageMetaMap || {}).map(([packageName, meta]) => [
    String(packageName || "").trim().toLowerCase(),
    String(meta?.label || "").trim(),
  ])
)

export const PACKAGE_NAME_ICON_FALLBACKS = Object.fromEntries(
  Object.entries(defaultPackageMetaMap || {}).map(([packageName, meta]) => [
    String(packageName || "").trim().toLowerCase(),
    String(meta?.icon || "").trim(),
  ])
)
