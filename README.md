# Morphe Auto APK Patch (Windows)

This project automates:
- reading `config.toml`
- resolving APK source (provider, URL, or local file)
- resolving patch file (`.mpp`) and compatible versions
- running `morphe-cli.jar` patch flow

## Fixed Paths (Not Configurable)
These are now fixed defaults inside code:
- Morphe CLI jars: `./morphe-cli/<original-release-name>.jar`
- Download dir: `./downloads`
- Output dir: `./output`

`config.toml` no longer needs `morphe_jar`, `download_dir`, `output_dir`.

## config.toml Example
```toml
[global]
patches = "./patches/youtube.mpp"

[morphe-cli]
patches_repo = "MorpheApp/morphe-cli"
# ver = "morphe-cli-1.6.3-all.jar" # optional: lock morphe-cli jar filename

[patches]
patches_repo = "MorpheApp/morphe-patches"
mode = "stable" # stable | dev
# ver = "patches-1.23.0-dev.1.mpp" # optional: lock patch filename

[youtube]
apk = "local" # apkmirror / uptodown / URL / local
# ver = "20.45.36"
# package_name = "com.google.android.youtube"
# local_apk = "./source-apk/youtube.apk"
```

Reserved section names (not app targets): `global`, `patches`, `morphe-cli`, `morphe_cli`.

## Morphe CLI JAR Auto Fetch
- Auto fetch latest JAR from GitHub Releases repo defined in `[morphe-cli].patches_repo`
- Save under `./morphe-cli` with original asset filename, e.g. `morphe-cli-1.6.3-all.jar`
- If same filename already exists locally, download is skipped (unless `--force`)
- Set `[morphe-cli].ver` to lock a specific jar filename (if local file exists, skip download)

## Patch Mode (`[patches]`)
- `mode = "stable"`: pick `.mpp` asset where name/tag does not include `dev`
- `mode = "dev"`: pick `.mpp` asset where name/tag includes `dev`

When auto-fetching patch bundle, file is saved with original asset name, for example:
- `./patches/patches-1.23.0-dev.1.mpp`
- Set `[patches].ver` to lock a specific patch filename (if local file exists, skip download)

## `apk` Field Modes
- `apk = "apkmirror"`: use ApkMirror provider
- `apk = "uptodown"`: use Uptodown provider
- `apk = "https://..."`: provider base URL or direct APK URL
- `apk = "local"`: skip download and use local APK

Local mode:
- default path: `./source-apk/<section>.apk`
- override path: `local_apk = "./source-apk/youtube.apk"`

## Version Rules
- If `ver` is set: strict version only, not found => fail
- If `ver` is empty: read compatible versions from patch file and try newest to oldest

## Temporary Folder Cleanup
After each patch run, temporary folder is deleted automatically:
- `<output>/<app>/<apkBase>-patched-temporary-files`

This includes cases where patch process ends with error.

## Patched APK Naming
- Patched APK will be renamed to:
- `morphe-<app>-<apk-version>-<patch-file-name-without-.mpp>.apk`
- Example:
- `morphe-youtube-20.12.46-patches-1.23.0-dev.1.apk`

## Signing Keystore
- Local test mode:
- if no env override is set, use `./morphe-test.keystore`
- if file is missing, patch flow will stop and ask you to provide the file
- CI mode (recommended):
- inject keystore via env/secrets `MORPHE_KEYSTORE_BASE64`
- optional secrets: `MORPHE_KEYSTORE_PASSWORD`, `MORPHE_KEYSTORE_ENTRY_ALIAS`, `MORPHE_KEYSTORE_ENTRY_PASSWORD`
- workflow writes injected keystore to `./.keystore/morphe-ci.keystore` and uses it for signing
- local and CI keystores are intentionally different filenames to reduce accidental overwrite risk
- `./.keystore/` is git-ignored, but `./morphe-test.keystore` is not ignored

## Commands
```powershell
# Show help
node .\main.js --help

# Full flow: auto-fetch morphe-cli + patches, resolve/download APK, then patch
node .\main.js --config .\config.toml

# Full flow (dry-run): print planned actions only
node .\main.js --config .\config.toml --dry-run

# Full flow with re-download enabled (APK/.mpp/.jar)
node .\main.js --config .\config.toml --force

# Test morphe-cli jar module only (skip APK/patches)
node .\main.js --config .\config.toml --morphe-cli

# Test morphe-cli jar module only (dry-run)
node .\main.js --config .\config.toml --morphe-cli --dry-run

# Test morphe-cli jar module only and force re-download .jar
node .\main.js --config .\config.toml --morphe-cli --force

# Test APK module only (skip patches module and patch action)
node .\main.js --config .\config.toml --download-only

# Test APK module only (dry-run)
node .\main.js --config .\config.toml --download-only --dry-run

# Test APK module only and force re-download APK
node .\main.js --config .\config.toml --download-only --force

# Test patches module only (download/resolve .mpp only)
node .\main.js --config .\config.toml --patches-only

# Test patches module only (dry-run)
node .\main.js --config .\config.toml --patches-only --dry-run

# Test patches module only and force re-download .mpp
node .\main.js --config .\config.toml --patches-only --force

# Wrapper entry (same behavior as main.js)
node .\scripts\run-auto-patch.js --config .\config.toml
```

Notes:
- `--download-only` will not call patch compatibility logic.  
  If `ver` is empty, provider default/latest version is used.
- `--patches-only` only resolves/downloads patch file and exits before APK flow.
- `--morphe-cli` only resolves/downloads morphe-cli jar and exits before app flow.
- `--morphe-cli`, `--download-only`, `--patches-only` are mutually exclusive (cannot be used together).

## CI/CD (GitHub Actions)
- Workflow file: `.github/workflows/release.yml`
- Trigger:
- `workflow_dispatch` (manual)
- push tag `v*` (example: `v2026.03.30-01`)
- Build environment:
- `ubuntu-latest`
- Node.js 18
- Java 21 (Temurin)
- Release output:
- upload `output/**/*.apk`
- upload `output/release-metadata.json`
- release body from `output/release-notes.md`

Manual run inputs:
- `config_path`: config path (default `config.toml`)
- `release_tag`: custom tag, empty = auto generated
- `release_name`: custom release name
- `force`: append `--force` to build command

GitHub Secrets used by workflow:
- `MORPHE_KEYSTORE_BASE64` (required for fixed CI signing key)
- `MORPHE_KEYSTORE_PASSWORD` (optional, use if your keystore needs it)
- `MORPHE_KEYSTORE_ENTRY_ALIAS` (optional, use if your keystore alias is not default)
- `MORPHE_KEYSTORE_ENTRY_PASSWORD` (optional, use if your entry password differs)
