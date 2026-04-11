import defaultPackageMetaMap from "../data/package-name-meta.json"
import sourceRepoDefaults from "../../data/source-repo-defaults.json"

export const DEFAULT_PACKAGE_META_MAP =
  defaultPackageMetaMap && typeof defaultPackageMetaMap === "object" ? defaultPackageMetaMap : {}

export const RESERVED_SECTIONS = new Set([
  "global",
  "engine",
  "patches",
  "patch-bundle",
  "patch_bundle",
  "signing",
  "sign",
])

export const LIVE_BUILD_TASK_ID_KEY = "morphe.liveBuildTaskId"
export const ENGINE_SOURCE_REPOS_KEY = "engine.source.repos"
export const PATCH_BUNDLE_SOURCE_REPOS_KEY = "patch-bundle.source.repos"
export const SIGNING_SELECTED_KEYSTORE_PATH_KEY = "signing.keystore.path"
export const MICROG_SOURCE_REPOS_KEY = "microg.source.repos"

const SOURCE_REPO_DEFAULTS = sourceRepoDefaults && typeof sourceRepoDefaults === "object" ? sourceRepoDefaults : {}
export const DEFAULT_ENGINE_SOURCE_REPO = String(SOURCE_REPO_DEFAULTS?.engine?.defaultRepo || "MorpheApp/morphe-cli").trim()
export const DEFAULT_PATCH_BUNDLE_SOURCE_REPO = String(SOURCE_REPO_DEFAULTS?.patchBundle?.defaultRepo || "MorpheApp/morphe-patches").trim()
export const DEFAULT_MICROG_SOURCE_REPO = String(SOURCE_REPO_DEFAULTS?.microg?.defaultRepo || "MorpheApp/MicroG-RE").trim()
export const APP_VER_AUTO_VALUE = "__APP_AUTO__"

export const ENGINE_REMOTE_STABLE_VALUE = "__ENGINE_REMOTE_STABLE__"
export const ENGINE_REMOTE_DEV_VALUE = "__ENGINE_REMOTE_DEV__"
export const PATCH_BUNDLE_REMOTE_STABLE_VALUE = "__PATCHES_REMOTE_STABLE__"
export const PATCH_BUNDLE_REMOTE_DEV_VALUE = "__PATCHES_REMOTE_DEV__"

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
