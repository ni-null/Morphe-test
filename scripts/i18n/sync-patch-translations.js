"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

function parseArgs(argv) {
  const result = {
    cacheDir: "",
    output: "",
    locale: "zh-TW",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "");
    if (arg === "--cache-dir" && i + 1 < argv.length) {
      result.cacheDir = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--output" && i + 1 < argv.length) {
      result.output = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--locale" && i + 1 < argv.length) {
      result.locale = String(argv[i + 1] || "").trim() || "zh-TW";
      i += 1;
      continue;
    }
  }
  return result;
}

const ZH_TW_NAME_MAP = {
  "Alternative thumbnails": "替代縮圖",
  "Ambient mode": "環境模式",
  "Bypass URL redirects": "略過 URL 重新導向",
  "Bypass certificate checks": "略過憑證檢查",
  "Bypass image region restrictions": "略過圖片區域限制",
  "Captions": "字幕",
  "Change form factor": "變更裝置型態",
  "Change header": "變更標頭",
  "Change miniplayer color": "變更迷你播放器顏色",
  "Change package name": "變更套件名稱",
  "Change start page": "變更啟動頁面",
  "Check watch history domain name resolution": "檢查觀看紀錄網域解析",
  "Copy video URL": "複製影片網址",
  "Custom branding": "自訂品牌",
  "Custom branding name for Reddit": "Reddit 自訂品牌名稱",
  "Custom player overlay opacity": "自訂播放器覆蓋層透明度",
  "Disable DRC audio": "停用 DRC 音訊",
  "Disable Play Store updates": "停用 Play 商店更新",
  "Disable QUIC protocol": "停用 QUIC 協定",
  "Disable Shorts resuming on startup": "停用啟動時恢復 Shorts",
  "Disable double tap actions": "停用雙擊動作",
  "Disable haptic feedback": "停用觸覺回饋",
  "Disable layout updates": "停用版面更新",
  "Disable modern home": "停用新版首頁",
  "Disable player popup panels": "停用播放器彈出面板",
  "Disable rolling number animations": "停用數字滾動動畫",
  "Disable screenshot popup": "停用截圖彈窗",
  "Disable sign in to TV popup": "停用登入電視彈窗",
  "Disable video codecs": "停用影片編碼器",
  "Double tap to seek": "雙擊快轉",
  Downloads: "下載",
  "Enable debugging": "啟用除錯",
  "Enable exclusive audio playback": "啟用純音訊播放",
  "Enable forced miniplayer": "啟用強制迷你播放器",
  "Exit fullscreen mode": "離開全螢幕模式",
  "Force original audio": "強制原始音軌",
  "GmsCore support": "GmsCore 支援",
  "Hide 'Get Music Premium'": "隱藏「取得 Music Premium」",
  "Hide Shorts components": "隱藏 Shorts 元件",
  "Hide Trending Today shelf": "隱藏今日熱門區塊",
  "Hide ads": "隱藏廣告",
  "Hide autoplay preview": "隱藏自動播放預覽",
  "Hide buttons": "隱藏按鈕",
  "Hide category bar": "隱藏分類列",
  "Hide end screen cards": "隱藏片尾卡片",
  "Hide end screen suggested video": "隱藏片尾推薦影片",
  "Hide info cards": "隱藏資訊卡片",
  "Hide layout components": "隱藏版面元件",
  "Hide music video ads": "隱藏音樂影片廣告",
  "Hide navigation buttons": "隱藏導覽按鈕",
  "Hide player flyout menu components": "隱藏播放器彈出選單元件",
  "Hide player overlay buttons": "隱藏播放器覆蓋按鈕",
  "Hide recommended communities shelf": "隱藏推薦社群區塊",
  "Hide related video overlay": "隱藏相關影片覆蓋層",
  "Hide related videos": "隱藏相關影片",
  "Hide sidebar components": "隱藏側邊欄元件",
  "Hide timestamp": "隱藏時間戳",
  "Hide video action buttons": "隱藏影片操作按鈕",
  "Loop video": "循環播放影片",
  Miniplayer: "迷你播放器",
  "Miniplayer previous and next buttons": "迷你播放器上一首與下一首按鈕",
  "Navigation bar": "導覽列",
  "Open Shorts in regular player": "以一般播放器開啟 Shorts",
  "Open links directly": "直接開啟連結",
  "Open links externally": "以外部方式開啟連結",
  "Open system share sheet": "開啟系統分享面板",
  "Open videos fullscreen": "以全螢幕開啟影片",
  "Override YouTube Music actions": "覆寫 YouTube Music 動作",
  "Permanent repeat": "永久重複播放",
  "Playback speed": "播放速度",
  "Reload video": "重新載入影片",
  "Remove background playback restrictions": "移除背景播放限制",
  "Remove subreddit dialog": "移除子版對話框",
  "Remove viewer discretion dialog": "移除觀看警示對話框",
  "Return YouTube Dislike": "恢復 YouTube Dislike",
  "Sanitize sharing links": "清理分享連結",
  Seekbar: "進度條",
  "Shorts autoplay": "Shorts 自動播放",
  "Show view count": "顯示觀看次數",
  SponsorBlock: "SponsorBlock",
  "Spoof app version": "偽裝應用版本",
  "Spoof device dimensions": "偽裝裝置尺寸",
  "Spoof signature": "偽裝簽章",
  "Spoof video streams": "偽裝影片串流",
  "Swipe controls": "滑動控制",
  Theme: "主題",
  "Video ads": "影片廣告",
  "Video quality": "影片畫質",
};

const ZH_TW_DESCRIPTION_MAP = {
  "The name of the package to rename the app to.": "要將應用程式重新命名為的套件名稱。",
  "Disables Play Store updates by setting the version code to the maximum allowed. This patch does not work if the app is installed by mounting and may cause unexpected issues with some apps.":
    "透過將版本代碼設為允許的最大值來停用 Play 商店更新。若應用程式以掛載方式安裝，此補丁可能無效，且可能在部分應用程式上造成非預期問題。",
  "Adds options to remove general ads.": "新增移除一般廣告的選項。",
  "Adds an option to remove ads in the video player.": "新增移除播放器內廣告的選項。",
  "Adds options to display buttons in the video player to copy video URLs.": "新增在播放器中顯示按鈕以複製影片網址的選項。",
  "Adds an option to remove the dialog that appears when opening a video that has been age-restricted by accepting it automatically. This does not bypass the age restriction.":
    "新增自動接受年齡限制提示對話框的選項。此功能不會繞過年齡限制。",
  "Adds an option to disable player double tap gestures.": "新增停用播放器雙擊手勢的選項。",
  "Adds additional double-tap to seek values to the YouTube settings menu.": "在 YouTube 設定中新增更多雙擊快轉秒數。",
  "Adds support to download videos with an external downloader app using the in-app download button or a video player action button.":
    "新增透過應用內下載按鈕或播放器動作按鈕，使用外部下載器下載影片的支援。",
  "Adds an option to disable haptic feedback in the player for various actions.": "新增停用播放器各種操作觸覺回饋的選項。",
  "Adds an option to loop videos and display loop video button in the video player.": "新增循環播放影片並在播放器中顯示循環按鈕的選項。",
  "Adds options to display buttons in the video player to reload video.": "新增在播放器中顯示重新載入影片按鈕的選項。",
  "Adds options to disable precise seeking when swiping up on the seekbar, slide to seek instead of playing at 2x speed when pressing and holding, tapping the player seekbar to seek, and hiding the video player seekbar.":
    "新增進度條相關選項：停用上滑精準快轉、長按改為滑動快轉而非 2 倍速、點擊進度條快轉，以及隱藏播放器進度條。",
  "Adds options to enable and configure volume and brightness swipe controls.": "新增啟用與設定音量、亮度滑動控制的選項。",
  "Custom app name.": "自訂應用名稱。",
  "Folder with images to use as a custom header logo.": "用於自訂標頭 Logo 的圖片資料夾。",
  "Adds options to hide action buttons (such as the Download button) under videos.": "新增隱藏影片下方操作按鈕（例如下載按鈕）的選項。",
  "Adds options to hide and change the bottom navigation bar (such as the Shorts button)  and the upper navigation toolbar. Patching version 20.21.37 and lower also adds a setting to use a wide searchbar.":
    "新增隱藏與調整底部導覽列（例如 Shorts 按鈕）及上方工具列的選項。修補 20.21.37 及更低版本時，另提供寬版搜尋列設定。",
  "Adds options to hide the player Cast, Autoplay, Captions, Previous & Next buttons, and the player control buttons background.":
    "新增隱藏播放器投放、自動播放、字幕、上一首/下一首按鈕，以及控制按鈕背景的選項。",
  "Adds options to hide general layout components.": "新增隱藏一般版面元件的選項。",
  "Adds options to hide related videos.": "新增隱藏相關影片的選項。",
  "Adds an option to hide ads that appear while listening to or streaming music videos, podcasts, or songs.":
    "新增隱藏在播放音樂影片、Podcast 或歌曲時出現廣告的選項。",
  "Adds an option to always repeat even if the playlist ends or another track is played.": "新增即使播放清單結束或切換歌曲也持續重複播放的選項。",
  "Adds options to hide the cast, history, notification, and search buttons.": "新增隱藏投放、歷史、通知與搜尋按鈕的選項。",
  "Adds an option to hide the category bar at the top of the homepage.": "新增隱藏首頁頂部分類列的選項。",
  "Adds an option to change the miniplayer background color to match the fullscreen player.": "新增將迷你播放器背景色改為與全螢幕播放器一致的選項。",
  "Adds an option to enable forced miniplayer when switching between music videos, podcasts, or songs.":
    "新增在切換音樂影片、Podcast 或歌曲時強制啟用迷你播放器的選項。",
  "Adds options to show previous and next track buttons in the miniplayer.": "新增在迷你播放器顯示上一首與下一首按鈕的選項。",
  "Adds options to hide navigation bar, labels and buttons.": "新增隱藏導覽列、標籤與按鈕的選項。",
  "Adds an option to hide the \"Get Music Premium\" label in the settings and account menu.": "新增在設定與帳號選單中隱藏「Get Music Premium」標籤的選項。",
  "Adds an option to set which page the app opens in instead of the homepage.": "新增設定應用啟動頁（取代首頁）的選項。",
  "Can be a hex color (#RRGGBB) or a color resource reference.": "可使用十六進位色碼（#RRGGBB）或色彩資源參照。",
  "Bypasses certificate checks which prevent YouTube Music from working on Android Auto.":
    "略過會阻止 YouTube Music 在 Android Auto 運作的憑證檢查。",
  "Adds an option to disable DRC (Dynamic Range Compression) audio.": "新增停用 DRC（動態範圍壓縮）音訊的選項。",
  "Enables the option to play audio without video.": "啟用僅播放音訊（不含影片）的選項。",
  "Adds an option to always use the original audio track.": "新增永遠使用原始音軌的選項。",
  "Removes restrictions on background playback, including playing kids videos in the background.": "移除背景播放限制，包含可在背景播放兒童影片。",
  "Adds options for debugging and exporting Morphe logs to the clipboard.": "新增除錯與將 Morphe 日誌匯出到剪貼簿的選項。",
  "Checks if the device DNS server is preventing user watch history from being saved.": "檢查裝置 DNS 伺服器是否阻止觀看紀錄儲存。",
  "Allows the app to work without root by using a different package name when patched using a GmsCore instead of Google Play Services.":
    "在使用 GmsCore（而非 Google Play 服務）修補時，透過不同套件名稱讓應用程式可在無 root 下運作。",
  "Removes the tracking query parameters from shared links.": "移除分享連結中的追蹤參數。",
  "Adds an option to disable QUIC (Quick UDP Internet Connections) network protocol.": "新增停用 QUIC（Quick UDP Internet Connections）網路協定的選項。",
  "Adds an option to disable panels (such as live chat) from opening automatically.": "新增停用面板（例如即時聊天室）自動開啟的選項。",
  "Adds an option to disable captions from being automatically enabled or to set caption cookies.": "新增停用字幕自動啟用或設定字幕 Cookie 的選項。",
  "Adds an option to disable server side layout updates and use an older UI.": "新增停用伺服器端版面更新並使用舊版 UI 的選項。",
  "Adds an option to change the UI appearance to a phone, tablet, or automotive device.": "新增將 UI 外觀切換為手機、平板或車用裝置的選項。",
  "Adds options to bypass power saving restrictions for Ambient mode and disable it entirely or in fullscreen.": "新增略過 Ambient mode 省電限制，以及在全域或全螢幕停用它的選項。",
  "Adds an option to hide the autoplay preview at the end of videos.": "新增隱藏影片結尾自動播放預覽的選項。",
  "Adds an option to hide suggested video cards at the end of videos.": "新增隱藏影片結尾建議影片卡片的選項。",
  "Adds an option to hide the suggested video at the end of videos.": "新增隱藏影片結尾建議影片的選項。",
  "Adds an option to hide info cards that creators add in the video player.": "新增隱藏創作者在播放器中加入的資訊卡片選項。",
  "Adds options to hide menu components that appear when pressing the gear icon in the video player.": "新增隱藏播放器齒輪圖示選單元件的選項。",
  "Adds an option to hide the related video overlay shown when swiping up in fullscreen.": "新增隱藏全螢幕上滑時顯示之相關影片覆蓋層的選項。",
  "Adds an option to disable rolling number animations of video view count, user likes, and upload time.": "新增停用觀看次數、按讚數與上傳時間數字滾動動畫的選項。",
  "Permanently hides the shortcut to open Shorts when long pressing the app icon in your launcher.": "永久隱藏在啟動器長按 App 圖示時開啟 Shorts 的捷徑。",
  "Adds an option to disable the popup asking to sign into a TV on the same local network.": "新增停用同區域網路電視登入提示彈窗的選項。",
  "Adds an option to hide the timestamp in the bottom left of the video player.": "新增隱藏播放器左下角時間戳的選項。",
  "Adds options to change the in-app minimized player.": "新增調整應用內迷你播放器的選項。",
  "Overrides the YouTube Music button to open Morphe Music directly.": "將 YouTube Music 按鈕改為直接開啟 Morphe Music。",
  "Adds options to automatically exit fullscreen mode when a video reaches the end.": "新增影片播放結束時自動退出全螢幕模式的選項。",
  "Adds an option to open videos in full screen portrait mode.": "新增以直向全螢幕模式開啟影片的選項。",
  "Adds an option to change the opacity of the video player background when player controls are visible.": "新增在顯示播放器控制項時，調整播放器背景透明度的選項。",
  "Adds an option to show the dislike count of videos with Return YouTube Dislike.": "新增透過 Return YouTube Dislike 顯示影片倒讚數的選項。",
  "Adds options to automatically play the next Short.": "新增自動播放下一則 Shorts 的選項。",
  "Adds an option to disable Shorts from resuming on app startup when Shorts were last being watched.": "新增在上次觀看 Shorts 的情況下，停用啟動時自動恢復 Shorts 的選項。",
  "Adds options to open Shorts in the regular video player.": "新增以一般影片播放器開啟 Shorts 的選項。",
  "Adds options to enable and configure SponsorBlock, which can skip undesired video segments such as sponsored content.": "新增啟用與設定 SponsorBlock 的選項，可跳過贊助片段等不想看的內容。",
  "Adds an option to trick YouTube into thinking you are running an older version of the app. This can be used to restore old UI elements and features.": "新增讓 YouTube 誤判為舊版 App 的選項，可用於恢復舊版 UI 元素與功能。",
  "Adds options to replace video thumbnails using the DeArrow API or image captures from the video.": "新增透過 DeArrow API 或影片擷圖替換縮圖的選項。",
  "Adds an option to use a different host for user avatar and channel images and can fix missing images that are blocked in some countries.": "新增使用不同主機載入頭像與頻道圖片的選項，可修復部分國家遭封鎖導致圖片缺失的問題。",
  "Adds an option to spoof the device dimensions which can unlock higher video qualities.": "新增偽裝裝置尺寸的選項，可解鎖更高畫質。",
  "Adds an option to bypass URL redirects and open the original URL directly.": "新增略過 URL 重新導向並直接開啟原始網址的選項。",
  "Adds an option to always open links in your browser instead of the in-app browser.": "新增永遠以外部瀏覽器開啟連結（而非應用內瀏覽器）的選項。",
  "Adds an option to always open the system share sheet instead of the in-app share sheet.": "新增永遠開啟系統分享面板（而非應用內分享面板）的選項。",
  "Adds options to disable HDR and VP9 codecs.": "新增停用 HDR 與 VP9 編碼的選項。",
  "Adds options to set default video qualities and always use the advanced video quality menu.": "新增設定預設影片畫質並永遠使用進階畫質選單的選項。",
  "Adds options to customize available playback speeds, set a default playback speed, and show a speed dialog button in the video player.": "新增自訂可用播放速度、設定預設速度，以及在播放器顯示速度對話框按鈕的選項。",
  "Adds options to hide ads.": "新增隱藏廣告的選項。",
  "The name of the app.": "應用程式名稱。",
  "Adds an option to hide the recommended communities shelves in subreddits.": "新增隱藏子版區中的推薦社群區塊選項。",
  "Adds an option to disable the modern home UI.": "新增停用現代版首頁 UI 的選項。",
  "Adds options to hide buttons in the navigation bar.": "新增隱藏導覽列按鈕的選項。",
  "Adds an option to disable the popup that appears when taking a screenshot.": "新增停用截圖時出現彈窗的選項。",
  "Adds options to hide the sidebar components.": "新增隱藏側邊欄元件的選項。",
  "Adds options to remove the NSFW community warning and notifications suggestion dialogs by dismissing them automatically.": "新增自動關閉 NSFW 社群警告與通知建議對話框的選項。",
  "Adds an option to hide the Trending Today shelf from search suggestions.": "新增從搜尋建議中隱藏 Trending Today 區塊的選項。",
  "Adds an option to show the view count of Posts.": "新增顯示貼文瀏覽次數的選項。",
  "Spoofs the signature of the app to fix notification issues.": "偽裝應用程式簽章以修復通知問題。",
  "Adds an option to skip over redirection URLs in external links.": "新增在外部連結中跳過重新導向網址的選項。",
  "Adds an option to sanitize sharing links by removing tracking query parameters.": "新增透過移除追蹤參數來清理分享連結的選項。"
};

function getDefaultCacheDir() {
  const localAppData = process.env.LOCALAPPDATA || "";
  if (localAppData) {
    return path.join(localAppData, "MorphePatcher", "workspace", "cache", "patch-entries");
  }
  const home = process.env.HOME || "";
  if (home) {
    const wslCandidate = path.join(home, "AppData", "Local", "MorphePatcher", "workspace", "cache", "patch-entries");
    if (fs.existsSync(wslCandidate)) return wslCandidate;
  }
  const mntUsersRoot = "/mnt/c/Users";
  if (fs.existsSync(mntUsersRoot)) {
    try {
      const users = fs.readdirSync(mntUsersRoot, { withFileTypes: true });
      for (const user of users) {
        if (!user.isDirectory()) continue;
        const candidate = path.join(
          mntUsersRoot,
          user.name,
          "AppData",
          "Local",
          "MorphePatcher",
          "workspace",
          "cache",
          "patch-entries",
        );
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch {
      // ignore
    }
  }
  return "";
}

function getDefaultOutputPath() {
  const webRoot = path.resolve(__dirname, "..", "..", "desktop", "web");
  return path.join(webRoot, "i18n", "patches", "_global.json");
}

async function readJsonSafe(filePath) {
  try {
    const content = await fsp.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function collectPatchPairs(cacheDir) {
  const out = [];
  const seen = new Set();
  const items = await fsp.readdir(cacheDir, { withFileTypes: true });
  for (const item of items) {
    if (!item.isFile()) continue;
    if (!item.name.toLowerCase().endsWith(".json")) continue;
    const filePath = path.join(cacheDir, item.name);
    const parsed = await readJsonSafe(filePath);
    const entries = parsed && Array.isArray(parsed.entries) ? parsed.entries : [];
    for (const entry of entries) {
      const name = String(entry && entry.name ? entry.name : "").trim();
      const description = String(entry && entry.description ? entry.description : "").trim();
      if (!name) continue;
      const key = JSON.stringify([name, description]);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, description });
    }
  }
  return out;
}

function normalizePatchKey(name) {
  return String(name || "").trim().toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cacheDir = args.cacheDir || getDefaultCacheDir();
  const locale = args.locale || "zh-TW";
  const outputPath = args.output || getDefaultOutputPath();

  if (!cacheDir) {
    throw new Error("cache dir is empty. Use --cache-dir.");
  }
  const stat = await fsp.stat(cacheDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`cache dir not found: ${cacheDir}`);
  }

  const pairs = await collectPatchPairs(cacheDir);
  const currentDoc = (await readJsonSafe(outputPath)) || {};
  const patches = currentDoc && typeof currentDoc.patches === "object" && currentDoc.patches
    ? { ...currentDoc.patches }
    : {};

  let added = 0;
  let updated = 0;
  for (const pair of pairs) {
    const key = normalizePatchKey(pair.name);
    if (!key) continue;
    const currentEntry = patches[key] && typeof patches[key] === "object" ? patches[key] : {};
    const currentNameMap = currentEntry.name && typeof currentEntry.name === "object" ? { ...currentEntry.name } : {};
    const currentDescriptions = currentEntry.descriptions && typeof currentEntry.descriptions === "object"
      ? { ...currentEntry.descriptions }
      : {};

    const translatedName = locale === "zh-TW" ? (ZH_TW_NAME_MAP[pair.name] || pair.name) : pair.name;
    const beforeEntry = JSON.stringify(currentEntry);

    currentNameMap.en = String(currentNameMap.en || pair.name).trim() || pair.name;
    currentNameMap[locale] = String(translatedName || pair.name).trim() || pair.name;

    if (pair.description) {
      const descKey = String(pair.description);
      const currentDescMap = currentDescriptions[descKey] && typeof currentDescriptions[descKey] === "object"
        ? { ...currentDescriptions[descKey] }
        : {};
      currentDescMap.en = String(currentDescMap.en || pair.description).trim() || pair.description;
      const translatedDescription =
        locale === "zh-TW" ? (ZH_TW_DESCRIPTION_MAP[pair.description] || pair.description) : pair.description;
      currentDescMap[locale] = String(translatedDescription || pair.description).trim() || pair.description;
      currentDescriptions[descKey] = currentDescMap;
    }

    const nextEntry = {
      ...currentEntry,
      name: currentNameMap,
      descriptions: currentDescriptions,
    };
    patches[key] = nextEntry;

    if (beforeEntry === "{}") {
      added += 1;
    } else if (beforeEntry !== JSON.stringify(nextEntry)) {
      updated += 1;
    }
  }

  const normalizedDoc = {
    patches: Object.fromEntries(
      Object.entries(patches).sort((a, b) => a[0].localeCompare(b[0])),
    ),
  };
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, `${JSON.stringify(normalizedDoc, null, 2)}\n`, "utf8");

  const missingDescriptions = [];
  for (const pair of pairs) {
    if (!pair.description) continue;
    const key = normalizePatchKey(pair.name);
    const entry = normalizedDoc.patches[key] && typeof normalizedDoc.patches[key] === "object"
      ? normalizedDoc.patches[key]
      : null;
    const descriptions = entry && entry.descriptions && typeof entry.descriptions === "object"
      ? entry.descriptions
      : {};
    const localizedMap = descriptions[pair.description] && typeof descriptions[pair.description] === "object"
      ? descriptions[pair.description]
      : {};
    const translatedDescription = String(localizedMap[locale] || "").trim();
    if (!translatedDescription || translatedDescription === pair.description) {
      missingDescriptions.push({
        name: pair.name,
        description: pair.description,
      });
    }
  }
  const missingPath = path.join(path.dirname(path.dirname(outputPath)), "tools", `patch-translations.missing.${locale}.json`);
  await fsp.mkdir(path.dirname(missingPath), { recursive: true });
  await fsp.writeFile(
    missingPath,
    `${JSON.stringify(
      {
        locale,
        generatedAt: new Date().toISOString(),
        missingCount: missingDescriptions.length,
        items: missingDescriptions,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Patch translation sync done. locale=${locale}`);
  console.log(`cacheDir=${cacheDir}`);
  console.log(`output=${outputPath}`);
  console.log(`pairs=${pairs.length}, added=${added}, updated=${updated}`);
  console.log(`missingDescriptions=${missingDescriptions.length}`);
  console.log(`missingReport=${missingPath}`);
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
